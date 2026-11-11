---
last_updated: 2026-11-11T00:00:00Z
status: active
---

# Project Context

## Project Overview
Atoms 风格 AI Demo：记忆对话（三层记忆：规则 / 会话 / 长期记忆）+ 项目工作区。项目工作区的流水线是“项目主管 → 开发工程师（含自测，未通过时自动修复一轮）→ 记忆沉淀”，每轮迭代生成一个可预览的网页应用版本。质量角色已按用户要求取消。

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-11-10 | 使用 FuncSea（Atoms Cloud）后端和 Atoms 登录 | Alex | AI 对话和跨会话记忆需要服务端持久化 |
| 2026-11-10 | 对话用 deepseek-v4-pro 流式输出；记忆提取用 deepseek-v4-flash，在后端执行 | Alex | 兼顾流式体验和结构化校验 |
| 2026-11-10 | 记忆检索 = 常驻画像 + 二元组相关度 × 置信度；删除为软删除 | Alex | 不引入向量库，体现“结构化为主” |
| 2026-11-11 | 去掉质量角色，开发角色负责自测（验收要点逐项自检 + 确定性静态检查），未通过时自动修复一轮 | Mike/用户 | 用户变更需求 |
| 2026-11-11 | 项目主管用 deepseek-v4-pro，开发用 claude-opus-4.6，全部在后端调用 | Alex | 按需求指定 |
| 2026-11-11 | 流水线作为后台任务运行，前端每 2.5s 轮询运行详情 | Alex | 实时展示阶段，同时避免请求超时和长事务 |
| 2026-11-11 | 开发输出使用 `<file path>` 块 + `<meta>` JSON | Alex | 长代码放进 JSON 字符串容易转义失败（首次实测失败的原因） |
| 2026-11-11 | 预览方式：把本地 css/js 内联后放进 iframe srcdoc，sandbox 不开 allow-same-origin | Alex | 隔离生成代码 |

## Constraints
- 记忆模式：off / use / learn；置信度：显式 0.95，自动抽取 0.7，手动 1.0；敏感信息用正则拦截。
- 生成的应用限定为 HTML/CSS/原生 JS，最多 3 个文件，必须包含 index.html。
- 同一项目同一时间只能有一个运行中的版本；运行超过 15 分钟会标记为失败。
- 当前阻塞：AI 余额不足（insufficient_ai_balance），claude-opus-4.6 开发阶段无法执行，需要充值后复测。
