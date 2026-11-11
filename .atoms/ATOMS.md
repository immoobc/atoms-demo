---
last_updated: 2026-11-11T06:23:03Z
status: active
---

# Project Context

## Project Overview
高还原复刻 atoms.dev/zh/dashboard（Atoms 登录后控制台）的纯前端中文页面，使用模拟数据，基础交互在前端模拟。

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-11-10 | 采用纯前端模板，不接入后端 | Alex | 需求只要求模拟交互 |
| 2026-11-10 | 控制台布局依据推断，视觉参考公开首页 | Alex | 控制台需要登录，访问时被重定向到首页 |
| 2026-11-10 | 头像和缩略图复用 Atoms 公开 CDN 图片 | Alex | 提升还原度 |

## Constraints
- 不使用后端，数据仅保存在内存中（刷新后重置）。
- 视觉规范见 app/frontend/DESIGN.md。


