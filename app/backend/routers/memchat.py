"""Chat + memory system API.

Flow per turn:
  1. POST /prepare  -> persist user message, assemble rules + recalled memories + session window.
  2. Frontend streams the reply with deepseek-v4-pro using the returned messages.
  3. POST /finalize -> persist assistant message, run memory extraction (deepseek-v4-flash)
     with dedupe / conflict resolution, return transparent memory events.
"""

import json
import logging
from typing import Any, Literal, Optional

from core.database import get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Query
from models.chat_messages import ChatMessages
from models.conversations import Conversations
from models.memories import Memories
from models.memory_rules import MemoryRules
from pydantic import BaseModel, Field
from schemas.auth import UserResponse
from services import memory_engine as me
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/memchat", tags=["memchat"])

Mode = Literal["off", "use", "learn"]


class PrepareRequest(BaseModel):
    conversation_id: Optional[int] = None
    message: str = Field(..., min_length=1, max_length=4000)


class FinalizeRequest(BaseModel):
    conversation_id: int
    user_message: str
    assistant_message: str
    recalled: list[dict[str, Any]] = []


class ModeRequest(BaseModel):
    mode: Mode


class MemoryInput(BaseModel):
    title: str = Field(..., min_length=1, max_length=40)
    scene: str = ""
    content: str = Field(..., min_length=1, max_length=300)
    category: str = "偏好"


class RuleInput(BaseModel):
    content: str = Field(..., min_length=1, max_length=300)
    enabled: bool = True


def _conv_dict(c: Conversations) -> dict[str, Any]:
    return {"id": c.id, "title": c.title, "last_active": c.last_active}


def _rule_dict(r: MemoryRules) -> dict[str, Any]:
    return {"id": r.id, "content": r.content, "enabled": bool(r.enabled), "create_time": r.create_time}


async def _own_conversation(db: AsyncSession, user_id: str, conversation_id: int) -> Conversations:
    conv = await db.get(Conversations, conversation_id)
    if not conv or conv.user_id != user_id:
        raise HTTPException(status_code=404, detail="会话不存在")
    return conv


async def _own_memory(db: AsyncSession, user_id: str, memory_id: int) -> Memories:
    m = await db.get(Memories, memory_id)
    if not m or m.user_id != user_id or m.status != "active":
        raise HTTPException(status_code=404, detail="记忆不存在")
    return m


# ------------------------------------------------------------------ chat turn


