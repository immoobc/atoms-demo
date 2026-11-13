import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Bug,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Folder,
  GitCompare,
  Loader2,
  Monitor,
  Pencil,
  RotateCcw,
  RotateCw,
  Save,
  Smartphone,
  Tablet,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/memchat';
import {
  PREVIEW_MSG,
  bundleHtml,
  downloadZip,
  errMsg,
  isUsable,
  projApi,
  runKind,
  sortFiles,
  type Run,
} from '@/lib/projects';
import { CodeEditor, CodeView } from './CodeView';
import DiffView from './DiffView';

interface Props {
  projectId: number;
  runs: Run[];
  viewRun: Run | undefined;
  tab: string;
  onTabChange: (t: string) => void;
  onSelectRun: (id: number) => void;
  onVersionCreated: (run: Run) => void;
  onFixErrors: (errors: string[]) => void;
  fixDisabled: boolean;
}

const KIND_LABEL = { pipeline: 'AI 构建', manual: '手动编辑', rollback: '回滚' } as const;

function EmptyState({ running }: { running: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#5B5B66]">
      {running ? <Loader2 className="h-6 w-6 animate-spin text-[#7C5CFF]" /> : <Monitor className="h-7 w-7 text-[#9A9AA5]" />}
      <p>{running ? 'AI 团队正在构建，完成后会在这里实时预览' : '在左侧描述你想做的应用，生成后会在这里预览'}</p>
    </div>
  );
}

const DEVICES = [
  { key: 'desktop', label: '桌面尺寸', Icon: Monitor, width: '100%' },
  { key: 'tablet', label: '平板尺寸', Icon: Tablet, width: '820px' },
  { key: 'mobile', label: '手机尺寸', Icon: Smartphone, width: '390px' },
] as const;

async function onDownload(projectId: number, run: Run) {
  try {
    await downloadZip(projectId, run.id);
  } catch (e) {
    toast.error('下载失败', { description: errMsg(e) });
  }
}

