import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowUp, Brain, FileText, GitBranch, Info, Loader2, MessagesSquare, Monitor, RotateCw, ScrollText, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import RequireAuth from '@/components/chat/RequireAuth';
import ProjectFormDialog from '@/components/project/ProjectFormDialog';
import RoleSpecDialog from '@/components/project/RoleSpecDialog';
import ProjectMemorySheet from '@/components/project/ProjectMemorySheet';
import PipelineRun from '@/components/project/PipelineRun';
import ArtifactPanel from '@/components/project/ArtifactPanel';
import { AGENT_AVATARS } from '@/lib/memchat';
import { LAST_PROJECT_KEY, errMsg, isUsable, projApi, type Project, type ProjectInput, type Run } from '@/lib/projects';

const POLL_MS = 1500;
const LATEST = 'latest';

function statusOf(e: unknown): number | undefined {
  const err = e as { response?: { status?: number }; status?: number };
  return err?.response?.status ?? err?.status;
}

function Workspace({ projectId }: { projectId: number }) {
  const [params, setParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState(params.get('tab') || 'preview');
  const [prompt, setPrompt] = useState('');
  const [baseId, setBaseId] = useState<string>(LATEST);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [memVersion, setMemVersion] = useState(0);
  const [mobilePane, setMobilePane] = useState<'chat' | 'artifact'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftKey = `atoms:draft:${projectId}`;

  const selectedVersion = Number(params.get('v')) || null;
  const setSelectedVersion = useCallback(
    (version: number | null, nextTab?: string) => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (version) next.set('v', String(version));
          else next.delete('v');
          if (nextTab) next.set('tab', nextTab);
          return next;
        },
        { replace: true },
      );
      if (nextTab) setTab(nextTab);
    },
    [setParams],
  );

  const load = useCallback(async () => {
    try {
      const res = await projApi.get(projectId);
      setProject(res.project);
      setRuns(res.runs);
      setLoadError('');
      localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify({ id: projectId, name: res.project.name }));
    } catch (e) {
      if (statusOf(e) === 404) {
        setNotFound(true);
        localStorage.removeItem(LAST_PROJECT_KEY);
      } else setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    setPrompt(sessionStorage.getItem(draftKey) || '');
  }, [load, draftKey]);

  useEffect(() => {
    if (prompt) sessionStorage.setItem(draftKey, prompt);
    else sessionStorage.removeItem(draftKey);
  }, [prompt, draftKey]);

  const runningRun = runs.find((r) => r.status === 'running');
  const runningId = runningRun?.id;

  useEffect(() => {
    if (!runningId) return;
    let stopped = false;
    let inflight = false;
    const timer = setInterval(async () => {
      if (inflight) return;
      inflight = true;
      try {
        const r = await projApi.run(projectId, runningId);
        if (stopped) return;
        setRuns((rs) => rs.map((x) => (x.id === r.id ? r : x)));
        if (r.status === 'done') {
          setSelectedVersion(r.version, 'preview');
          setMemVersion((v) => v + 1);
          toast.success(`v${r.version} 已生成`, { description: r.dev_output?.self_check.passed ? '开发自测通过' : '自测未完全通过，请查看报告' });
          load();
        } else if (r.status === 'failed') {
          toast.error(`v${r.version} 未完成`, { description: r.error });
        }
      } catch {
        /* transient polling error; retry on next tick */
      } finally {
        inflight = false;
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [runningId, projectId, load, setSelectedVersion]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [runs.length, runningRun?.stage]);

  const usableRuns = useMemo(() => runs.filter(isUsable), [runs]);
  const viewRun = useMemo(
    () => usableRuns.find((r) => r.version === selectedVersion) ?? usableRuns[usableRuns.length - 1],
    [usableRuns, selectedVersion],
  );

  const startRun = async (text: string, base: number | null) => {
    if (!text || submitting || runningRun) return false;
    setSubmitting(true);
    try {
      const run = await projApi.createRun(projectId, text, base);
      setRuns((rs) => [...rs, run]);
      setMobilePane('chat');
      return true;
    } catch (e) {
      toast.error('发起失败', { description: errMsg(e) });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const send = async () => {
    const base = baseId === LATEST ? null : Number(baseId);
    if (await startRun(prompt.trim(), base)) {
      setPrompt('');
      setBaseId(LATEST);
    }
  };

  const fixErrors = (errors: string[]) => {
    if (!viewRun) return;
    const text = `修复 v${viewRun.version} 预览中出现的运行时报错，保持现有功能不变：\n${errors.slice(0, 10).map((e) => `- ${e}`).join('\n')}`;
    startRun(text, viewRun.id).then((ok) => ok && toast.success('已交给开发工程师修复'));
  };

  const cancel = async (run: Run) => {
    setActionId(run.id);
    try {
      const r = await projApi.cancel(projectId, run.id);
      setRuns((rs) => rs.map((x) => (x.id === r.id ? r : x)));
      toast.success(`已停止 v${run.version}`);
    } catch (e) {
      toast.error('停止失败', { description: errMsg(e) });
    } finally {
      setActionId(null);
    }
  };

  const retry = async (run: Run) => {
    setActionId(run.id);
    try {
      const r = await projApi.retry(projectId, run.id);
      setRuns((rs) => rs.map((x) => (x.id === r.id ? r : x)));
      toast.success(`v${run.version} 已重新运行`);
    } catch (e) {
      toast.error('重试失败', { description: errMsg(e) });
    } finally {
      setActionId(null);
    }
  };

  const onVersionCreated = (run: Run) => {
    setRuns((rs) => [...rs, run]);
    setSelectedVersion(run.version, 'preview');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const saveInfo = async (data: ProjectInput) => {
    try {
      const p = await projApi.update(projectId, data);
      setProject((old) => (old ? { ...old, ...p, memory_count: old.memory_count } : p));
      toast.success('项目信息已更新');
    } catch (e) {
      toast.error('保存失败', { description: errMsg(e) });
      throw e;
    }
  };

  const refreshMemoryCount = useCallback(async () => {
    try {
      const items = (await projApi.memories(projectId)).items;
      setProject((p) => (p ? { ...p, memory_count: items.filter((m) => m.linked).length } : p));
    } catch {
      /* non-critical */
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-sm text-[#9A9AA5]">
        <Loader2 className="h-6 w-6 animate-spin" /> 正在恢复项目与流水线进度…
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-sm text-[#5B5B66]">
        项目不存在或已被删除
        <Link to="/projects" className="chip-btn">返回项目列表</Link>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[#5B5B66]">
        <AlertCircle className="h-7 w-7 text-[#DC2626]" />
        加载项目失败：{loadError || '未知错误'}
        <div className="flex gap-2">
          <button className="chip-btn" onClick={() => { setLoading(true); load(); }}><RotateCw className="h-4 w-4" /> 重新加载</button>
          <Link to="/projects" className="chip-btn">返回项目列表</Link>
        </div>
      </div>
    );
  }

  const busy = submitting || !!runningRun;
  const starter = project.goal ? `按照项目目标生成第一版：${project.goal}` : '';

  return (
    <div className="flex h-[100dvh] flex-col bg-white text-[#0B0B0F]">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-[#EFEFF2] px-3 md:px-4">
        <Link to="/projects" aria-label="返回项目列表" className="icon-btn"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <p className="truncate text-[11px] text-[#9A9AA5]">{project.goal || '未填写目标'}</p>
        </div>
        <button onClick={() => setEditOpen(true)} className="chip-btn h-9" title="项目信息" aria-label="项目信息">
          <FileText className="h-4 w-4" /><span className="hidden md:inline">项目信息</span>
        </button>
        <button onClick={() => setSpecOpen(true)} className="chip-btn h-9" title="角色规范" aria-label="角色规范">
          <ScrollText className="h-4 w-4" /><span className="hidden md:inline">角色规范</span>
        </button>
        <button onClick={() => setMemOpen(true)} className="chip-btn h-9" title="项目记忆" aria-label="项目记忆">
          <Brain className="h-4 w-4 text-[#7C5CFF]" /><span className="hidden sm:inline">记忆</span> {project.memory_count}
        </button>
        <Link to="/account" className="icon-btn" aria-label="个人中心" title="个人中心"><UserRound className="h-4 w-4" /></Link>
      </header>

      <div className="flex shrink-0 border-b border-[#EFEFF2] p-1.5 lg:hidden">
        {(['chat', 'artifact'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setMobilePane(p)}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px]', mobilePane === p ? 'bg-[#F2F2F4] font-medium' : 'text-[#5B5B66]')}
          >
            {p === 'chat' ? <MessagesSquare className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            {p === 'chat' ? '对话与流水线' : '预览 / 代码 / 版本'}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <section className={cn('min-h-0 w-full flex-col border-r border-[#EFEFF2] lg:flex lg:w-[440px] xl:w-[480px]', mobilePane === 'chat' ? 'flex' : 'hidden')}>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
            {runs.length === 0 ? (
              <div className="rounded-[16px] border border-[#E7E7EA] bg-[#FAFAFB] p-4">
                <div className="flex -space-x-2">
                  <img src={AGENT_AVATARS[0]} alt="" className="h-8 w-8 rounded-full border-2 border-white object-cover" />
                  <img src={AGENT_AVATARS[3]} alt="" className="h-8 w-8 rounded-full border-2 border-white object-cover" />
                </div>
                <h2 className="mt-3 text-[15px] font-semibold">AI 团队已就位</h2>
                <p className="mt-1 text-[13px] leading-5 text-[#5B5B66]">
                  描述你想做的应用：项目主管先拆解目标、制定方案，开发工程师再按方案编写代码（实时输出）并自测，完成后右侧会实时预览。
                </p>
                <ul className="mt-3 space-y-1 text-[12px] text-[#5B5B66]">
                  <li className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7C5CFF]" />已绑定 {project.memory_count} 条记忆，会作为两个角色的输入</li>
                  <li className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7C5CFF]" />每轮迭代、手动编辑和回滚都会生成新版本，可对比、回滚和下载</li>
                </ul>
                {starter && (
                  <button onClick={() => { setPrompt(starter); inputRef.current?.focus(); }} className="mt-3 rounded-full border border-[#E7E7EA] bg-white px-3 py-1.5 text-left text-[12px] text-[#5B5B66] hover:text-[#0B0B0F]">
                    {starter.length > 60 ? `${starter.slice(0, 60)}…` : starter}
                  </button>
                )}
              </div>
            ) : (
              runs.map((r) => (
                <PipelineRun
                  key={r.id}
                  run={r}
                  selected={viewRun?.id === r.id}
                  actionBusy={actionId === r.id}
                  canRetry={!runningRun && !submitting}
                  onPreview={() => {
                    setSelectedVersion(r.version, 'preview');
                    setMobilePane('artifact');
                  }}
                  onCancel={() => cancel(r)}
                  onRetry={() => retry(r)}
                />
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-[#F2F2F4] p-3">
            <div className="rounded-[16px] border border-[#E7E7EA] bg-white p-2.5 shadow-[0_4px_24px_rgba(15,15,20,0.05)] focus-within:border-[#CFCFD6]">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKey}
                rows={3}
                aria-label="输入本轮需求"
                placeholder={runs.length ? '追加需求继续迭代，例如：增加深色模式，统计数据用图表展示' : '描述你想做的应用…'}
                className="w-full resize-none bg-transparent px-1.5 text-[14px] leading-6 outline-none placeholder:text-[#9A9AA5]"
              />
              <div className="flex flex-wrap items-center gap-2">
                {usableRuns.length > 0 ? (
                  <label className="flex items-center gap-1 text-[11px] text-[#5B5B66]">
                    <GitBranch className="h-3.5 w-3.5" /> 基于
                    <select
                      aria-label="迭代的基础版本"
                      value={baseId}
                      onChange={(e) => setBaseId(e.target.value)}
                      className="h-6 rounded-md border border-[#E7E7EA] bg-white px-1 text-[11px]"
                    >
                      <option value={LATEST}>最新版本 v{usableRuns[usableRuns.length - 1].version}</option>
                      {[...usableRuns].reverse().slice(1).map((r) => (
                        <option key={r.id} value={r.id}>v{r.version}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="text-[11px] text-[#9A9AA5]">项目主管 → 开发工程师（含自测）→ 记忆沉淀</span>
                )}
                <span className="flex-1" />
                {runningRun && <span className="text-[11px] text-[#9A9AA5]">v{runningRun.version} 构建中</span>}
                <button
                  aria-label="开始构建"
                  disabled={!prompt.trim() || busy}
                  onClick={send}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-[10px] px-3 text-[13px] font-medium transition-colors',
                    prompt.trim() && !busy ? 'bg-[#0B0B0F] text-white hover:bg-[#2A2A33]' : 'cursor-not-allowed bg-[#ECECEF] text-[#9A9AA5]',
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{runs.length ? '迭代' : '构建'} <ArrowUp className="h-4 w-4" /></>}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={cn('min-h-0 min-w-0 flex-1 lg:block', mobilePane === 'artifact' ? 'block' : 'hidden')}>
          <ArtifactPanel
            projectId={projectId}
            runs={runs}
            viewRun={viewRun}
            tab={tab}
            onTabChange={(t) => {
              setTab(t);
              setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
            }}
            onSelectRun={(id) => {
              const r = runs.find((x) => x.id === id);
              if (r) setSelectedVersion(r.version, 'preview');
            }}
            onVersionCreated={onVersionCreated}
            onFixErrors={fixErrors}
            fixDisabled={busy}
          />
        </section>
      </div>

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="项目信息"
        submitLabel="保存"
        initial={{ name: project.name, goal: project.goal, background: project.background, acceptance: project.acceptance }}
        onSubmit={saveInfo}
      />
      <RoleSpecDialog open={specOpen} onOpenChange={setSpecOpen} />
      <ProjectMemorySheet projectId={projectId} open={memOpen} onOpenChange={setMemOpen} version={memVersion} onChanged={refreshMemoryCount} />
    </div>
  );
}

export default function ProjectWorkspace() {
  const { id } = useParams();
  const projectId = Number(id);
  return (
    <RequireAuth>
      {Number.isFinite(projectId) && projectId > 0 ? (
        <Workspace key={projectId} projectId={projectId} />
      ) : (
        <div className="flex h-screen items-center justify-center text-sm text-[#5B5B66]">无效的项目地址</div>
      )}
    </RequireAuth>
  );
}
