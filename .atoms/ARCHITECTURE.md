---
last_updated: 2026-11-10T00:00:00Z
---

# Architecture Design

## System Overview
单页 React 应用，路由 `/` 渲染控制台页面；状态（项目列表、积分、标签页、导航）集中保存在 Index 页面中。

## Tech Stack
Vite + React + TypeScript + Tailwind CSS + shadcn/ui + lucide-react + sonner。

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| 页面外壳 | 布局、顶栏、移动端抽屉、⌘K 快捷键、创建项目 | src/pages/Index.tsx |
| 侧边栏 | Logo、工作区切换、新建、搜索、导航、积分、用户菜单 | src/components/dashboard/Sidebar.tsx |
| 提示词输入框 | Agent 头像、标题、输入框、附件、模式/模型选择、推荐标签 | src/components/dashboard/PromptBox.tsx |
| 项目区 | 标签页、搜索、排序、网格/列表视图、收藏、重命名、复制、删除、模板 | src/components/dashboard/ProjectsSection.tsx |
| 数据 | Agent、项目、模板、模式、模型及时间格式化 | src/components/dashboard/data.ts |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| 状态管理 | 使用 React useState，状态提升到页面 | 范围较小，不需要额外依赖 |
| 公共样式 | 在 index.css 中定义 nav-item/icon-btn/chip-btn/card 类 | 复用控件样式 |

## File Tree Plan
app/frontend/src/pages/Index.tsx；app/frontend/src/components/dashboard/{Sidebar,PromptBox,ProjectsSection,data}.tsx|ts

## Implementation Guide
新增区块时放在 components/dashboard 下，模拟数据集中写在 data.ts 中，颜色等视觉规范遵循 DESIGN.md。
