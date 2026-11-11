"""Project workspace API: projects, memory binding, pipeline runs and versions.

Pipeline (lead -> developer with self-check) runs as a background task with its own
DB sessions; the frontend polls run detail to visualise each stage in real time.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.database import db_manager, get_db
from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from models.memories import Memories
from models.project_memory_links import ProjectMemoryLinks
from models.project_messages import ProjectMessages
from models.project_runs import ProjectRuns
from models.projects import Projects
from pydantic import BaseModel, Field
from schemas.auth import UserResponse
from services import memory_engine as me
from services import project_pipeline as pp
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

STALE_AFTER = timedelta(minutes=15)
_background_tasks: set[asyncio.Task] = set()


class ProjectInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    goal: str = Field("", max_length=2000)
    background: str = Field("", max_length=4000)
    acceptance: str = Field("", max_length=4000)


class LinkInput(BaseModel):
    memory_id: int


class RunRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)


def _load(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _project_dict(p: Projects, link_count: int = 0, latest: Optional[ProjectRuns] = None) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "goal": p.goal or "",
        "background": p.background or "",
        "acceptance": p.acceptance or "",
        "create_time": p.create_time,
        "update_time": p.update_time,
        "memory_count": link_count,
        "latest_version": latest.version if latest else 0,
        "latest_status": latest.status if latest else None,
    }


def _run_detail(r: ProjectRuns) -> dict[str, Any]:
    dev = _load(r.dev_output)
    return {
        "id": r.id,
        "project_id": r.project_id,
        "version": r.version,
        "prompt": r.prompt,
        "status": r.status,
        "stage": r.stage,
        "fix_rounds": r.fix_rounds or 0,
        "error": r.error or "",
        "create_time": r.create_time,
        "update_time": r.update_time,
        "lead_output": _load(r.lead_output),
        "dev_output": {k: v for k, v in dev.items() if k != "files"} if isinstance(dev, dict) else None,
        "files": _load(r.files) or {},
        "memory_events": _load(r.memory_events),
    }


def _is_stale(r: ProjectRuns) -> bool:
    if r.status != "running" or not r.update_time:
        return False
    try:
        return datetime.now(timezone.utc) - datetime.fromisoformat(r.update_time) > STALE_AFTER
    except ValueError:
        return False


async def _own_project(db: AsyncSession, user_id: str, project_id: int) -> Projects:
    p = await db.get(Projects, project_id)
    if not p or p.user_id != user_id:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p


async def _project_runs(db: AsyncSession, user_id: str, project_id: int) -> list[ProjectRuns]:
    rows = (
        await db.scalars(
            select(ProjectRuns)
            .where(ProjectRuns.project_id == project_id, ProjectRuns.user_id == user_id)
            .order_by(ProjectRuns.version)
        )
    ).all()
    changed = False
    for r in rows:
        if _is_stale(r):
            r.status, r.stage, r.error = "failed", "failed", "执行中断（服务重启或超时），请重新发起"
            changed = True
    if changed:
        await db.commit()
    return list(rows)


async def _links(db: AsyncSession, user_id: str, project_id: int) -> list[ProjectMemoryLinks]:
    return list(
        (
            await db.scalars(
                select(ProjectMemoryLinks).where(
                    ProjectMemoryLinks.project_id == project_id, ProjectMemoryLinks.user_id == user_id
                )
            )
        ).all()
    )


# ------------------------------------------------------------------ projects


@router.get("")
async def list_projects(user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.scalars(
            select(Projects).where(Projects.user_id == user.id).order_by(Projects.update_time.desc(), Projects.id.desc())
        )
    ).all()
    links = (await db.scalars(select(ProjectMemoryLinks).where(ProjectMemoryLinks.user_id == user.id))).all()
    counts: dict[int, int] = {}
    for link in links:
        counts[link.project_id] = counts.get(link.project_id, 0) + 1
    runs = (await db.scalars(select(ProjectRuns).where(ProjectRuns.user_id == user.id).order_by(ProjectRuns.version))).all()
    latest = {r.project_id: r for r in runs}
    return {"items": [_project_dict(p, counts.get(p.id, 0), latest.get(p.id)) for p in rows]}


@router.post("")
async def create_project(data: ProjectInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ts = pp.now_iso()
    p = Projects(
        user_id=user.id,
        name=data.name.strip(),
        goal=data.goal.strip(),
        background=data.background.strip(),
        acceptance=data.acceptance.strip(),
        create_time=ts,
        update_time=ts,
    )
    db.add(p)
    await db.commit()
    return _project_dict(p)


@router.get("/role-specs")
async def role_specs():
    return {"items": pp.PROJECT_ROLE_SPECS}


@router.get("/{project_id}")
async def get_project(project_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    links = await _links(db, user.id, project_id)
    runs = await _project_runs(db, user.id, project_id)
    return {
        "project": _project_dict(p, len(links), runs[-1] if runs else None),
        "runs": [_run_detail(r) for r in runs],
    }


@router.put("/{project_id}")
async def update_project(project_id: int, data: ProjectInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    p.name = data.name.strip()
    p.goal = data.goal.strip()
    p.background = data.background.strip()
    p.acceptance = data.acceptance.strip()
    p.update_time = pp.now_iso()
    await db.commit()
    return _project_dict(p)


@router.delete("/{project_id}")
async def delete_project(project_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    for model in (ProjectMemoryLinks, ProjectRuns, ProjectMessages):
        await db.execute(delete(model).where(model.project_id == project_id, model.user_id == user.id))
    await db.delete(p)
    await db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ memory binding


@router.get("/{project_id}/memories")
async def project_memories(project_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _own_project(db, user.id, project_id)
    relation = {link.memory_id: link.relation for link in await _links(db, user.id, project_id)}
    pool = await me.active_memories(db, user.id)
    pool.sort(key=lambda m: (m.id not in relation, m.update_time or ""), reverse=False)
    return {
        "items": [
            {**me.memory_dict(m), "linked": m.id in relation, "relation": relation.get(m.id)} for m in pool
        ]
    }


@router.post("/{project_id}/memories")
async def link_memory(project_id: int, data: LinkInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _own_project(db, user.id, project_id)
    m = await db.get(Memories, data.memory_id)
    if not m or m.user_id != user.id or m.status != "active":
        raise HTTPException(status_code=404, detail="记忆不存在")
    if any(link.memory_id == data.memory_id for link in await _links(db, user.id, project_id)):
        return {"ok": True}
    db.add(ProjectMemoryLinks(user_id=user.id, project_id=project_id, memory_id=data.memory_id, relation="bound", create_time=pp.now_iso()))
    await db.commit()
    return {"ok": True}


@router.delete("/{project_id}/memories/{memory_id}")
async def unlink_memory(project_id: int, memory_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _own_project(db, user.id, project_id)
    await db.execute(
        delete(ProjectMemoryLinks).where(
            ProjectMemoryLinks.project_id == project_id,
            ProjectMemoryLinks.memory_id == memory_id,
            ProjectMemoryLinks.user_id == user.id,
        )
    )
    await db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ runs


@router.get("/{project_id}/runs/{run_id}")
async def get_run(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.get(ProjectRuns, run_id)
    if not r or r.user_id != user.id or r.project_id != project_id:
        raise HTTPException(status_code=404, detail="版本不存在")
    if _is_stale(r):
        r.status, r.stage, r.error = "failed", "failed", "执行中断（服务重启或超时），请重新发起"
        await db.commit()
    return _run_detail(r)


@router.get("/{project_id}/runs/{run_id}/html")
async def run_html(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.get(ProjectRuns, run_id)
    if not r or r.user_id != user.id or r.project_id != project_id:
        raise HTTPException(status_code=404, detail="版本不存在")
    files = _load(r.files) or {}
    if "index.html" not in files:
        raise HTTPException(status_code=404, detail="该版本还没有可预览的页面")
    return {"html": pp.bundle_html({"files": files})}


@router.post("/{project_id}/runs")
async def create_run(project_id: int, data: RunRequest, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    runs = await _project_runs(db, user.id, project_id)
    if any(r.status == "running" for r in runs):
        raise HTTPException(status_code=409, detail="上一轮流水线仍在执行，请稍候")

    prompt = data.prompt.strip()
    previous_files = None
    for r in reversed(runs):
        if r.status == "done" and r.files:
            previous_files = _load(r.files)
            break

    mode = await me.get_mode(db, user.id)
    memories: list[Memories] = []
    ids = [link.memory_id for link in await _links(db, user.id, project_id)]
    if ids and mode != "off":
        memories = list(
            (
                await db.scalars(
                    select(Memories).where(Memories.id.in_(ids), Memories.user_id == user.id, Memories.status == "active")
                )
            ).all()
        )
    rules = await me.get_rules(db, user.id)
    history = (
        await db.scalars(
            select(ProjectMessages)
            .where(ProjectMessages.user_id == user.id, ProjectMessages.project_id == project_id)
            .order_by(ProjectMessages.id.desc())
            .limit(10)
        )
    ).all()

    ts = pp.now_iso()
    run = ProjectRuns(
        user_id=user.id,
        project_id=project_id,
        version=max((r.version for r in runs), default=0) + 1,
        prompt=prompt,
        status="running",
        stage="lead",
        fix_rounds=0,
        create_time=ts,
        update_time=ts,
    )
    db.add(run)
    await db.flush()
    db.add(ProjectMessages(user_id=user.id, project_id=project_id, run_id=run.id, role="user", content=prompt, create_time=ts))
    p.update_time = ts
    await db.commit()

    context = {
        "name": p.name,
        "goal": p.goal or "",
        "background": p.background or "",
        "acceptance": p.acceptance or "",
        "prompt": prompt,
        "memory_context": [f"[{m.category}] {m.title}：{m.content}" for m in memories],
        "recalled": [
            {**me.memory_dict(m), "reason": "项目绑定"} for m in memories
        ],
        "rules": rules,
        "history": [{"role": h.role, "content": (h.content or "")[:800]} for h in reversed(history)],
        "previous_files": previous_files,
        "mode": mode,
    }
    task = asyncio.create_task(_execute(user.id, project_id, run.id, context))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return _run_detail(run)


async def _update_run(run_id: int, **fields: Any) -> None:
    async with db_manager.session() as db:
        r = await db.get(ProjectRuns, run_id)
        if not r:
            return
        for key, value in fields.items():
            setattr(r, key, value)
        r.update_time = pp.now_iso()
        await db.commit()


async def _sediment_memories(user_id: str, project_id: int, run_id: int, context: dict[str, Any], plan: dict[str, Any], dev: dict[str, Any]) -> dict[str, Any]:
    """Write project conclusions into long-term memory and mark them as belonging to the project."""
    events: dict[str, Any] = {
        "mode": context["mode"],
        "explicit": me.is_explicit(context["prompt"]),
        "recalled": context["recalled"],
        "created": [],
        "updated": [],
        "deleted": [],
        "notice": "",
    }
    if context["mode"] != "learn":
        events["notice"] = "记忆模式非“自动学习”，本轮未沉淀项目记忆"
        return events
    user_msg = f"[项目「{context['name']}」] {context['prompt']}"
    conclusion = (
        f"项目「{context['name']}」第 {run_id} 号迭代结论：{plan['summary']}。"
        f"技术栈：{dev.get('stack') or 'HTML/CSS/JS'}。交付：{'；'.join(dev.get('delivery_log', [])[:5])}"
    )
    async with db_manager.session() as db:
        try:
            pool = await me.active_memories(db, user_id)
            candidates = me.pick_candidates(pool, user_msg + conclusion)
            await db.commit()
            ops = await me.extract_operations(user_msg, conclusion, candidates, events["explicit"])
            applied = await me.apply_operations(db, user_id, 0, ops, events["explicit"])
            events.update(applied)
            linked = {link.memory_id for link in await _links(db, user_id, project_id)}
            for item in applied["created"] + applied["updated"]:
                if item["memory_id"] not in linked:
                    db.add(
                        ProjectMemoryLinks(
                            user_id=user_id,
                            project_id=project_id,
                            memory_id=item["memory_id"],
                            relation="derived",
                            create_time=pp.now_iso(),
                        )
                    )
            await db.commit()
            if not ops:
                events["notice"] = "本轮没有需要长期沉淀的项目结论"
        except Exception as exc:  # memory must never break the pipeline
            logger.warning("project memory sedimentation failed: %s", exc)
            await db.rollback()
            events["notice"] = "项目记忆沉淀暂时失败"
    return events


async def _execute(user_id: str, project_id: int, run_id: int, context: dict[str, Any]) -> None:
    try:
        plan = await pp.run_lead(context)
        await _update_run(run_id, lead_output=json.dumps(plan, ensure_ascii=False), stage="dev")

        context["lead_output"] = plan

        async def on_stage(stage: str) -> None:
            await _update_run(run_id, stage=stage)

        dev = await pp.run_developer(context, on_stage=on_stage)
        await _update_run(
            run_id,
            dev_output=json.dumps(dev, ensure_ascii=False),
            files=json.dumps(dev["files"], ensure_ascii=False),
            fix_rounds=dev["fix_round"],
            stage="memory",
        )

        events = await _sediment_memories(user_id, project_id, run_id, context, plan, dev)
        await _update_run(run_id, memory_events=json.dumps(events, ensure_ascii=False), status="done", stage="done")
        async with db_manager.session() as db:
            db.add(
                ProjectMessages(
                    user_id=user_id,
                    project_id=project_id,
                    run_id=run_id,
                    role="assistant",
                    content=pp.lead_markdown(plan) + "\n\n---\n\n" + pp.dev_markdown(dev),
                    create_time=pp.now_iso(),
                )
            )
            await db.commit()
    except Exception as exc:
        logger.error("project pipeline failed: %s", exc)
        try:
            await _update_run(run_id, status="failed", stage="failed", error=str(exc)[:800])
        except Exception as inner:  # noqa: BLE001
            logger.error("failed to mark run failed: %s", inner)
