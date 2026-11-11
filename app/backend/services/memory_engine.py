"""Three-layer memory engine: rules (steering), session history, long-term memories.

Pipeline: extract -> write (dedupe / conflict resolution) -> retrieve -> inject into prompt.
"""

import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

from models.chat_messages import ChatMessages
from models.memories import Memories
from models.memory_rules import MemoryRules
from models.memory_settings import MemorySettings
from schemas.aihub import ChatMessage, GenTxtRequest
from services.aihub import AIHubService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CHAT_MODEL = "deepseek-v4-pro"
MEMORY_MODEL = "deepseek-v4-flash"

CATEGORIES = ["偏好", "个人背景", "项目信息", "约定"]
PROFILE_CATEGORIES = {"偏好", "个人背景", "约定"}
MODES = {"off", "use", "learn"}
DEFAULT_MODE = "learn"

EXPLICIT_CONFIDENCE = 0.95
IMPLICIT_CONFIDENCE = 0.7
SESSION_WINDOW = 12
PROFILE_LIMIT = 4
RELEVANT_LIMIT = 4
RELEVANCE_THRESHOLD = 0.12

EXPLICIT_PATTERN = re.compile(r"(记住|记一下|帮我记|请记|别忘了|忘掉|忘记|不要再记|删掉.{0,6}记忆)")
SENSITIVE_PATTERN = re.compile(r"(\d{11,}|密码|身份证|银行卡|验证码|password)", re.IGNORECASE)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- settings / rules


async def get_mode(db: AsyncSession, user_id: str) -> str:
    rows = (await db.scalars(select(MemorySettings).where(MemorySettings.user_id == user_id).order_by(MemorySettings.id))).all()
    if rows:
        return rows[0].mode if rows[0].mode in MODES else DEFAULT_MODE
    db.add(MemorySettings(user_id=user_id, mode=DEFAULT_MODE))
    await db.flush()
    return DEFAULT_MODE


async def set_mode(db: AsyncSession, user_id: str, mode: str) -> str:
    rows = (await db.scalars(select(MemorySettings).where(MemorySettings.user_id == user_id).order_by(MemorySettings.id))).all()
    if rows:
        rows[0].mode = mode
    else:
        db.add(MemorySettings(user_id=user_id, mode=mode))
    await db.commit()
    return mode


async def get_rules(db: AsyncSession, user_id: str) -> list[str]:
    rows = (
        await db.scalars(
            select(MemoryRules).where(MemoryRules.user_id == user_id, MemoryRules.enabled.is_(True)).order_by(MemoryRules.id)
        )
    ).all()
    return [r.content.strip() for r in rows if r.content and r.content.strip()]


# ---------------------------------------------------------------- retrieval


def _bigrams(text: str) -> set[str]:
    text = re.sub(r"\s+", "", text.lower())
    words = set(re.findall(r"[a-z0-9]{2,}", text))
    cjk = re.sub(r"[^\u4e00-\u9fff]", "", text)
    return words | {cjk[i : i + 2] for i in range(len(cjk) - 1)}


def relevance(query: str, memory: Memories) -> float:
    q = _bigrams(query)
    m = _bigrams(f"{memory.title} {memory.scene or ''} {memory.content}")
    if not q or not m:
        return 0.0
    return len(q & m) / math.sqrt(len(q) * len(m))


def memory_dict(m: Memories) -> dict[str, Any]:
    return {
        "memory_id": m.id,
        "title": m.title,
        "scene": m.scene or "",
        "content": m.content,
        "category": m.category,
        "confidence": round(m.confidence or 0, 2),
        "source": m.source or "",
        "source_session_id": m.source_session_id,
        "status": m.status,
        "create_time": m.create_time,
        "update_time": m.update_time,
    }


async def active_memories(db: AsyncSession, user_id: str) -> list[Memories]:
    return list(
        (await db.scalars(select(Memories).where(Memories.user_id == user_id, Memories.status == "active"))).all()
    )


