const CDN = "https://public-frontend-cos.metadl.com/nuxt-mgx/prod/assets";

export interface Agent {
  name: string;
  role: string;
  avatar: string;
}

export const AGENTS: Agent[] = [
  { name: "Mike", role: "团队领导", avatar: `${CDN}/Mike-TeamLeader-Avatar_origin.DmBYWaXT.webp` },
  { name: "Emma", role: "产品经理", avatar: `${CDN}/Emma-ProductManager-Avatar_origin.BBeqkRr7.webp` },
  { name: "Bob", role: "架构师", avatar: `${CDN}/Bob-Architect-Avatar_origin.Cdi-oMPW.webp` },
  { name: "Alex", role: "工程师", avatar: `${CDN}/Alex-Engineer-Avatar_origin.zHMG8gqX.webp` },
  { name: "David", role: "数据分析师", avatar: `${CDN}/David-DataAnalyst-Avatar_origin.CahzHabe.webp` },
  { name: "Iris", role: "深度研究员", avatar: `${CDN}/Iris-DeepResearcher-Avatar_origin.uohFf0-y.webp` },
  { name: "Sarah", role: "SEO 专家", avatar: `${CDN}/Sarah-SEOSpecialist-Avatar_origin.DYHquUJp.webp` },
  { name: "Adrian", role: "广告专家", avatar: `${CDN}/Adrian-AdsAgent-Avatar.D1HVIhCr.png` },
];

export interface Project {
  id: string;
  name: string;
  updatedAt: number;
  thumb?: string;
  gradient: string;
  published: boolean;
  starred: boolean;
}

const HOUR = 3600_000;
const now = Date.now();

export const GRADIENTS = [
  "from-violet-200 via-fuchsia-100 to-white",
  "from-sky-200 via-cyan-100 to-white",
  "from-amber-200 via-orange-100 to-white",
  "from-emerald-200 via-teal-100 to-white",
  "from-rose-200 via-pink-100 to-white",
];

export const INITIAL_PROJECTS: Project[] = [
  { id: "p1", name: "SaaS 订阅落地页", updatedAt: now - 0.4 * HOUR, thumb: `${CDN}/main.DGt_P6Ei.png`, gradient: GRADIENTS[0], published: true, starred: true },
  { id: "p2", name: "窗户清洁预约系统", updatedAt: now - 5 * HOUR, thumb: `${CDN}/1.D886DBu4.png`, gradient: GRADIENTS[1], published: true, starred: false },
  { id: "p3", name: "独立品牌批发商城", updatedAt: now - 26 * HOUR, thumb: `${CDN}/2.DeoBqn1x.png`, gradient: GRADIENTS[2], published: false, starred: false },
  { id: "p4", name: "像素射击小游戏", updatedAt: now - 72 * HOUR, gradient: GRADIENTS[3], published: false, starred: true },
  { id: "p5", name: "电影工作室官网", updatedAt: now - 150 * HOUR, gradient: GRADIENTS[4], published: true, starred: false },
  { id: "p6", name: "AI 简历优化助手", updatedAt: now - 300 * HOUR, gradient: GRADIENTS[0], published: false, starred: false },
];

export interface Template {
  id: string;
  name: string;
  category: string;
  gradient: string;
  prompt: string;
}

export const TEMPLATES: Template[] = [
  { id: "t1", name: "SaaS 落地页", category: "营销", gradient: GRADIENTS[0], prompt: "创建一个现代风格的 SaaS 产品落地页，包含功能介绍、定价和常见问题" },
  { id: "t2", name: "独立品牌与批发", category: "电商", gradient: GRADIENTS[2], prompt: "创建一个独立品牌电商网站，支持商品展示、购物车和批发询价" },
  { id: "t3", name: "电影工作室网站", category: "作品集", gradient: GRADIENTS[4], prompt: "创建一个电影工作室官网，包含作品展示、团队介绍和联系表单" },
  { id: "t4", name: "热门推荐平台", category: "社区", gradient: GRADIENTS[1], prompt: "创建一个热门内容推荐平台，用户可以投票和评论" },
  { id: "t5", name: "创意视频", category: "媒体", gradient: GRADIENTS[3], prompt: "制作一段展示产品亮点的创意短视频页面" },
  { id: "t6", name: "射击游戏", category: "游戏", gradient: GRADIENTS[0], prompt: "创建一个网页版太空射击小游戏，包含计分和关卡" },
];

export const SUGGESTIONS = [
  "SaaS 订阅应用",
  "个人作品集",
  "预约管理系统",
  "电商店铺",
  "数据看板",
  "小游戏",
];

export const MODES = [
  { id: "team", label: "团队模式", desc: "多个 AI 智能体协作完成规划、构建与测试" },
  { id: "engineer", label: "工程师模式", desc: "直接由 Alex 快速编写代码" },
  { id: "race", label: "竞赛模式", desc: "多个模型并行生成，择优选用" },
];

export const MODELS = ["Claude Opus", "GPT-5.5", "Gemini 3.1 Pro", "DeepSeek V4"];

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}
