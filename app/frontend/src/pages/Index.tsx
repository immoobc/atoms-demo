import { useEffect, useRef, useState } from "react";
import { Bell, Menu, PanelLeftOpen, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Sidebar, { AtomsLogo, type NavKey } from "@/components/dashboard/Sidebar";
import PromptBox from "@/components/dashboard/PromptBox";
import ProjectsSection, { type ProjectTab } from "@/components/dashboard/ProjectsSection";
import { GRADIENTS, INITIAL_PROJECTS, type Project } from "@/components/dashboard/data";

const NAV_TO_TAB: Partial<Record<NavKey, ProjectTab>> = {
  projects: "mine",
  starred: "starred",
  templates: "templates",
};

const NOTIFICATIONS = [
  { title: "「SaaS 订阅落地页」已成功发布", time: "20 分钟前" },
  { title: "每日 15 积分已到账", time: "今天 00:00" },
  { title: "新功能：竞赛模式现已支持 4 个模型并行", time: "2 天前" },
];

export default function Index() {
  const [nav, setNav] = useState<NavKey>("home");
  const [tab, setTab] = useState<ProjectTab>("recent");
  const [projects, setProjectsState] = useState<Project[]>(INITIAL_PROJECTS);
  const [prompt, setPrompt] = useState("");
  const [credits, setCredits] = useState(15);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);

  const setProjects = (updater: (p: Project[]) => Project[]) => setProjectsState(updater);

  const focusSearch = () => {
    setMobileOpen(false);
    projectsRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => searchRef.current?.focus(), 300);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigate = (key: NavKey) => {
    setNav(key);
    setMobileOpen(false);
    if (key === "home") {
      setTab("recent");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (key === "shared" || key === "discover") {
      toast(key === "shared" ? "暂无他人与你共享的项目" : "发现页展示社区优秀作品（演示）");
      return;
    }
    const t = NAV_TO_TAB[key];
    if (t) setTab(t);
    projectsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const newProject = () => {
    setMobileOpen(false);
    setNav("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => promptRef.current?.focus(), 300);
  };

  const submit = (text: string, mode: string) => {
    if (credits <= 0) {
      toast.error("今日积分已用完，请升级或明日再试");
      return;
    }
    const name = text.replace(/^帮我(创建|做)?(一个)?/, "").slice(0, 16) || "未命名项目";
    setProjects((ps) => [
      { id: crypto.randomUUID(), name, updatedAt: Date.now(), gradient: GRADIENTS[ps.length % GRADIENTS.length], published: false, starred: false },
      ...ps,
    ]);
    setCredits((c) => c - 1);
    setPrompt("");
    setTab("recent");
    toast.success(`已以「${mode}」创建项目：${name}`, { description: "AI 团队开始规划与构建…" });
  };

  const sidebarProps = {
    active: nav,
    onNavigate: navigate,
    onNewProject: newProject,
    onSearch: focusSearch,
    credits,
  };

  return (
    <div className="flex min-h-screen bg-white text-[#0B0B0F]">
      {!collapsed && (
        <div className="sticky top-0 hidden h-screen shrink-0 border-r border-[#EFEFF2] lg:block">
          <Sidebar {...sidebarProps} onCollapse={() => setCollapsed(true)} />
        </div>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[248px] p-0">
          <SheetTitle className="sr-only">导航</SheetTitle>
          <Sidebar {...sidebarProps} />
        </SheetContent>
      </Sheet>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-white/85 px-4 backdrop-blur md:px-6">
          <button aria-label="打开菜单" className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          {collapsed && (
            <button aria-label="展开侧边栏" className="icon-btn hidden lg:flex" onClick={() => setCollapsed(false)}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <AtomsLogo className="lg:hidden" />
          <div className="flex-1" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText("https://atoms.dev/invite/lin").catch(() => undefined);
              toast.success("邀请链接已复制");
            }}
            className="chip-btn hidden h-9 sm:flex"
          >
            <UserPlus className="h-4 w-4" /> 邀请
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button aria-label="通知" className="icon-btn relative">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#7C5CFF]" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="border-b border-[#F2F2F4] px-4 py-3 text-sm font-semibold">通知</div>
              {NOTIFICATIONS.map((n) => (
                <div key={n.title} className="px-4 py-3 hover:bg-[#F7F7F8]">
                  <p className="text-sm">{n.title}</p>
                  <p className="mt-0.5 text-xs text-[#9A9AA5]">{n.time}</p>
                </div>
              ))}
            </PopoverContent>
          </Popover>
          <button
            onClick={() => toast.success("即将前往定价页：Pro $15.8/月起")}
            className="h-9 rounded-[10px] bg-[#0B0B0F] px-3.5 text-sm font-medium text-white transition-colors hover:bg-[#2A2A33]"
          >
            升级
          </button>
        </header>

        <div className="mx-auto max-w-[1120px] px-4 md:px-8">
          <PromptBox ref={promptRef} value={prompt} onChange={setPrompt} onSubmit={submit} />
          <div ref={projectsRef} className="scroll-mt-16">
            <ProjectsSection
              ref={searchRef}
              tab={tab}
              onTabChange={setTab}
              projects={projects}
              setProjects={setProjects}
              onUseTemplate={(t) => {
                setPrompt(t.prompt);
                window.scrollTo({ top: 0, behavior: "smooth" });
                setTimeout(() => promptRef.current?.focus(), 300);
                toast(`已载入模板「${t.name}」的提示词`);
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