async def retrieve(db: AsyncSession, user_id: str, query: str) -> list[dict[str, Any]]:
    """Structured filter first (active + profile tier), relevance scoring second."""
    pool = await active_memories(db, user_id)
    picked: dict[int, dict[str, Any]] = {}

    profile = sorted(
        (m for m in pool if m.category in PROFILE_CATEGORIES and (m.confidence or 0) >= 0.8),
        key=lambda m: (m.confidence or 0, m.update_time or ""),
        reverse=True,
    )[:PROFILE_LIMIT]
    for m in profile:
        picked[m.id] = {**memory_dict(m), "reason": "常驻画像", "score": 1.0}

    scored = sorted(
        ((relevance(query, m) * (0.6 + 0.4 * (m.confidence or 0)), m) for m in pool if m.id not in picked),
        key=lambda x: x[0],
        reverse=True,
    )
    for score, m in scored[:RELEVANT_LIMIT]:
        if score >= RELEVANCE_THRESHOLD:
            picked[m.id] = {**memory_dict(m), "reason": f"相关度 {score:.2f}", "score": round(score, 2)}

    for m in pool:
        if m.id in picked:
            m.hit_count = (m.hit_count or 0) + 1
    return list(picked.values())


async def session_history(db: AsyncSession, user_id: str, conversation_id: int) -> list[dict[str, str]]:
    rows = (
        await db.scalars(
            select(ChatMessages)
            .where(ChatMessages.user_id == user_id, ChatMessages.conversation_id == conversation_id)
            .order_by(ChatMessages.id.desc())
            .limit(SESSION_WINDOW)
        )
    ).all()
    return [{"role": r.role, "content": r.content} for r in reversed(rows)]


def build_system_prompt(rules: list[str], memories: list[dict[str, Any]], mode: str) -> str:
    parts = [
        "你是 Atoms 的 AI 助手，回答清晰、友好、务实。默认使用用户的语言回复。",
    ]
    if rules:
        parts.append("## 用户规则（Steering，全局生效，必须遵守）\n" + "\n".join(f"- {r}" for r in rules))
    if mode != "off" and memories:
        lines = [f"- [{m['category']}] {m['title']}：{m['content']}（适用：{m['scene'] or '通用'}）" for m in memories]
        parts.append(
            "## 关于用户的长期记忆（跨会话召回）\n"
            + "\n".join(lines)
            + "\n在相关时自然地利用这些信息个性化回答，不要逐条复述，也不要编造记忆中没有的信息。"
        )
    if mode == "learn":
        parts.append("如果用户要求记住或忘记某事，简短确认即可，系统会自动处理记忆写入。")
    elif mode == "use":
        parts.append("当前记忆为只读模式：如果用户要求记住新信息，请告知需要在记忆设置中开启“自动学习”。")
    else:
        parts.append("当前记忆功能已关闭：如果用户要求记住信息，请告知需要在记忆设置中开启。")
    return "\n\n".join(parts)


# ---------------------------------------------------------------- extraction


EXTRACT_SYSTEM = f"""你是记忆管理器，负责从一轮对话中提炼“稳定、长期有效”的用户信息并维护记忆库。只输出 JSON。

适合存：固定偏好、身份/职业背景、长期目标、软硬件环境、持续进行的项目、重要约定、用户纠正过的做法。
不要存：临时计算结果、单次问题、一次性查询、闲聊、实时信息、助手自己的观点、敏感隐私（证件号、密码、银行卡、精确住址、手机号、健康隐私等）。
用户显式说“记住/记一下”时应当创建或更新；说“忘掉/不要记”时删除对应记忆。

每条记忆是提炼后的结构化事实，不复制原文：
- title：不超过 12 字的标题
- scene：适用场景描述（何时该用这条记忆），不超过 30 字
- content：精炼事实，第三人称“用户……”，不超过 60 字
- category：{" / ".join(CATEGORIES)} 之一

去重与冲突：对照“已有记忆”。语义重复 → skip；补充或矛盾（新信息更新了旧事实）→ update 并给出 target_id，内容以新信息为准；要求遗忘 → delete 并给出 target_id。

输出格式：
{{"operations":[{{"op":"create|update|delete","target_id":null,"title":"","scene":"","content":"","category":"偏好","explicit":false,"reason":"简短理由"}}]}}
没有值得记的信息时输出 {{"operations":[]}}。最多 3 条操作。"""


def _extract_json(text: str) -> str:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start >= 0 and end > start else text


def parse_operations(text: str, valid_ids: set[int]) -> list[dict[str, Any]]:
    try:
        payload = json.loads(_extract_json(text))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc.msg}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("operations"), list):
        raise ValueError("root must be an object with an operations array")
    ops: list[dict[str, Any]] = []
    for i, op in enumerate(payload["operations"][:3]):
        if not isinstance(op, dict) or op.get("op") not in {"create", "update", "delete", "skip"}:
            raise ValueError(f"operations[{i}].op invalid")
        if op["op"] == "skip":
            continue
        if op["op"] in {"update", "delete"}:
            try:
                op["target_id"] = int(op.get("target_id"))
            except (TypeError, ValueError) as exc:
                raise ValueError(f"operations[{i}].target_id required") from exc
            if op["target_id"] not in valid_ids:
                continue
        if op["op"] in {"create", "update"}:
            for key in ("title", "content"):
                if not isinstance(op.get(key), str) or not op[key].strip():
                    raise ValueError(f"operations[{i}].{key} must be non-empty")
            if op.get("category") not in CATEGORIES:
                op["category"] = "偏好"
            op["scene"] = str(op.get("scene") or "")
        op["explicit"] = bool(op.get("explicit"))
        ops.append(op)
    return ops


