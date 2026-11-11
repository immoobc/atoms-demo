"""Project pipeline: project lead (planner) -> developer (build + self-check + one repair round).

Every role has an explicit structured I/O contract (see PROJECT_ROLE_SPECS).
All AI calls run on the backend through AIHubService.

The developer emits files as <file path="..."> blocks plus one <meta> JSON block. This keeps
source code out of JSON string escaping, which is fragile for long outputs.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from schemas.aihub import ChatMessage, GenTxtRequest
from services.aihub import AIHubService

logger = logging.getLogger(__name__)

LEAD_MODEL = "deepseek-v4-pro"
DEV_MODEL = "claude-opus-4.6"
MEMORY_MODEL = "deepseek-v4-flash"
DEV_MAX_TOKENS = 16000

PROJECT_ROLE_SPECS: list[dict[str, Any]] = [
    {
        "key": "lead",
        "name": "项目主管",
        "model": LEAD_MODEL,
        "purpose": "把用户的目标和方案拆解成可执行的开发任务，给出交付物与验收要点。",
        "input": [
            {"field": "goal", "type": "string", "desc": "项目目标"},
            {"field": "background", "type": "string", "desc": "项目背景与约束"},
            {"field": "acceptance", "type": "string", "desc": "用户写下的验收标准"},
            {"field": "prompt", "type": "string", "desc": "本轮迭代需求"},
            {"field": "memory_context", "type": "string[]", "desc": "绑定到项目的长期记忆"},
            {"field": "rules", "type": "string[]", "desc": "用户全局规则"},
            {"field": "history", "type": "object[]", "desc": "项目内对话历史（≤10 条）"},
        ],
        "output": [
            {"field": "summary", "type": "string", "desc": "本轮方案一句话概述"},
            {"field": "tasks", "type": "object[]", "desc": "{id, title, detail, owner}，1–8 条"},
            {"field": "deliverables", "type": "string[]", "desc": "本轮交付物清单"},
            {"field": "acceptance_points", "type": "string[]", "desc": "可逐项检查的验收要点，2–8 条"},
            {"field": "risks", "type": "string[]", "desc": "风险与规避方式"},
        ],
    },
    {
        "key": "dev",
        "name": "开发工程师",
        "model": DEV_MODEL,
        "purpose": "严格按照项目主管的方案生成可运行的网页应用完整代码，并完成自测（验收要点逐项自检 + 静态检查），未通过可自动修复一轮。",
        "input": [
            {"field": "lead_output", "type": "object", "desc": "项目主管的结构化方案"},
            {"field": "goal / prompt", "type": "string", "desc": "项目目标与本轮需求"},
            {"field": "memory_context", "type": "string[]", "desc": "绑定到项目的长期记忆"},
            {"field": "rules", "type": "string[]", "desc": "用户全局规则"},
            {"field": "previous_files", "type": "object", "desc": "上一版本的代码文件（迭代时提供）"},
        ],
        "output": [
            {"field": "files", "type": "object", "desc": "相对路径 -> 文件内容；必须包含 index.html"},
            {"field": "stack", "type": "string", "desc": "技术栈说明"},
            {"field": "delivery_log", "type": "string[]", "desc": "交付记录：完成了哪些任务"},
            {"field": "self_check", "type": "object", "desc": "{passed, items:[{point, passed, evidence, kind}], notes}；kind 为 acceptance/static"},
            {"field": "fix_round", "type": "integer", "desc": "已执行的自动修复轮次，0 或 1"},
        ],
    },
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def extract_json_block(text: str) -> str:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start >= 0 and end > start else text


def parse_json_object(text: str) -> dict[str, Any]:
    payload = json.loads(extract_json_block(text))
    if not isinstance(payload, dict):
        raise ValueError("root must be an object")
    return payload


# ------------------------------------------------------------------ lead


def validate_lead(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload.get("summary"), str) or not payload["summary"].strip():
        raise ValueError("summary must be a non-empty string")
    tasks = payload.get("tasks")
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= 8:
        raise ValueError("tasks must contain 1-8 entries")
    clean_tasks = []
    for i, t in enumerate(tasks):
        if not isinstance(t, dict) or not isinstance(t.get("title"), str) or not t["title"].strip():
            raise ValueError(f"tasks[{i}].title must be a non-empty string")
        clean_tasks.append(
            {"id": i + 1, "title": t["title"][:120], "detail": str(t.get("detail", ""))[:600], "owner": "开发工程师"}
        )
    points = payload.get("acceptance_points")
    if not isinstance(points, list) or not 2 <= len(points) <= 8 or not all(isinstance(p, str) and p.strip() for p in points):
        raise ValueError("acceptance_points must contain 2-8 strings")
    deliverables = payload.get("deliverables")
    risks = payload.get("risks")
    return {
        "summary": payload["summary"][:500],
        "tasks": clean_tasks,
        "deliverables": [str(d)[:200] for d in deliverables][:10] if isinstance(deliverables, list) else [],
        "acceptance_points": [p.strip()[:200] for p in points],
        "risks": [str(r)[:200] for r in risks][:6] if isinstance(risks, list) else [],
    }


LEAD_SYSTEM = """你是 Atoms 项目的项目主管。你的职责是把用户的目标和方案拆解成清晰、可执行的开发任务，并给出可逐项验收的要点。