@router.post("/prepare")
async def prepare(data: PrepareRequest, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ts = me.now_iso()
    text = data.message.strip()
    if data.conversation_id:
        conv = await _own_conversation(db, user.id, data.conversation_id)
        conv.last_active = ts
    else:
        conv = Conversations(user_id=user.id, title=text[:24] or "新对话", last_active=ts)
        db.add(conv)
        await db.flush()

    mode = await me.get_mode(db, user.id)
    rules = await me.get_rules(db, user.id)
    recalled = await me.retrieve(db, user.id, text) if mode != "off" else []
    history = await me.session_history(db, user.id, conv.id)
    db.add(ChatMessages(user_id=user.id, conversation_id=conv.id, role="user", content=text, create_time=ts))
    await db.commit()

    system = me.build_system_prompt(rules, recalled, mode)
    messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": text}]
    return {
        "conversation": _conv_dict(conv),
        "messages": messages,
        "model": me.CHAT_MODEL,
        "mode": mode,
        "rules_count": len(rules),
        "session_window": len(history),
        "recalled": recalled,
    }


@router.post("/finalize")
async def finalize(data: FinalizeRequest, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _own_conversation(db, user.id, data.conversation_id)
    mode = await me.get_mode(db, user.id)
    explicit = me.is_explicit(data.user_message)
    msg = ChatMessages(
        user_id=user.id,
        conversation_id=data.conversation_id,
        role="assistant",
        content=data.assistant_message or "（无回复）",
        create_time=me.now_iso(),
    )
    db.add(msg)
    pool = await me.active_memories(db, user.id) if mode == "learn" else []
    candidates = me.pick_candidates(pool, data.user_message)
    await db.commit()

    events: dict[str, Any] = {
        "mode": mode,
        "explicit": explicit,
        "recalled": [{k: r.get(k) for k in ("memory_id", "title", "content", "category", "reason")} for r in data.recalled],
        "created": [],
        "updated": [],
        "deleted": [],
        "notice": "",
    }
    if mode == "learn":
        try:
            ops = await me.extract_operations(data.user_message, data.assistant_message, candidates, explicit)
            applied = await me.apply_operations(db, user.id, data.conversation_id, ops, explicit)
            events.update(applied)
            if not ops:
                events["notice"] = "本轮没有值得长期保存的信息"
        except Exception as exc:  # extraction must never break the chat turn
            logger.warning("memory extraction failed: %s", exc)
            await db.rollback()
            events["notice"] = "记忆提取暂时失败，本轮未写入记忆"
    elif explicit:
        events["notice"] = "记忆为只读模式，未写入" if mode == "use" else "记忆已关闭，未写入"

    saved = await db.get(ChatMessages, msg.id)
    if saved:
        saved.memory_events = json.dumps(events, ensure_ascii=False)
        await db.commit()
    return {"message_id": msg.id, "events": events}


# ------------------------------------------------------------------ conversations


@router.get("/conversations")
async def list_conversations(user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.scalars(
            select(Conversations).where(Conversations.user_id == user.id).order_by(Conversations.last_active.desc(), Conversations.id.desc())
        )
    ).all()
    return {"items": [_conv_dict(c) for c in rows]}


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _own_conversation(db, user.id, conversation_id)
    rows = (
        await db.scalars(
            select(ChatMessages)
            .where(ChatMessages.user_id == user.id, ChatMessages.conversation_id == conversation_id)
            .order_by(ChatMessages.id)
        )
    ).all()
    items = []
    for r in rows:
        try:
            ev = json.loads(r.memory_events) if r.memory_events else None
        except json.JSONDecodeError:
            ev = None
        items.append({"id": r.id, "role": r.role, "content": r.content, "events": ev})
    return {"items": items}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conv = await _own_conversation(db, user.id, conversation_id)
    await db.execute(delete(ChatMessages).where(ChatMessages.user_id == user.id, ChatMessages.conversation_id == conversation_id))
    await db.delete(conv)
    await db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ settings


@router.get("/settings")
async def get_settings(user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    mode = await me.get_mode(db, user.id)
    await db.commit()
    return {"mode": mode}


@router.put("/settings")
async def put_settings(data: ModeRequest, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"mode": await me.set_mode(db, user.id, data.mode)}


# ------------------------------------------------------------------ memories


@router.get("/memories")
async def list_memories(
    q: str = Query(""),
    category: str = Query(""),
    user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await me.active_memories(db, user.id)
    if category:
        rows = [m for m in rows if m.category == category]
    if q.strip():
        kw = q.strip().lower()
        rows = [m for m in rows if kw in f"{m.title}{m.scene or ''}{m.content}".lower()]
    rows.sort(key=lambda m: m.update_time or "", reverse=True)
    return {"items": [{**me.memory_dict(m), "hit_count": m.hit_count or 0} for m in rows]}


def _validate_category(category: str) -> str:
    if category not in me.CATEGORIES:
        raise HTTPException(status_code=400, detail=f"分类必须是 {'/'.join(me.CATEGORIES)} 之一")
    return category


@router.post("/memories")
async def create_memory(data: MemoryInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ts = me.now_iso()
    m = Memories(
        user_id=user.id,
        title=data.title.strip(),
        scene=data.scene.strip(),
        content=data.content.strip(),
        category=_validate_category(data.category),
        confidence=1.0,
        source="manual",
        status="active",
        hit_count=0,
        create_time=ts,
        update_time=ts,
    )
    db.add(m)
    await db.commit()
    return me.memory_dict(m)


@router.put("/memories/{memory_id}")
async def update_memory(memory_id: int, data: MemoryInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await _own_memory(db, user.id, memory_id)
    m.title = data.title.strip()
    m.scene = data.scene.strip()
    m.content = data.content.strip()
    m.category = _validate_category(data.category)
    m.confidence = 1.0
    m.source = "manual"
    m.update_time = me.now_iso()
    await db.commit()
    return me.memory_dict(m)


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    m = await _own_memory(db, user.id, memory_id)
    m.status = "deleted"
    m.update_time = me.now_iso()
    await db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ rules (steering)


@router.get("/rules")
async def list_rules(user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(MemoryRules).where(MemoryRules.user_id == user.id).order_by(MemoryRules.id))).all()
    return {"items": [_rule_dict(r) for r in rows]}


@router.post("/rules")
async def create_rule(data: RuleInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = MemoryRules(user_id=user.id, content=data.content.strip(), enabled=data.enabled, create_time=me.now_iso())
    db.add(r)
    await db.commit()
    return _rule_dict(r)


async def _own_rule(db: AsyncSession, user_id: str, rule_id: int) -> MemoryRules:
    r = await db.get(MemoryRules, rule_id)
    if not r or r.user_id != user_id:
        raise HTTPException(status_code=404, detail="规则不存在")
    return r


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, data: RuleInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await _own_rule(db, user.id, rule_id)
    r.content = data.content.strip()
    r.enabled = data.enabled
    await db.commit()
    return _rule_dict(r)


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await _own_rule(db, user.id, rule_id)
    await db.delete(r)
    await db.commit()
    return {"ok": True}
