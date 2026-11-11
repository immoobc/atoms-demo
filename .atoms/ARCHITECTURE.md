---
last_updated: 2026-11-11T00:00:00Z
---

# Architecture Design

## System Overview
React 前端 + FuncSea FastAPI 后端，包含两个子系统：
1. 记忆对话：prepare → 前端流式调用 gentxt（deepseek-v4-pro）→ finalize（deepseek-v4-flash 提取记忆，并处理去重和冲突）。
2. 项目工作区：POST /api/v1/projects/{id}/runs 创建版本并启动后台任务。任务依次执行：主管（deepseek-v4-pro，JSON schema 校验 + 一次修复）→ 开发（claude-opus-4.6，输出 `<file>` 块 + `<meta>`，再做验收要点与静态检查，未通过时修复一轮）→ 记忆沉淀（flash 提取，结果写入 memories，并以 relation=derived 绑定到项目）。每个阶段结束都会写回 project_runs.stage；前端每 2.5s 轮询运行详情，实时渲染阶段。

## Tech Stack
Vite + React + TS + Tailwind + shadcn/ui + @metagptx/web-sdk；FastAPI + SQLAlchemy Async + AIHubService；PostgreSQL（FuncSea）。

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| 记忆引擎 | 模式、规则、检索、prompt 组装、提取、冲突处理 | app/backend/services/memory_engine.py |
| 对话接口 | 对话轮次、会话、设置、记忆和规则的增删改查 | app/backend/routers/memchat.py |
| 流水线 | 角色规范 PROJECT_ROLE_SPECS、run_lead、run_developer、static_checks、bundle_html | app/backend/services/project_pipeline.py |
| 项目接口 | 项目增删改查、记忆绑定、版本运行（后台任务）、运行详情和 HTML | app/backend/routers/project_workspace.py |
| 前端接口层 | memchat / projects 的类型、接口调用、bundleHtml、阶段映射 | app/frontend/src/lib/{memchat,projects}.ts |
| 页面 | 对话页、项目列表、项目工作区 | app/frontend/src/pages/{Index,Projects,ProjectWorkspace}.tsx |
| 组件 | 对话组件；项目组件：PipelineRun、ArtifactPanel、RoleSpecDialog、ProjectMemorySheet、ProjectFormDialog | app/frontend/src/components/{chat,project}/* |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| 数据表 | 原有 5 张表 + projects、project_memory_links(relation: bound/derived)、project_runs(stage/lead_output/dev_output/files/memory_events)、project_messages，均为 create_only | 按用户隔离 |
| 路由文件名 | project_workspace.py，不使用 MCP 生成的 projects.py | 避免 MCP 重新生成时覆盖 |
| 运行模式 | asyncio 后台任务，每个阶段使用独立的短会话；运行超过 15 分钟标记为失败 | 不在慢速 AI 调用期间持有事务 |
| 自测 | AI 逐条核对验收要点；未覆盖的要点按未通过处理；另加 4 项确定性静态检查 | 自测结果可信 |
| 预览 | 前端 bundleHtml 内联资源后放进 iframe srcdoc，sandbox=allow-scripts/forms/modals/popups | 隔离生成代码 |

## File Tree Plan
backend: services/{memory_engine,project_pipeline}.py, routers/{memchat,project_workspace}.py
frontend: src/lib/{memchat,projects}.ts, src/pages/{Index,Projects,ProjectWorkspace}.tsx, src/components/chat/*, src/components/project/*

## Implementation Guide
修改角色的输入输出时，需要同步更新 PROJECT_ROLE_SPECS、validate_lead、build_dev_result 和前端的 LeadOutput/DevOutput 类型。更换模型时修改 LEAD_MODEL/DEV_MODEL。不要修改 MCP 生成的 models 和 migrations。