输出要求：只输出一个合法 JSON 对象，不要输出解释文字或 Markdown 代码块。
{
  "summary": "本轮方案一句话概述",
  "tasks": [{"title": "任务标题", "detail": "具体做什么、怎么做"}],
  "deliverables": ["本轮交付物"],
  "acceptance_points": ["可以逐项打勾验证的验收要点"],
  "risks": ["风险与规避方式"]
}
规则：tasks 1–6 条，按实现顺序排列；acceptance_points 2–6 条，必须是可观察、可验证的行为描述；
产物是单页网页应用（HTML/CSS/原生 JS），说明关键交互与数据结构；不要引入登录、支付、后端等本项目不具备的能力；
范围要克制，优先保证核心功能真实可用。"""


async def run_lead(context: dict[str, Any]) -> dict[str, Any]:
    user_prompt = (
        f"项目名称：{context['name']}\n项目目标：{context['goal'] or '（未填写）'}\n"
        f"项目背景：{context['background'] or '（未填写）'}\n用户验收标准：{context['acceptance'] or '（未填写）'}\n"
        f"绑定记忆：{json.dumps(context['memory_context'], ensure_ascii=False)}\n"
        f"全局规则：{json.dumps(context['rules'], ensure_ascii=False)}\n"
        f"历史对话：{json.dumps(context['history'], ensure_ascii=False)}\n"
        f"已有版本：{'有，本轮是在上一版基础上迭代' if context.get('previous_files') else '无，本轮是第一版'}\n\n"
        f"本轮需求：{context['prompt']}"
    )
    service = AIHubService()
    messages = [ChatMessage(role="system", content=LEAD_SYSTEM), ChatMessage(role="user", content=user_prompt)]
    response = await service.gentxt(GenTxtRequest(messages=messages, model=LEAD_MODEL, temperature=0.3, max_tokens=2048))
    try:
        return validate_lead(parse_json_object(response.content))
    except (ValueError, json.JSONDecodeError) as first_error:
        repair = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content="只输出修正后的 JSON 对象。"),
                ChatMessage(
                    role="user",
                    content=f"校验失败：{first_error}\n原始输出：{response.content}\n请按指定 schema 重新输出，tasks 1–8 条，acceptance_points 2–8 条。",
                ),
            ],
            model=LEAD_MODEL,
            temperature=0,
            max_tokens=2048,
        )
        repaired = await service.gentxt(repair)
        return validate_lead(parse_json_object(repaired.content))


def lead_markdown(plan: dict[str, Any]) -> str:
    lines = [f"**方案**：{plan['summary']}", "", "**任务拆解**"]
    lines += [f"{t['id']}. **{t['title']}** — {t['detail']}" for t in plan["tasks"]]
    if plan["deliverables"]:
        lines += ["", "**交付物**"] + [f"- {d}" for d in plan["deliverables"]]
    lines += ["", "**验收要点**"] + [f"- {p}" for p in plan["acceptance_points"]]
    if plan["risks"]:
        lines += ["", "**风险**"] + [f"- {r}" for r in plan["risks"]]
    return "\n".join(lines)


# ------------------------------------------------------------------ developer


DEV_SYSTEM = """你是 Atoms 项目的开发工程师。你要严格按照项目主管的方案，生成一个能直接在浏览器运行的单页网页应用，并完成自测。

