import {
  Home, Search, FolderOpen, Star, Users, LayoutTemplate, Compass, Plus,
  ChevronsUpDown, PanelLeftClose, Settings, CreditCard, HelpCircle, LogOut, Gift, Check,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NavKey = "home" | "projects" | "starred" | "shared" | "templates" | "discover";

const NAV: { key: NavKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "首页", icon: Home },
  { key: "projects", label: "我的项目", icon: FolderOpen },
  { key: "starred", label: "已收藏", icon: Star },
  { key: "shared", label: "与我共享", icon: Users },
  { key: "templates", label: "模板", icon: LayoutTemplate },
  { key: "discover", label: "发现", icon: Compass },
];

const WORKSPACES = ["我的工作区", "设计团队"];

interface SidebarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  onNewProject: () => void;
  onSearch: () => void;
  onCollapse?: () => void;
  credits: number;
}

export function AtomsLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <img
        src="https://public-frontend-cos.metadl.com/nuxt-mgx/prod/assets/Union.CbOOVtn6.svg"
        alt="Atoms"
        className="h-6 w-6"
      />
      <span className="text-[17px] font-bold tracking-tight">Atoms</span>
    </div>
  );
}

export default function Sidebar({ active, onNavigate, onNewProject, onSearch, onCollapse, credits }: SidebarProps) {
  const [workspace, setWorkspace] = useState(WORKSPACES[0]);

  return (
    <aside className="flex h-full w-[248px] flex-col bg-[#F7F7F8] px-3 py-3">
      <div className="flex h-10 items-center justify-between px-2">
        <AtomsLogo />
        {onCollapse && (
          <button aria-label="收起侧边栏" onClick={onCollapse} className="icon-btn">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="mt-3 flex h-11 w-full items-center gap-2 rounded-[10px] border border-[#E7E7EA] bg-white px-2.5 text-left transition-colors hover:bg-[#F2F2F4]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0B0B0F] text-xs font-semibold text-white">
              {workspace[0]}
            </span>
            <span className="flex-1 truncate text-sm font-medium">{workspace}</span>
            <span className="rounded bg-[#F2F2F4] px-1.5 text-[11px] text-[#5B5B66]">Free</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[#9A9AA5]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel className="text-xs text-[#9A9AA5]">切换工作区</DropdownMenuLabel>
          {WORKSPACES.map((w) => (
            <DropdownMenuItem key={w} onClick={() => setWorkspace(w)}>
              <span className="flex-1">{w}</span>
              {w === workspace && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("创建工作区需要升级到 Pro 方案")}>
            <Plus className="mr-2 h-4 w-4" /> 新建工作区
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button onClick={onNewProject} className="mt-3 h-10 rounded-[10px] bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
        <Plus className="mr-1 h-4 w-4" /> 新建项目
      </Button>

      <button onClick={onSearch} className="nav-item mt-3">
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">搜索项目</span>
        <kbd className="rounded border border-[#E7E7EA] bg-white px-1.5 text-[10px] text-[#9A9AA5]">⌘K</kbd>
      </button>

      <nav className="mt-1 flex flex-col gap-0.5">
        {NAV.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className={cn("nav-item", active === key && "border-[#E7E7EA] bg-white font-medium text-[#0B0B0F] shadow-sm")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="rounded-[14px] border border-[#E7E7EA] bg-white p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">每日积分</span>
          <span className="text-[#5B5B66]">{credits} / 15</span>
        </div>
        <Progress value={(credits / 15) * 100} className="mt-2 h-1.5 bg-[#F2F2F4] [&>div]:bg-[#7C5CFF]" />
        <p className="mt-2 text-[11px] leading-4 text-[#9A9AA5]">每日 0 点重置 · 本月最多 25 积分</p>
        <Button
          size="sm"
          onClick={() => toast.success("即将前往定价页：Pro $15.8/月起")}
          className="mt-3 h-8 w-full rounded-lg bg-gradient-to-r from-[#7C5CFF] to-[#C25BFF] text-white hover:opacity-90"
        >
          升级到 Pro
        </Button>
      </div>

      <button onClick={() => toast("邀请好友注册，双方各得 50 积分")} className="nav-item mt-2">
        <Gift className="h-4 w-4" /> 邀请得积分
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="mt-1 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[#ECECEF]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#C25BFF] text-sm font-semibold text-white">
              林
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-medium leading-4">林小满</span>
              <span className="block text-xs text-[#9A9AA5]">lin@example.com</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[#9A9AA5]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuItem onClick={() => toast("打开设置")}><Settings className="mr-2 h-4 w-4" />设置</DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast("打开定价与账单")}><CreditCard className="mr-2 h-4 w-4" />定价与账单</DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast("打开帮助中心")}><HelpCircle className="mr-2 h-4 w-4" />帮助中心</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast("已退出登录（演示）")} className="text-[#DC2626]">
            <LogOut className="mr-2 h-4 w-4" />退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
