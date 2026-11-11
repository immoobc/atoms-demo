---
last_updated: 2026-11-10T00:00:00Z
---

# Requirements & Progress

## Requirements Overview
将复刻的 Atoms 站点精简为 AI 对话应用（对话 + 新建对话），并加入跨会话记忆系统：三层协同、提取/写入/检索/注入流水线、结构化条目、去重与冲突处理、三档开关、全透明可控的记忆管理。

## User Stories
- 作为用户，我可以登录后新建、切换和删除对话，与 AI 实时（流式）聊天。
- 作为用户，我说“记住……”后，新开对话也能被 AI 记得。
- 作为用户，我可以在每条回复下看到本轮召回、新建、更新、删除了哪些记忆。
- 作为用户，我可以浏览、搜索、筛选、编辑、删除、新增记忆，管理全局规则，并切换记忆模式。

## Task Breakdown
| ID | Task | Assignee | Status | Deps |
|----|------|----------|--------|------|
| T1 | 初始化 FuncSea 后端，创建 5 张数据表 | Alex | done | - |
| T2 | 记忆引擎 services/memory_engine.py | Alex | done | T1 |
| T3 | 接口 routers/memchat.py | Alex | done | T2 |
| T4 | 前端：对话页、侧边栏、记忆事件、记忆面板 | Alex | done | T3 |
| T5 | tsc + lint + build + py 检查 | Alex | done | T4 |
| T6 | 接口实测：跨会话召回、冲突更新、只读模式 | Alex | done | T5 |
| T7 | UI 渲染检查 | Alex | done | T5 |

## Progress Log
- 2026-11-10 已完成控制台复刻（旧 dashboard 组件已移除）。
- 2026-11-10 完成记忆对话应用，实测通过：会话 1 显式记住 3 条；会话 2 跨会话召回；React→Vue 冲突被更新；只读模式不写入；一次性计算不入库。
