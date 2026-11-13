import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Brain, FolderKanban, Loader2, LogOut, MessageSquare, RotateCw, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import RequireAuth from '@/components/chat/RequireAuth';
import { AtomsLogo } from '@/components/chat/ChatSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { MODE_OPTIONS, errMsg, memApi, type MemoryMode } from '@/lib/memchat';
import { projApi } from '@/lib/projects';

interface Stats {
  conversations: number;
  projects: number;
  memories: number;
  rules: number;
  mode: MemoryMode;
}

function AccountInner() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [c, p, m, r, s] = await Promise.all([memApi.conversations(), projApi.list(), memApi.memories(), memApi.rules(), memApi.getMode()]);
      setStats({ conversations: c.items.length, projects: p.items.length, memories: m.items.length, rules: r.items.length, mode: s.mode });
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doLogout = async () => {
    setLeaving(true);
    localStorage.removeItem('atoms:lastConversation');
    localStorage.removeItem('atoms:lastProject');
    await logout();
  };

  if (!user) return null;
  const initial = (user.name || user.email || 'U').slice(0, 1).toUpperCase();
  const cards = stats
    ? [
        { label: '对话', value: stats.conversations, Icon: MessageSquare, to: '/' },
        { label: '项目', value: stats.projects, Icon: FolderKanban, to: '/projects' },
        { label: '长期记忆', value: stats.memories, Icon: Brain, to: '/' },
        { label: '规则', value: stats.rules, Icon: ShieldCheck, to: '/' },
      ]
    : [];

  return (
    <div className="min-h-[100dvh] bg-[#FAFAFB] text-[#0B0B0F]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[#F2F2F4] bg-white/90 px-4 backdrop-blur md:px-8">
        <Link to="/" aria-label="返回对话" className="icon-btn"><ArrowLeft className="h-4 w-4" /></Link>
        <AtomsLogo />
        <span className="text-[13px] text-[#9A9AA5]">/ 个人中心</span>
      </header>

      <main className="mx-auto max-w-[880px] space-y-5 px-4 py-8 md:px-8">
        <section className="flex flex-col gap-4 rounded-[16px] border border-[#E7E7EA] bg-white p-5 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#C25BFF] text-2xl font-semibold text-white">{initial}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-bold">{user.name || '我的账号'}</h1>
            <p className="truncate text-[14px] text-[#5B5B66]">{user.email || '未提供邮箱'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-md bg-[#F2F2F4] px-1.5 py-0.5 text-[#5B5B66]">角色：{user.role === 'admin' ? '管理员' : '用户'}</span>
              {user.last_login && <span className="rounded-md bg-[#F2F2F4] px-1.5 py-0.5 text-[#5B5B66]">最近登录：{new Date(user.last_login).toLocaleString('zh-CN')}</span>}
              <span className="max-w-full truncate rounded-md bg-[#F2F2F4] px-1.5 py-0.5 font-mono text-[#9A9AA5]">ID {user.id}</span>
            </div>
          </div>
          <button onClick={() => setConfirm(true)} className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#FECACA] px-4 text-[14px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2]">
            <LogOut className="h-4 w-4" /> 退出登录
          </button>
        </section>

        <section>
          <h2 className="mb-3 text-[15px] font-semibold">我的数据</h2>
          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">
              加载失败：{error}
              <button onClick={load} className="chip-btn h-8 bg-white"><RotateCw className="h-3.5 w-3.5" /> 重试</button>
            </div>
          ) : !stats ? (
            <div className="flex justify-center rounded-[14px] border border-[#E7E7EA] bg-white py-10"><Loader2 className="h-5 w-5 animate-spin text-[#9A9AA5]" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {cards.map(({ label, value, Icon, to }) => (
                <Link key={label} to={to} className="rounded-[14px] border border-[#E7E7EA] bg-white p-4 transition-shadow hover:shadow-[0_4px_20px_rgba(15,15,20,0.06)]">
                  <Icon className="h-4 w-4 text-[#7C5CFF]" />
                  <p className="mt-3 text-[26px] font-bold leading-none">{value}</p>
                  <p className="mt-1 text-[12px] text-[#5B5B66]">{label}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {stats && (
          <section className="rounded-[14px] border border-[#E7E7EA] bg-white p-4 text-[13px] text-[#5B5B66]">
            当前记忆模式：<span className="font-medium text-[#0B0B0F]">{MODE_OPTIONS.find((o) => o.value === stats.mode)?.label}</span>
            <span className="ml-1">（{MODE_OPTIONS.find((o) => o.value === stats.mode)?.desc}），可在对话页侧边栏切换。</span>
          </section>
        )}
      </main>

      <Dialog open={confirm} onOpenChange={(o) => !leaving && setConfirm(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>退出登录？</DialogTitle></DialogHeader>
          <p className="text-sm text-[#5B5B66]">你的对话、记忆和项目都保存在账号中，重新登录即可继续。</p>
          <DialogFooter>
            <Button variant="outline" disabled={leaving} onClick={() => setConfirm(false)}>取消</Button>
            <Button className="bg-[#DC2626] text-white hover:bg-[#B91C1C]" disabled={leaving} onClick={doLogout}>
              {leaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 退出登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Account() {
  return (
    <RequireAuth>
      <AccountInner />
    </RequireAuth>
  );
}
