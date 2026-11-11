---
last_updated: 2026-11-10T00:00:00Z
status: active
---

# Project Context

## Project Overview
在 Atoms 控制台复刻的基础上精简为 AI 对话应用，只保留对话和新建对话，并加入可跨会话保存的三层记忆系统（参考 Kiro 和豆包）：规则层 + 会话层 + 长期记忆层，流水线为提取 → 写入 → 检索 → 注入。

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-11-10 | 使用 FuncSea（Atoms Cloud）后端和 Atoms 登录 | Alex | AI 对话和跨会话记忆都需要服务端持久化 |
| 2026-11-10 | 对话回复用 deepseek-v4-pro，前端流式输出；记忆提取和冲突判断用 deepseek-v4-flash，在后端执行 | Alex | 回复需要流式体验；记忆需要在服务端校验结构化 JSON |
| 2026-11-10 | 每轮对话拆成 prepare 和 finalize 两个接口 | Alex | 避免慢速 AI 调用期间长时间占用数据库事务 |
| 2026-11-10 | 检索采用结构化过滤 + 常驻画像 + 二元组相关度 × 置信度 | Alex | Demo 不引入向量库，同时体现“结构化为主、语义为辅” |
| 2026-11-10 | 记忆删除为软删除（status=deleted） | Alex | 保留审计轨迹 |

## Constraints
- 记忆模式三档：off / use / learn，默认 learn。
- 置信度：显式记住 0.95，自动抽取 0.7，手动编辑 1.0。
- 敏感信息（手机号、密码、证件号等）会被正则拦截，不写入。
- 视觉规范见 app/frontend/DESIGN.md。
