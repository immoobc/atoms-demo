"""Project workspace API: projects, memory binding, pipeline runs and versions.

Pipeline (lead -> developer with self-check -> memory) runs as a background task with its own
DB sessions; the frontend polls run detail (including the live developer stream) to visualise
each stage. Every row in project_runs is one version: AI runs, manual edits and rollbacks.
"""

import asyncio
import base64
import io
import json
import logging
import re
import zipfile
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
STREAM_TAIL = 12000
MAX_FILES = 20
MAX_FILE_BYTES = 300_000
INTERRUPTED = "执行中断（服务重启或任务丢失），可点击“重试”重新运行"
STOPPED = "已手动停止，可点击“重试”重新运行"

_run_tasks: dict[int, asyncio.Task] = {}
_streams: dict[int, str] = {}


class ProjectInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    goal: str = Field("", max_length=2000)
    background: str = Field("", max_length=4000)
    acceptance: str = Field("", max_length=4000)


class LinkInput(BaseModel):
    memory_id: int


class RunRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=6000)
    base_run_id: Optional[int] = None


class VersionInput(BaseModel):
    files: dict[str, str]
    base_run_id: Optional[int] = None
    note: str = Field("", max_length=200)


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
    stream = _streams.get(r.id, "") if r.status == "running" else ""
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
        "stream": stream[-STREAM_TAIL:],
        "stream_length": len(stream),
    }


def _is_stale(r: ProjectRuns) -> bool:
    if r.status != "running":
        return False
    task = _run_tasks.get(r.id)
    if task is None or task.done():
        return True
    try:
        return bool(r.update_time) and datetime.now(timezone.utc) - datetime.fromisoformat(r.update_time) > STALE_AFTER
    except ValueError:
        return False


def _mark_failed(r: ProjectRuns, message: str) -> None:
    r.status, r.stage, r.error = "failed", "failed", message
    r.update_time = pp.now_iso()
    _streams.pop(r.id, None)


async def _own_project(db: AsyncSession, user_id: str, project_id: int) -> Projects:
    p = await db.get(Projects, project_id)
    if not p or p.user_id != user_id:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p


async def _own_run(db: AsyncSession, user_id: str, project_id: int, run_id: int) -> ProjectRuns:
    r = await db.get(ProjectRuns, run_id)
    if not r or r.user_id != user_id or r.project_id != project_id:
        raise HTTPException(status_code=404, detail="版本不存在")
    if _is_stale(r):
        _mark_failed(r, INTERRUPTED)
        await db.commit()
    return r


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
            _mark_failed(r, INTERRUPTED)
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


def _validate_files(files: dict[str, str]) -> dict[str, str]:
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"文件数量需在 1–{MAX_FILES} 个之间")
    clean: dict[str, str] = {}
    for path, content in files.items():
        try:
            name = pp._clean_path(path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"非法文件路径：{path}") from exc
        if not re.fullmatch(r"[\w.\-/]+", name):
            raise HTTPException(status_code=400, detail=f"文件名只能包含字母、数字、-、_、.、/：{path}")
        if len(content.encode("utf-8")) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"{name} 超过 300KB")
        clean[name] = content
    if "index.html" not in clean:
        raise HTTPException(status_code=400, detail="必须包含 index.html")
    return clean


def _static_result(files: dict[str, str], kind: str, note: str, source_version: Optional[int]) -> dict[str, Any]:
    items = pp.static_checks(files)
    return {
        "stack": "HTML + CSS + 原生 JavaScript",
        "delivery_log": [note],
        "self_check": {"passed": all(i["passed"] for i in items), "items": items, "notes": "手动版本只执行静态检查"},
        "fix_round": 0,
        "kind": kind,
        "source_version": source_version,
    }


async def _save_static_version(
    db: AsyncSession, user_id: str, project: Projects, files: dict[str, str], prompt: str, kind: str, source_version: Optional[int]
) -> ProjectRuns:
    runs = await _project_runs(db, user_id, project.id)
    ts = pp.now_iso()
    run = ProjectRuns(
        user_id=user_id,
        project_id=project.id,
        version=max((r.version for r in runs), default=0) + 1,
        prompt=prompt,
        status="done",
        stage="done",
        fix_rounds=0,
        files=json.dumps(files, ensure_ascii=False),
        dev_output=json.dumps(_static_result(files, kind, prompt, source_version), ensure_ascii=False),
        create_time=ts,
        update_time=ts,
    )
    db.add(run)
    await db.flush()
    db.add(ProjectMessages(user_id=user_id, project_id=project.id, run_id=run.id, role="user", content=prompt, create_time=ts))
    project.update_time = ts
    await db.commit()
    return run


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
    changed = False
    for r in runs:
        if _is_stale(r):
            _mark_failed(r, INTERRUPTED)
            changed = True
    if changed:
        await db.commit()
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
    runs = await _project_runs(db, user.id, project_id)
    for r in runs:
        task = _run_tasks.pop(r.id, None)
        if task and not task.done():
            task.cancel()
        _streams.pop(r.id, None)
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


