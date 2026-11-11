---
last_updated: 2026-11-11T00:00:00Z
---

# Requirements & Progress

## Requirements Overview
在记忆对话 Demo 上新增项目工作区：项目增删改查、记忆绑定、项目主管 → 开发（含自测）流水线及实时可视化、角色标准输入输出规则、沙箱预览、版本管理、文件查看、项目记忆沉淀。质量角色已取消。

## User Stories
- 作为用户，我可以创建项目，填写名称、目标、背景和验收标准，并在项目列表中进入项目。
- 作为用户，我可以把长期记忆绑定到项目，供两个角色读取。
- 作为用户，我输入需求后能实时看到主管方案、开发进度、自测报告和记忆沉淀。
- 作为用户，我可以预览生成的应用、查看代码文件、切换历史版本。
- 作为用户，项目结论会沉淀为长期记忆（标记为“项目沉淀”），在后续会话中被召回。

## Task Breakdown
| ID | Task | Assignee | Status | Deps |
|----|------|----------|--------|------|
| P1 | 数据表：projects / project_memory_links / project_runs / project_messages | Alex | done | - |
| P2 | 流水线服务 services/project_pipeline.py（主管、开发、自测、修复） | Alex | done | P1 |
| P3 | 接口 routers/project_workspace.py（后台任务 + 轮询） | Alex | done | P2 |
| P4 | 前端：项目列表、工作区、流水线卡片、预览/代码/版本、角色规范、记忆绑定 | Alex | done | P3 |
| P5 | tsc + lint + build + py 检查 | Alex | done | P4 |
| P6 | 端到端流水线实测 | Alex | blocked | P5 |

## Progress Log
- 2026-11-10 完成记忆对话应用，跨会话召回实测通过。
- 2026-11-11 完成项目工作区；按需求变更移除质量角色。
- 2026-11-11 实测 1：主管阶段通过；开发阶段因 JSON 转义校验失败 → 改为 `<file>` 块输出 + 静态自测。
- 2026-11-11 实测 2：主管阶段通过；开发阶段遇到 403 insufficient_ai_balance → 阻塞，需要充值后复测。
