import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, FolderKanban, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AtomsLogo } from '@/components/chat/ChatSidebar';
import RequireAuth from '@/components/chat/RequireAuth';
import ProjectFormDialog from '@/components/project/ProjectFormDialog';
import { formatTime } from '@/lib/memchat';
import { errMsg, projApi, type Project } from '@/lib/projects';
import { cn } from '@/lib/utils';

const GRADIENTS = [
  'from-violet-200 via-fuchsia-100 to-white',
  'from-sky-200 via-cyan-100 to-white',
  'from-amber-200 via-orange-100 to-white',
  'from-emerald-200 via-teal-100 to-white',
  'from-rose-200 via-pink-100 to-white',
];

function ProjectsInner() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const load = useCallback(async () => {
    try {
      setProjects((await projApi.list()).items);
    } catch (e) {
      toast.error('加载项目失败', { description: errMsg(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (data: Parameters<typeof projApi.create>[0]) => {
    try {
      const p = await projApi.create(data);
      toast.success('项目已创建');
      navigate(`/projects/${p.id}`);
    } catch (e) {
      toast.error('创建失败', { description: errMsg(e) });
      throw e;
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await projApi.remove(deleting.id);
      setProjects((ps) => ps.filter((p) => p.id !== deleting.id));
      toast.success('项目已删除（长期记忆保留）');
    } catch (e) {
      toast.error('删除失败', { description: errMsg(e) });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#0B0B0F]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[#F2F2F4] bg-white/90 px-4 backdrop-blur md:px-8">
        <Link to="/" aria-label="返回对话" className="icon-btn"><ArrowLeft className="h-4 w-4" /></Link>
        <AtomsLogo />
        <nav className="ml-4 flex rounded-[10px] bg-[#F2F2F4] p-1 text-[13px]">
          <Link to="/" className="rounded-lg px-3 py-1 text-[#5B5B66] hover:text-[#0B0B0F]">对话</Link>
          <span className="rounded-lg bg-white px-3 py-1 font-medium shadow-sm">项目</span>
        </nav>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 py-10 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">项目工作区</h1>
            <p className="mt-1 text-sm text-[#5B5B66]">项目主管拆解方案，开发工程师按方案编码并自测，每轮迭代生成一个可预览的版本。</p>
          </div>
          <Button onClick={() => setCreating(true)} className="h-10 rounded-[10px] bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
            <Plus className="mr-1 h-4 w-4" /> 新建项目
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#9A9AA5]" /></div>
        ) : projects.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="mt-8 flex w-full flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[#E7E7EA] py-20 text-center transition-colors hover:bg-[#FAFAFB]"
          >
            <FolderKanban className="h-9 w-9 text-[#9A9AA5]" />
            <span className="text-sm font-medium">创建你的第一个项目</span>
            <span className="text-xs text-[#9A9AA5]">填写目标与验收标准，绑定记忆，然后让 AI 团队开工</span>
          </button>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <article key={p.id} className="card group cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className={cn('relative flex aspect-[16/9] items-end rounded-[10px] bg-gradient-to-br p-3', GRADIENTS[i % GRADIENTS.length])}>
                  <span className="text-3xl font-bold text-[#0B0B0F]/25">{p.name.slice(0, 2)}</span>
                  <div className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button aria-label="更多操作" className="icon-btn bg-white/90"><MoreHorizontal className="h-4 w-4" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-[#DC2626]" onClick={() => setDeleting(p)}>
                          <Trash2 className="mr-2 h-4 w-4" /> 删除项目
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {p.latest_status && (
                    <span
                      className={cn(
                        'absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium',
                        p.latest_status === 'done' ? 'text-[#15803D]' : p.latest_status === 'running' ? 'text-[#5B3FD9]' : 'text-[#B91C1C]',
                      )}
                    >
                      v{p.latest_version} · {p.latest_status === 'done' ? '已完成' : p.latest_status === 'running' ? '构建中' : '失败'}
                    </span>
                  )}
                </div>
                <div className="mt-3 px-1 pb-1">
                  <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                  <p className="mt-0.5 line-clamp-2 min-h-[36px] text-xs leading-[18px] text-[#5B5B66]">{p.goal || '未填写项目目标'}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[#9A9AA5]">
                    <span className="flex items-center gap-1"><Brain className="h-3 w-3" />{p.memory_count} 条记忆</span>
                    <span>更新于 {formatTime(p.update_time)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <ProjectFormDialog open={creating} onOpenChange={setCreating} title="新建项目" submitLabel="创建并进入" onSubmit={create} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>删除「{deleting?.name}」？</DialogTitle></DialogHeader>
          <p className="text-sm text-[#5B5B66]">项目的所有版本和对话都会被删除，已沉淀的长期记忆会保留在记忆库中。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>取消</Button>
            <Button className="bg-[#DC2626] text-white hover:bg-[#B91C1C]" onClick={remove}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Projects() {
  return (
    <RequireAuth>
      <ProjectsInner />
    </RequireAuth>
  );
}