# ------------------------------------------------------------------ runs / versions


@router.get("/{project_id}/runs/{run_id}")
async def get_run(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _run_detail(await _own_run(db, user.id, project_id, run_id))


@router.get("/{project_id}/runs/{run_id}/html")
async def run_html(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await _own_run(db, user.id, project_id, run_id)
    files = _load(r.files) or {}
    if "index.html" not in files:
        raise HTTPException(status_code=404, detail="该版本还没有可预览的页面")
    return {"html": pp.bundle_html({"files": files})}


@router.get("/{project_id}/runs/{run_id}/zip")
async def run_zip(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    r = await _own_run(db, user.id, project_id, run_id)
    files = _load(r.files) or {}
    if not files:
        raise HTTPException(status_code=404, detail="该版本没有文件")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in sorted(files.items()):
            zf.writestr(path, content)
    slug = re.sub(r"[^\w\-]+", "-", p.name).strip("-")[:40] or f"project-{p.id}"
    return {"filename": f"{slug}-v{r.version}.zip", "base64": base64.b64encode(buffer.getvalue()).decode("ascii")}


@router.post("/{project_id}/versions")
async def save_version(project_id: int, data: VersionInput, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    files = _validate_files(data.files)
    source = await _own_run(db, user.id, project_id, data.base_run_id) if data.base_run_id else None
    note = data.note.strip() or (f"手动编辑（基于 v{source.version}）" if source else "手动编辑")
    run = await _save_static_version(db, user.id, p, files, note, "manual", source.version if source else None)
    return _run_detail(run)


@router.post("/{project_id}/runs/{run_id}/rollback")
async def rollback(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    source = await _own_run(db, user.id, project_id, run_id)
    files = _load(source.files) or {}
    if source.status != "done" or "index.html" not in files:
        raise HTTPException(status_code=400, detail="只能回滚到已完成且包含 index.html 的版本")
    run = await _save_static_version(db, user.id, p, files, f"回滚到 v{source.version}", "rollback", source.version)
    return _run_detail(run)


async def _build_context(
    db: AsyncSession, user_id: str, p: Projects, prompt: str, version: int, previous_files: Optional[dict[str, str]]
) -> dict[str, Any]:
    mode = await me.get_mode(db, user_id)
    memories: list[Memories] = []
    ids = [link.memory_id for link in await _links(db, user_id, p.id)]
    if ids and mode != "off":
        memories = list(
            (
                await db.scalars(
                    select(Memories).where(Memories.id.in_(ids), Memories.user_id == user_id, Memories.status == "active")
                )
            ).all()
        )
    rules = await me.get_rules(db, user_id)
    history = (
        await db.scalars(
            select(ProjectMessages)
            .where(ProjectMessages.user_id == user_id, ProjectMessages.project_id == p.id)
            .order_by(ProjectMessages.id.desc())
            .limit(10)
        )
    ).all()
    return {
        "name": p.name,
        "goal": p.goal or "",
        "background": p.background or "",
        "acceptance": p.acceptance or "",
        "prompt": prompt,
        "version": version,
        "memory_context": [f"[{m.category}] {m.title}：{m.content}" for m in memories],
        "recalled": [{**me.memory_dict(m), "reason": "项目绑定"} for m in memories],
        "rules": rules,
        "history": [{"role": h.role, "content": (h.content or "")[:800]} for h in reversed(history)],
        "previous_files": previous_files,
        "mode": mode,
    }


def _start(user_id: str, project_id: int, run_id: int, context: dict[str, Any]) -> None:
    _streams[run_id] = ""
    task = asyncio.create_task(_execute(user_id, project_id, run_id, context))
    _run_tasks[run_id] = task
    task.add_done_callback(lambda _t, rid=run_id: _run_tasks.pop(rid, None))


def _latest_done_files(runs: list[ProjectRuns], before_version: Optional[int] = None) -> Optional[dict[str, str]]:
    for r in reversed(runs):
        if before_version is not None and r.version >= before_version:
            continue
        if r.status == "done" and r.files:
            return _load(r.files)
    return None


@router.post("/{project_id}/runs")
async def create_run(project_id: int, data: RunRequest, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    runs = await _project_runs(db, user.id, project_id)
    if any(r.status == "running" for r in runs):
        raise HTTPException(status_code=409, detail="上一轮流水线仍在执行，请稍候或先停止")

    prompt = data.prompt.strip()
    if data.base_run_id:
        base = next((r for r in runs if r.id == data.base_run_id), None)
        if not base or base.status != "done" or not base.files:
            raise HTTPException(status_code=400, detail="所选基础版本不可用")
        previous_files = _load(base.files)
        prompt_for_ai = f"（基于 v{base.version} 继续迭代）{prompt}"
    else:
        previous_files = _latest_done_files(runs)
        prompt_for_ai = prompt

    ts = pp.now_iso()
    version = max((r.version for r in runs), default=0) + 1
    context = await _build_context(db, user.id, p, prompt_for_ai, version, previous_files)
    run = ProjectRuns(
        user_id=user.id,
        project_id=project_id,
        version=version,
        prompt=prompt_for_ai,
        status="running",
        stage="lead",
        fix_rounds=0,
        create_time=ts,
        update_time=ts,
    )
    db.add(run)
    await db.flush()
    db.add(ProjectMessages(user_id=user.id, project_id=project_id, run_id=run.id, role="user", content=prompt_for_ai, create_time=ts))
    p.update_time = ts
    await db.commit()
    _start(user.id, project_id, run.id, context)
    return _run_detail(run)


@router.post("/{project_id}/runs/{run_id}/cancel")
async def cancel_run(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await _own_run(db, user.id, project_id, run_id)
    if r.status != "running":
        return _run_detail(r)
    task = _run_tasks.pop(run_id, None)
    if task and not task.done():
        task.cancel()
    _mark_failed(r, STOPPED)
    await db.commit()
    return _run_detail(r)


@router.post("/{project_id}/runs/{run_id}/retry")
async def retry_run(project_id: int, run_id: int, user: UserResponse = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = await _own_project(db, user.id, project_id)
    runs = await _project_runs(db, user.id, project_id)
    r = next((x for x in runs if x.id == run_id), None)
    if not r:
        raise HTTPException(status_code=404, detail="版本不存在")
    if r.status != "failed":
        raise HTTPException(status_code=400, detail="只有失败或已停止的版本可以重试")
    if any(x.status == "running" for x in runs):
        raise HTTPException(status_code=409, detail="另一轮流水线仍在执行，请稍候或先停止")
    previous_files = _latest_done_files(runs, before_version=r.version)
    context = await _build_context(db, user.id, p, r.prompt, r.version, previous_files)
    r.status, r.stage, r.error = "running", "lead", ""
    r.lead_output = r.dev_output = r.files = r.memory_events = None
    r.fix_rounds = 0
    r.update_time = pp.now_iso()
    await db.commit()
    _start(user.id, project_id, r.id, context)
    return _run_detail(r)


async def _update_run(run_id: int, **fields: Any) -> None:
    async with db_manager.session() as db:
        r = await db.get(ProjectRuns, run_id)
        if not r:
            return
        if r.status != "running" and fields.get("status") != "failed":
            raise asyncio.CancelledError()  # stopped or deleted by the user meanwhile
        for key, value in fields.items():
            setattr(r, key, value)
        r.update_time = pp.now_iso()
        await db.commit()


async def _touch(run_id: int) -> None:
    async with db_manager.session() as db:
        r = await db.get(ProjectRuns, run_id)
        if r and r.status == "running":
            r.update_time = pp.now_iso()
            await db.commit()


async def _sediment_memories(user_id: str, project_id: int, context: dict[str, Any], plan: dict[str, Any], dev: dict[str, Any]) -> dict[str, Any]:
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
        f"项目「{context['name']}」v{context['version']} 迭代结论：{plan['summary']}。"
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
            events["notice"] = f"项目记忆沉淀暂时失败：{pp.friendly_error(exc)}"
    return events


async def _execute(user_id: str, project_id: int, run_id: int, context: dict[str, Any]) -> None:
    try:
        plan = await pp.run_lead(context)
        await _update_run(run_id, lead_output=json.dumps(plan, ensure_ascii=False), stage="dev")

        context["lead_output"] = plan
        last_touch = [0.0]

        async def on_stage(stage: str) -> None:
            _streams[run_id] = ""
            await _update_run(run_id, stage=stage)

        async def on_chunk(text: str) -> None:
            _streams[run_id] = text
            now = asyncio.get_running_loop().time()
            if now - last_touch[0] > 20:
                last_touch[0] = now
                await _touch(run_id)

        dev = await pp.run_developer(context, on_stage=on_stage, on_chunk=on_chunk)
        await _update_run(
            run_id,
            dev_output=json.dumps(dev, ensure_ascii=False),
            files=json.dumps(dev["files"], ensure_ascii=False),
            fix_rounds=dev["fix_round"],
            stage="memory",
        )
        _streams.pop(run_id, None)

        events = await _sediment_memories(user_id, project_id, context, plan, dev)
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
    except asyncio.CancelledError:
        logger.info("project pipeline run %s cancelled", run_id)
    except Exception as exc:
        logger.error("project pipeline failed: %s", exc)
        try:
            await _update_run(run_id, status="failed", stage="failed", error=pp.friendly_error(exc)[:800])
        except Exception as inner:  # noqa: BLE001
            logger.error("failed to mark run failed: %s", inner)
    finally:
        _streams.pop(run_id, None)
