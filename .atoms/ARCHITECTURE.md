---
last_updated: 2026-11-10T00:00:00Z
---

# Architecture Design

## System Overview
React 前端 + FuncSea FastAPI 后端。每轮对话流程：
1. 前端调用 POST /api/v1/memchat/prepare：保存用户消息，组装 system prompt（规则 + 召回的记忆），并带上当前会话最近 12 条消息。
2. 前端用 client.ai.gentxt 流式调用 deepseek-v4-pro 生成回复。
3. 前端调用 POST /finalize：保存助手消息；若为 learn 模式，用 deepseek-v4-flash 输出 create/update/delete 操作，经 JSON 校验和修复后应用到记忆库，并返回透明事件。

## Tech Stack
Vite + React + TS + Tailwind + shadcn/ui + @metagptx/web-sdk；FastAPI + SQLAlchemy Async + AIHubService；PostgreSQL（FuncSea）。

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| 记忆引擎 | 模式/规则读取、检索打分、prompt 组装、提取、去重与冲突处理、敏感信息过滤 | app/backend/services/memory_engine.py |
| 对话接口 | prepare/finalize、会话与消息、设置、记忆 CRUD、规则 CRUD | app/backend/routers/memchat.py |
| 前端接口层 | 类型定义、apiCall 封装、流式回复 | app/frontend/src/lib/memchat.ts |
| 对话页 | 登录门禁、落地页、消息流、发送流程 | app/frontend/src/pages/Index.tsx |
| 组件 | 侧边栏（会话列表、记忆模式）、输入框、记忆事件条、记忆管理面板 | app/frontend/src/components/chat/* |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| 数据表 | conversations, chat_messages(memory_events JSON), memories, memory_rules, memory_settings（均为 create_only） | 按用户隔离 |
| 记忆字段 | memory_id(id), title, scene, content, category, confidence, source, source_session_id, status, hit_count, create_time, update_time | 与需求一致，并增加来源和命中次数 |
| 检索 | 常驻画像（偏好/背景/约定类，置信度 ≥0.8，最多 4 条）+ 相关度 Top4（阈值 0.12） | 结构化为主、语义为辅 |
| 冲突 | 将最多 12 条候选旧记忆交给 flash 模型判断 update/delete/skip | 去重和覆盖旧事实 |

## File Tree Plan
app/backend/{services/memory_engine.py, routers/memchat.py}；app/frontend/src/{lib/memchat.ts, pages/Index.tsx, components/chat/{ChatSidebar,Composer,MemoryEvents,MemoryPanel}.tsx}

## Implementation Guide
新增记忆分类时，需同时修改 memory_engine.CATEGORIES 和前端 CATEGORIES；更换模型时修改 CHAT_MODEL/MEMORY_MODEL；不要修改 FuncSea 生成的 models 和 migrations。