function PreviewPane({ run, onFixErrors, fixDisabled }: { run: Run; onFixErrors: (e: string[]) => void; fixDisabled: boolean }) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]['key']>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => bundleHtml(run.files), [run.files]);
  const width = DEVICES.find((d) => d.key === device)?.width ?? '100%';

  useEffect(() => {
    setErrors([]);
    setShowErrors(false);
  }, [html, reloadKey]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as { [PREVIEW_MSG]?: number; message?: string } | null;
      if (!data || data[PREVIEW_MSG] !== 1 || !data.message) return;
      const msg = data.message;
      setErrors((es) => (es.includes(msg) || es.length >= 30 ? es : [...es, msg]));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const openTab = () => {
    const url = URL.createObjectURL(new Blob([bundleHtml(run.files, false)], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#F2F2F4] px-3">
        <span className="rounded bg-[#F2F2F4] px-1.5 font-mono text-[11px]">v{run.version}</span>
        <span className="hidden truncate text-[12px] text-[#9A9AA5] sm:inline">{Object.keys(run.files).length} 个文件已合并 · 沙箱预览</span>
        <span className="flex-1" />
        {DEVICES.map(({ key, label, Icon }) => (
          <button
            key={key}
            aria-label={label}
            title={label}
            onClick={() => setDevice(key)}
            className={cn('icon-btn h-7 w-7', device === key && 'bg-[#F2F2F4] text-[#0B0B0F]')}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#E7E7EA]" />
        <button aria-label="刷新预览" title="刷新预览" className="icon-btn h-7 w-7" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        <button aria-label="在新标签页打开" title="在新标签页打开" className="icon-btn h-7 w-7" onClick={openTab}>
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#F7F7F8] p-3">
        <iframe
          ref={iframeRef}
          key={`${run.id}-${reloadKey}`}
          title={`预览 v${run.version}`}
          srcDoc={html}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          style={{ width, maxWidth: '100%' }}
          className="h-full rounded-[12px] border border-[#E7E7EA] bg-white shadow-sm transition-[width] duration-300"
        />
      </div>
      <div className="shrink-0 border-t border-[#F2F2F4] bg-white">
        <div className="flex h-9 items-center gap-2 px-3 text-[12px]">
          {errors.length ? (
            <button onClick={() => setShowErrors((s) => !s)} className="flex items-center gap-1.5 font-medium text-[#B91C1C]">
              <Bug className="h-3.5 w-3.5" /> 控制台捕获 {errors.length} 个报错
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-[#15803D]">
              <Check className="h-3.5 w-3.5" /> 预览运行中，暂无报错
            </span>
          )}
          <span className="flex-1" />
          {errors.length > 0 && (
            <button
              disabled={fixDisabled}
              onClick={() => onFixErrors(errors)}
              className="flex h-7 items-center gap-1 rounded-md bg-[#0B0B0F] px-2.5 font-medium text-white hover:bg-[#2A2A33] disabled:cursor-not-allowed disabled:bg-[#ECECEF] disabled:text-[#9A9AA5]"
            >
              <Wrench className="h-3.5 w-3.5" /> 交给开发修复
            </button>
          )}
        </div>
        {showErrors && errors.length > 0 && (
          <ul className="max-h-36 space-y-1 overflow-y-auto border-t border-[#F2F2F4] bg-[#FEF2F2]/50 px-3 py-2 font-mono text-[11.5px] text-[#991B1B]">
            {errors.map((e) => (
              <li key={e} className="break-all">• {e}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileTree({ names, current, dirty, onSelect }: { names: string[]; current: string; dirty: Set<string>; onSelect: (n: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const n of names) {
      const dir = n.includes('/') ? n.slice(0, n.lastIndexOf('/')) : '';
      map.set(dir, [...(map.get(dir) ?? []), n]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [names]);
  return (
    <>
      {groups.map(([dir, files]) => (
        <div key={dir || '.'}>
          {dir && (
            <p className="flex items-center gap-1 px-2 pb-0.5 pt-2 text-[11px] text-[#9A9AA5]">
              <Folder className="h-3 w-3" /> {dir}
            </p>
          )}
          {files.map((n) => (
            <button
              key={n}
              onClick={() => onSelect(n)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[12px] transition-colors',
                dir && 'pl-4',
                n === current ? 'bg-white font-medium text-[#0B0B0F] shadow-sm ring-1 ring-[#E7E7EA]' : 'text-[#5B5B66] hover:bg-[#F2F2F4]',
              )}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{dir ? n.slice(dir.length + 1) : n}</span>
              {dirty.has(n) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" aria-label="已修改" />}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function CodePane({ run, projectId, onVersionCreated }: { run: Run; projectId: number; onVersionCreated: (r: Run) => void }) {
  const names = useMemo(() => sortFiles(Object.keys(run.files)), [run.files]);
  const [active, setActive] = useState(names[0]);
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = names.includes(active) ? active : names[0];
  const source = drafts ?? run.files;
  const content = source[current] ?? '';
  const dirty = useMemo(() => new Set(drafts ? names.filter((n) => drafts[n] !== run.files[n]) : []), [drafts, names, run.files]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败，请手动选择代码复制');
    }
  };

  const save = async () => {
    if (!drafts) return;
    if (!dirty.size) {
      toast.info('没有改动，无需保存');
      return;
    }
    setSaving(true);
    try {
      const created = await projApi.saveVersion(projectId, drafts, run.id, `手动编辑 ${[...dirty].join('、')}（基于 v${run.version}）`);
      toast.success(`已保存为 v${created.version}`);
      setDrafts(null);
      onVersionCreated(created);
    } catch (e) {
      toast.error('保存失败', { description: errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-44 shrink-0 overflow-y-auto border-r border-[#F2F2F4] bg-[#FAFAFB] p-2 sm:block">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-[#9A9AA5]">文件 · v{run.version}</p>
        <FileTree names={names} current={current} dirty={dirty} onSelect={setActive} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[#F2F2F4] px-3">
          <select
            aria-label="选择文件"
            value={current}
            onChange={(e) => setActive(e.target.value)}
            className="h-7 rounded-md border border-[#E7E7EA] bg-white px-1.5 font-mono text-[12px] sm:hidden"
          >
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="hidden truncate font-mono text-[12px] sm:inline">{current}</span>
          <span className="hidden text-[11px] text-[#9A9AA5] md:inline">{content.split('\n').length} 行</span>
          {drafts && <span className="rounded bg-[#FFF8EB] px-1.5 py-0.5 text-[11px] text-[#B45309]">编辑中 · {dirty.size} 个文件已改动</span>}
          <span className="flex-1" />
          {drafts ? (
            <>
              <button onClick={() => setDrafts(null)} disabled={saving} className="chip-btn h-7">
                <X className="h-3.5 w-3.5" /> 取消
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex h-7 items-center gap-1 rounded-md bg-[#0B0B0F] px-2.5 text-[12px] font-medium text-white hover:bg-[#2A2A33] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存为新版本
              </button>
            </>
          ) : (
            <>
              <button onClick={copy} className="chip-btn h-7" title="复制当前文件">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden md:inline">{copied ? '已复制' : '复制'}</span>
              </button>
              <button onClick={() => onDownload(projectId, run)} className="chip-btn h-7" title="打包下载 zip">
                <Download className="h-3.5 w-3.5" /> <span className="hidden md:inline">下载 zip</span>
              </button>
              <button onClick={() => setDrafts({ ...run.files })} className="chip-btn h-7" title="在线编辑">
                <Pencil className="h-3.5 w-3.5" /> 编辑
              </button>
            </>
          )}
        </div>
        {drafts ? (
          <CodeEditor key={current} value={content} path={current} onChange={(v) => setDrafts((d) => ({ ...(d ?? run.files), [current]: v }))} />
        ) : (
          <CodeView code={content} path={current} />
        )}
      </div>
    </div>
  );
}

function VersionsPane({
  projectId,
  runs,
  viewRun,
  onSelectRun,
  onVersionCreated,
}: {
  projectId: number;
  runs: Run[];
  viewRun: Run | undefined;
  onSelectRun: (id: number) => void;
  onVersionCreated: (r: Run) => void;
}) {
  const usable = runs.filter(isUsable);
  const latestUsable = usable[usable.length - 1];
  const [compare, setCompare] = useState<{ from: number; to: number } | null>(null);
  const [rollbackRun, setRollbackRun] = useState<Run | null>(null);
  const [rolling, setRolling] = useState(false);

  const startCompare = (r: Run) => {
    const target = viewRun && viewRun.id !== r.id ? viewRun : usable.filter((x) => x.id !== r.id).pop();
    if (!target) {
      toast.info('至少需要两个可用版本才能对比');
      return;
    }
    const [from, to] = r.version < target.version ? [r, target] : [target, r];
    setCompare({ from: from.id, to: to.id });
  };

  const doRollback = async () => {
    if (!rollbackRun) return;
    setRolling(true);
    try {
      const created = await projApi.rollback(projectId, rollbackRun.id);
      toast.success(`已回滚：v${rollbackRun.version} 的代码保存为 v${created.version}`);
      onVersionCreated(created);
      setRollbackRun(null);
    } catch (e) {
      toast.error('回滚失败', { description: errMsg(e) });
    } finally {
      setRolling(false);
    }
  };

  if (!runs.length) return <div className="p-6 text-center text-sm text-[#9A9AA5]">还没有版本，构建完成后会出现在这里</div>;

  if (compare) {
    const from = usable.find((r) => r.id === compare.from);
    const to = usable.find((r) => r.id === compare.to);
    const picker = (value: number, onChange: (id: number) => void, label: string) => (
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-md border border-[#E7E7EA] bg-white px-2 text-[12px]"
      >
        {usable.map((r) => (
          <option key={r.id} value={r.id}>v{r.version} · {KIND_LABEL[runKind(r)]}</option>
        ))}
      </select>
    );
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#F2F2F4] px-3 py-2">
          <GitCompare className="h-4 w-4 text-[#7C5CFF]" />
          {picker(compare.from, (id) => setCompare({ ...compare, from: id }), '旧版本')}
          <button aria-label="交换" className="icon-btn h-7 w-7" onClick={() => setCompare({ from: compare.to, to: compare.from })}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
          {picker(compare.to, (id) => setCompare({ ...compare, to: id }), '新版本')}
          <span className="flex-1" />
          <button className="chip-btn h-8" onClick={() => setCompare(null)}>
            <X className="h-3.5 w-3.5" /> 关闭对比
          </button>
        </div>
        {from && to ? <DiffView key={`${from.id}-${to.id}`} from={from} to={to} /> : <p className="p-4 text-sm text-[#9A9AA5]">版本不可用</p>}
      </div>
    );
  }

  return (
    <div className="h-full space-y-2 overflow-y-auto p-4">
      {[...runs].reverse().map((r) => {
        const ok = isUsable(r);
        const kind = runKind(r);
        return (
          <div
            key={r.id}
            className={cn(
              'rounded-[12px] border p-3 transition-colors',
              viewRun?.id === r.id ? 'border-[#CFC3FF] bg-[#FAF8FF]' : 'border-[#E7E7EA] bg-white',
            )}
          >
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-[#0B0B0F] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">v{r.version}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[13px]">{r.prompt}</span>
                <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[#9A9AA5]">
                  <span className="rounded bg-[#F2F2F4] px-1 text-[#5B5B66]">{KIND_LABEL[kind]}</span>
                  <span>{formatTime(r.create_time)}</span>
                  {ok && <span>{Object.keys(r.files).length} 个文件</span>}
                  {r.dev_output && (
                    <span className={r.dev_output.self_check.passed ? 'text-[#15803D]' : 'text-[#B45309]'}>
                      {kind === 'pipeline' ? (r.dev_output.self_check.passed ? '自测通过' : '自测未通过') : r.dev_output.self_check.passed ? '静态检查通过' : '静态检查未通过'}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  r.status === 'done' && 'bg-[#EFFAF3] text-[#15803D]',
                  r.status === 'running' && 'bg-[#F5F2FF] text-[#5B3FD9]',
                  r.status === 'failed' && 'bg-[#FEF2F2] text-[#B91C1C]',
                )}
              >
                {r.status === 'done' ? (viewRun?.id === r.id ? '当前查看' : '已完成') : r.status === 'running' ? '构建中' : '失败'}
              </span>
            </div>
            {ok && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 pl-10">
                <button className="chip-btn h-7" onClick={() => onSelectRun(r.id)}>
                  <Monitor className="h-3.5 w-3.5" /> 预览
                </button>
                <button className="chip-btn h-7" onClick={() => startCompare(r)} disabled={usable.length < 2}>
                  <GitCompare className="h-3.5 w-3.5" /> 对比
                </button>
                <button className="chip-btn h-7" onClick={() => setRollbackRun(r)} disabled={r.id === latestUsable?.id} title={r.id === latestUsable?.id ? '已是最新版本' : '回滚到此版本'}>
                  <RotateCcw className="h-3.5 w-3.5" /> 回滚
                </button>
                <button className="chip-btn h-7" onClick={() => onDownload(projectId, r)}>
                  <Download className="h-3.5 w-3.5" /> zip
                </button>
              </div>
            )}
          </div>
        );
      })}

      <Dialog open={!!rollbackRun} onOpenChange={(o) => !o && !rolling && setRollbackRun(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>回滚到 v{rollbackRun?.version}？</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-[#5B5B66]">
            系统会把 v{rollbackRun?.version} 的代码复制为一个新版本，现有版本都会保留，可随时再切换回来。之后的 AI 迭代会基于新版本继续。
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={rolling} onClick={() => setRollbackRun(null)}>取消</Button>
            <Button className="bg-[#0B0B0F] text-white hover:bg-[#2A2A33]" disabled={rolling} onClick={doRollback}>
              {rolling && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 确认回滚
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ArtifactPanel(p: Props) {
  const running = p.runs.some((r) => r.status === 'running');
  return (
    <Tabs value={p.tab} onValueChange={p.onTabChange} className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-[#EFEFF2] px-3">
        <TabsList className="h-9 rounded-[10px] bg-[#F2F2F4] p-1">
          <TabsTrigger value="preview" className="rounded-lg px-3 text-[13px]">预览</TabsTrigger>
          <TabsTrigger value="code" className="rounded-lg px-3 text-[13px]">代码</TabsTrigger>
          <TabsTrigger value="versions" className="rounded-lg px-3 text-[13px]">版本 {p.runs.length > 0 && `(${p.runs.length})`}</TabsTrigger>
        </TabsList>
        <span className="flex-1" />
        {running && (
          <span className="flex items-center gap-1.5 text-[12px] text-[#5B3FD9]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> <span className="hidden sm:inline">新版本构建中</span>
          </span>
        )}
      </div>
      <TabsContent value="preview" className="mt-0 min-h-0 flex-1">
        {p.viewRun ? <PreviewPane run={p.viewRun} onFixErrors={p.onFixErrors} fixDisabled={p.fixDisabled} /> : <EmptyState running={running} />}
      </TabsContent>
      <TabsContent value="code" className="mt-0 min-h-0 flex-1">
        {p.viewRun ? (
          <CodePane key={p.viewRun.id} run={p.viewRun} projectId={p.projectId} onVersionCreated={p.onVersionCreated} />
        ) : (
          <EmptyState running={running} />
        )}
      </TabsContent>
      <TabsContent value="versions" className="mt-0 min-h-0 flex-1">
        <VersionsPane projectId={p.projectId} runs={p.runs} viewRun={p.viewRun} onSelectRun={p.onSelectRun} onVersionCreated={p.onVersionCreated} />
      </TabsContent>
    </Tabs>
  );
}
