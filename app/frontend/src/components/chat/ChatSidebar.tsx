import { Brain, ChevronsUpDown, FolderKanban, LogOut, MessageSquare, PanelLeftClose, Plus, Trash2, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { LOGO_URL, MODE_OPTIONS, formatTime, type Conversation, type MemoryMode } from '@/lib/memchat';

interface Props {
  conversations: Conversation[];
  activeId: number | null;
  busy: boolean;
  mode: MemoryMode;
  memoryCount: number;
  userName: string;
  userEmail: string;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onModeChange: (m: MemoryMode) => void;
  onOpenMemory: () => void;
  onOpenProjects: () => void;
  onOpenAccount: () => void;
  onRetryList: () => void;
  listError: string;
  onLogout: () => void;
  onCollapse?: () => void;
}

export function AtomsLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img src={LOGO_URL} alt="Atoms" className="h-6 w-6" />
      <span className="text-[17px] font-bold tracking-tight">Atoms</span>
    </div>
  );
}

export default function ChatSidebar(p: Props) {
  return (
    <aside className="flex h-full w-[260px] flex-col bg-[#F7F7F8] px-3 py-3">
      <div className="flex h-10 items-center justify-between px-2">
        <AtomsLogo />
        {p.onCollapse && (
          <button aria-label="收起侧边栏" onClick={p.onCollapse} className="icon-btn">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <button
        onClick={p.onNew}
        disabled={p.busy}
        className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-[#0B0B0F] text-sm font-medium text-white transition-colors hover:bg-[#2A2A33] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> 新建对话
      </button>

      <button onClick={p.onOpenProjects} className="nav-item mt-2">
        <FolderKanban className="h-4 w-4" />
        <span className="flex-1 text-left">项目工作区</span>
      </button>

      <button onClick={p.onOpenMemory} className="nav-item">
        <Brain className="h-4 w-4" />
        <span className="flex-1 text-left">记忆管理</span>
        <span className="rounded-md bg-white px-1.5 text-[11px] text-[#5B5B66]">{p.memoryCount}</span>
      </button>

      <div className="mt-4 px-2.5 text-[11px] font-medium uppercase tracking-wider text-[#9A9AA5]">对话</div>
      <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {p.listError ? (
          <div className="px-2.5 py-3 text-xs text-[#B91C1C]">
            对话列表加载失败
            <button onClick={p.onRetryList} className="ml-1 font-medium underline">重试</button>
          </div>
        ) : (
          p.conversations.length === 0 && <p className="px-2.5 py-3 text-xs text-[#9A9AA5]">还没有对话，开始第一段吧</p>
        )}
        {p.conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-center rounded-lg border border-transparent transition-colors hover:bg-[#ECECEF]',
              p.activeId === c.id && 'border-[#E7E7EA] bg-white shadow-sm hover:bg-white',
            )}
          >
            <button
              onClick={() => p.onSelect(c.id)}
              disabled={p.busy}
              className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left disabled:cursor-not-allowed"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#9A9AA5]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{c.title}</span>
                <span className="block text-[11px] text-[#9A9AA5]">{formatTime(c.last_active)}</span>
              </span>
            </button>
            <button
              aria-label={`删除对话 ${c.title}`}
              disabled={p.busy}
              onClick={() => p.onDelete(c.id)}
              className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[#9A9AA5] hover:bg-[#F2F2F4] hover:text-[#DC2626] lg:hidden lg:group-hover:flex"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </nav>

      <div className="mt-3 rounded-[14px] border border-[#E7E7EA] bg-white p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Brain className="h-3.5 w-3.5 text-[#7C5CFF]" /> 记忆模式
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-[#F2F2F4] p-1" role="radiogroup" aria-label="记忆模式">
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={p.mode === o.value}
              title={o.desc}
              onClick={() => p.onModeChange(o.value)}
              className={cn(
                'rounded-md px-1 py-1.5 text-[11px] leading-tight transition-colors',
                p.mode === o.value ? 'bg-white font-semibold text-[#0B0B0F] shadow-sm' : 'text-[#5B5B66] hover:text-[#0B0B0F]',
              )}
            >
              {o.value === 'learn' ? '自动学习' : o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[#9A9AA5]">{MODE_OPTIONS.find((o) => o.value === p.mode)?.desc}</p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="mt-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[#ECECEF]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#C25BFF] text-sm font-semibold text-white">
              {(p.userName || p.userEmail || 'U').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium leading-4">{p.userName || '我的账号'}</span>
              <span className="block truncate text-xs text-[#9A9AA5]">{p.userEmail}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[#9A9AA5]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-[#9A9AA5]">{p.userEmail}</DropdownMenuLabel>
          <DropdownMenuItem onClick={p.onOpenAccount}>
            <UserRound className="mr-2 h-4 w-4" />
            个人中心
          </DropdownMenuItem>
          <DropdownMenuItem onClick={p.onOpenMemory}>
            <Brain className="mr-2 h-4 w-4" />
            记忆管理
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={p.onLogout} className="text-[#DC2626]">
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