async def extract_operations(user_msg: str, assistant_msg: str, candidates: list[Memories], explicit: bool) -> list[dict[str, Any]]:
    existing = [
        {"id": m.id, "title": m.title, "content": m.content, "category": m.category} for m in candidates
    ]
    user_prompt = (
        f"已有记忆：{json.dumps(existing, ensure_ascii=False)}\n\n"
        f"检测到显式记忆指令：{'是' if explicit else '否'}\n\n"
        f"用户：{user_msg}\n\n助手：{assistant_msg[:1500]}"
    )
    service = AIHubService()
    request = GenTxtRequest(
        messages=[ChatMessage(role="system", content=EXTRACT_SYSTEM), ChatMessage(role="user", content=user_prompt)],
        model=MEMORY_MODEL,
        temperature=0.1,
        max_tokens=1024,
    )
    valid_ids = {m.id for m in candidates}
    response = await service.gentxt(request)
    try:
        return parse_operations(response.content, valid_ids)
    except ValueError as first_error:
        repair = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content="只输出修正后的 JSON。"),
                ChatMessage(
                    role="user",
                    content=f'期望格式：{{"operations":[{{"op":"create|update|delete","target_id":null,"title":"","scene":"","content":"","category":"偏好","explicit":false,"reason":""}}]}}\n'
                    f"错误：{first_error}\n原始输出：{response.content}",
                ),
            ],
            model=MEMORY_MODEL,
            temperature=0,
            max_tokens=1024,
        )
        repaired = await service.gentxt(repair)
        return parse_operations(repaired.content, valid_ids)


def pick_candidates(pool: list[Memories], text: str, limit: int = 12) -> list[Memories]:
    if len(pool) <= limit:
        return pool
    return [m for _, m in sorted(((relevance(text, m), m) for m in pool), key=lambda x: x[0], reverse=True)[:limit]]


async def apply_operations(
    db: AsyncSession, user_id: str, conversation_id: int, ops: list[dict[str, Any]], explicit: bool
) -> dict[str, list[dict[str, Any]]]:
    events: dict[str, list[dict[str, Any]]] = {"created": [], "updated": [], "deleted": []}
    ts = now_iso()
    for op in ops:
        is_explicit = explicit or op["explicit"]
        confidence = EXPLICIT_CONFIDENCE if is_explicit else IMPLICIT_CONFIDENCE
        if SENSITIVE_PATTERN.search(op.get("content", "")) and op["op"] != "delete":
            continue
        if op["op"] == "create":
            m = Memories(
                user_id=user_id,
                title=op["title"].strip()[:40],
                scene=op["scene"].strip()[:120],
                content=op["content"].strip()[:300],
                category=op["category"],
                confidence=confidence,
                source="explicit" if is_explicit else "implicit",
                source_session_id=conversation_id,
                status="active",
                hit_count=0,
                create_time=ts,
                update_time=ts,
            )
            db.add(m)
            await db.flush()
            events["created"].append({**memory_dict(m), "reason": op.get("reason", "")})
            continue
        m = await db.get(Memories, op["target_id"])
        if not m or m.user_id != user_id or m.status != "active":
            continue
        if op["op"] == "update":
            before = m.content
            m.title = op["title"].strip()[:40]
            m.scene = op["scene"].strip()[:120] or m.scene
            m.content = op["content"].strip()[:300]
            m.category = op["category"]
            m.confidence = max(m.confidence or 0, confidence)
            m.source = "explicit" if is_explicit else (m.source or "implicit")
            m.source_session_id = conversation_id
            m.update_time = ts
            events["updated"].append({**memory_dict(m), "before": before, "reason": op.get("reason", "")})
        else:
            m.status = "deleted"
            m.update_time = ts
            events["deleted"].append({**memory_dict(m), "reason": op.get("reason", "")})
    await db.commit()
    return events


def is_explicit(text: str) -> bool:
    return bool(EXPLICIT_PATTERN.search(text))