硬性约束：
1. 只使用 HTML + CSS + 原生 JavaScript（可以引用 CDN 上的字体或图标），不要使用构建步骤、React/Vue 等框架或后端接口。
2. 最多 3 个文件：index.html（必须）、styles.css、app.js。index.html 用相对路径引用另外两个文件。
3. 数据用 localStorage 或内存保存，交互必须真实可用，不允许空按钮、假成功、TODO 占位。
4. 视觉精致、响应式、中文界面、对比度充足；代码紧凑，总长度控制在 600 行以内。

输出格式（严格遵守，不要输出其他内容，不要用 Markdown 代码块包裹）：
<file path="index.html">
完整文件原文
</file>
<file path="styles.css">
完整文件原文
</file>
<file path="app.js">
完整文件原文
</file>
<meta>
{"stack": "技术栈说明", "delivery_log": ["完成了任务1：…"], "self_check": {"items": [{"point": "主管验收要点原文", "passed": true, "evidence": "对应实现在哪里、如何满足"}], "notes": "其他说明"}}
</meta>
自测要求：self_check.items 必须逐条覆盖主管给出的每一条验收要点，如实判断，不确定就写 passed=false 并说明原因。"""

FILE_RE = re.compile(r'<file\s+path\s*=\s*"([^"]+)"\s*>\s*\n?(.*?)\n?</file>', re.DOTALL)
META_RE = re.compile(r"<meta>\s*(.*?)\s*</meta>", re.DOTALL)
FENCE_RE = re.compile(r"^```[a-zA-Z]*\n(.*)\n```$", re.DOTALL)


def parse_dev_output(text: str) -> tuple[dict[str, str], dict[str, Any]]:
    files: dict[str, str] = {}
    for path, content in FILE_RE.findall(text):
        clean_path = path.strip().lstrip("./").replace("\\", "/")
        if not clean_path or ".." in clean_path or clean_path.startswith("/"):
            raise ValueError(f"invalid file path: {path}")
        body = content.strip("\n")
        fenced = FENCE_RE.match(body.strip())
        files[clean_path] = fenced.group(1) if fenced else body
    if not files:
        raise ValueError("no <file> blocks found")
    if "index.html" not in files:
        raise ValueError("index.html is required")
    meta: dict[str, Any] = {}
    match = META_RE.search(text)
    if match:
        try:
            meta = parse_json_object(match.group(1))
        except (ValueError, json.JSONDecodeError) as exc:
            logger.warning("developer meta block invalid: %s", exc)
    return files, meta


def static_checks(files: dict[str, str]) -> list[dict[str, Any]]:
    """Deterministic self-check run by the pipeline itself."""
    html = files.get("index.html", "")
    lower = html.lower()
    items: list[dict[str, Any]] = []

    complete = all(tag in lower for tag in ("<html", "<body", "</html>"))
    items.append({"point": "index.html 结构完整（html/body 标签闭合）", "passed": complete, "evidence": "解析 index.html 标签", "kind": "static"})

    refs = re.findall(r'(?:href|src)="([^"]+\.(?:css|js))"', html)
    local = [r for r in refs if not re.match(r"^(https?:)?//", r)]
    missing = [r for r in local if r.lstrip("./") not in files]
    items.append({
        "point": "本地引用的 CSS/JS 文件全部存在",
        "passed": not missing,
        "evidence": f"缺失：{', '.join(missing)}" if missing else f"引用 {len(local)} 个本地文件，均已生成",
        "kind": "static",
    })

    placeholders = [p for p, c in files.items() if re.search(r"\bTODO\b|FIXME|待实现|lorem ipsum", c, re.IGNORECASE)]
    items.append({
        "point": "没有 TODO / 占位实现",
        "passed": not placeholders,
        "evidence": f"发现于：{', '.join(placeholders)}" if placeholders else "未发现占位标记",
        "kind": "static",
    })

    unbalanced = []
    for path, content in files.items():
        if path.endswith(".js"):
            stripped = re.sub(r"(['\"`])(?:\\.|(?!\1).)*\1", "", content, flags=re.DOTALL)
            stripped = re.sub(r"//[^\n]*|/\*.*?\*/", "", stripped, flags=re.DOTALL)
            if stripped.count("{") != stripped.count("}") or stripped.count("(") != stripped.count(")"):
                unbalanced.append(path)
    items.append({
        "point": "脚本括号配对完整（无明显截断）",
        "passed": not unbalanced,
        "evidence": f"可能截断：{', '.join(unbalanced)}" if unbalanced else "括号配对正常",
        "kind": "static",
    })
    return items


def build_dev_result(files: dict[str, str], meta: dict[str, Any], acceptance_points: list[str], fix_round: int) -> dict[str, Any]:
    check = meta.get("self_check") if isinstance(meta.get("self_check"), dict) else {}
    raw_items = check.get("items") if isinstance(check.get("items"), list) else []
    items: list[dict[str, Any]] = []
    for item in raw_items:
        if isinstance(item, dict) and isinstance(item.get("point"), str) and item["point"].strip():
            items.append({
                "point": item["point"][:200],
                "passed": item.get("passed") is True,
                "evidence": str(item.get("evidence", ""))[:400],
                "kind": "acceptance",
            })
    covered = {i["point"] for i in items}
    for point in acceptance_points:
        if point not in covered and not any(point[:12] in c or c[:12] in point for c in covered):
            items.append({"point": point, "passed": False, "evidence": "开发自测未覆盖该验收要点", "kind": "acceptance"})
    items += static_checks(files)
    log = meta.get("delivery_log")
    return {
        "files": files,
        "stack": str(meta.get("stack") or "HTML + CSS + 原生 JavaScript")[:300],
        "delivery_log": [str(x)[:300] for x in log][:12] if isinstance(log, list) else [],
        "self_check": {
            "passed": all(i["passed"] for i in items),
            "items": items,
            "notes": str(check.get("notes", ""))[:600],
        },
        "fix_round": fix_round,
    }


def bundle_html(result: dict[str, Any]) -> str:
    """Inline local css/js into index.html so it can be previewed in an iframe srcdoc."""
    files = result["files"]
    html = files["index.html"]

    def is_local(path: str) -> bool:
        return not re.match(r"^(https?:)?//", path) and not path.startswith("data:")

    def inline_css(match: re.Match[str]) -> str:
        name = match.group(1).lstrip("./")
        return f"<style>\n{files[name]}\n</style>" if is_local(match.group(1)) and name in files else match.group(0)

    def inline_js(match: re.Match[str]) -> str:
        name = match.group(1).lstrip("./")
        if not is_local(match.group(1)) or name not in files:
            return match.group(0)
        return "<script>\n" + files[name].replace("</script>", "<\\/script>") + "\n</script>"

    html = re.sub(r'<link[^>]*href="([^"]+\.css)"[^>]*>', inline_css, html)
    html = re.sub(r'<script[^>]*src="([^"]+\.js)"[^>]*>\s*</script>', inline_js, html)
    return html


async def _generate(service: AIHubService, prompt: str) -> str:
    response = await service.gentxt(
        GenTxtRequest(
            messages=[ChatMessage(role="system", content=DEV_SYSTEM), ChatMessage(role="user", content=prompt)],
            model=DEV_MODEL,
            temperature=0.2,
            max_tokens=DEV_MAX_TOKENS,
        )
    )
    return response.content


async def run_developer(
    context: dict[str, Any], on_stage: Optional[Callable[[str], Awaitable[None]]] = None
) -> dict[str, Any]:
    plan = context["lead_output"]
    acceptance = plan["acceptance_points"]
    base_prompt = (
        f"项目名称：{context['name']}\n项目目标：{context['goal'] or '（未填写）'}\n"
        f"用户验收标准：{context['acceptance'] or '（未填写）'}\n"
        f"绑定记忆：{json.dumps(context['memory_context'], ensure_ascii=False)}\n"
        f"全局规则：{json.dumps(context.get('rules', []), ensure_ascii=False)}\n\n"
        f"本轮需求：{context['prompt']}\n\n"
        f"项目主管方案：\n{json.dumps(plan, ensure_ascii=False, indent=2)}\n"
    )
    if context.get("previous_files"):
        base_prompt += "\n上一版本代码（在它的基础上迭代，保留仍然有效的功能，输出修改后的完整文件）：\n"
        base_prompt += "\n".join(f'<file path="{p}">\n{c}\n</file>' for p, c in context["previous_files"].items())

    service = AIHubService()
    raw = await _generate(service, base_prompt)
    try:
        files, meta = parse_dev_output(raw)
    except ValueError as first_error:
        logger.warning("developer output invalid, regenerating: %s", first_error)
        raw = await _generate(
            service,
            base_prompt + f"\n\n注意：你上一次的输出无法解析（{first_error}）。请严格按 <file> 与 <meta> 格式输出，并精简代码，避免输出被截断。",
        )
        files, meta = parse_dev_output(raw)

    result = build_dev_result(files, meta, acceptance, 0)
    if result["self_check"]["passed"]:
        return result

    # One automatic repair round driven by the failed self-check items.
    if on_stage:
        await on_stage("fix")
    failed = [i for i in result["self_check"]["items"] if not i["passed"]]
    fix_prompt = (
        f"{base_prompt}\n\n你上一版代码的自测未通过，请修复后按同样格式重新输出全部文件和 meta。\n"
        f"未通过的检查项：{json.dumps(failed, ensure_ascii=False)}\n"
        "上一版文件：\n" + "\n".join(f'<file path="{p}">\n{c}\n</file>' for p, c in files.items())
    )
    try:
        fixed_files, fixed_meta = parse_dev_output(await _generate(service, fix_prompt))
        return build_dev_result(fixed_files, fixed_meta, acceptance, 1)
    except ValueError as exc:
        logger.warning("developer repair round failed: %s", exc)
        result["self_check"]["notes"] = (result["self_check"]["notes"] + f"\n自动修复一轮失败：{exc}").strip()[:900]
        result["fix_round"] = 1
        return result


def dev_markdown(result: dict[str, Any]) -> str:
    check = result["self_check"]
    head = "✅ 自测通过" if check["passed"] else "⚠️ 自测未通过"
    lines = [f"**{head}**（技术栈：{result['stack']}）"]
    if result["delivery_log"]:
        lines += ["", "**交付记录**"] + [f"- {d}" for d in result["delivery_log"]]
    lines += ["", "**自测清单**"]
    lines += [f"- {'✅' if i['passed'] else '❌'} {i['point']}" for i in check["items"]]
    lines += ["", f"**文件**：{', '.join(sorted(result['files']))}"]
    if result["fix_round"]:
        lines.append("\n已自动执行 1 轮修复。")
    return "\n".join(lines)
