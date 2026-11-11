import { useMemo, useState } from 'react';
import { Check, Copy, FileCode2, Monitor, RotateCw, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/memchat';
import { bundleHtml, type Run } from '@/lib/projects';

interface Props {
  runs: Run[];
  viewRun: Run | undefined;
  tab: string;
  onTabChange: (t: string) => void;
  onSelectRun: (id: number) => void;
}

function EmptyState({ running }: { running: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#5B5B66]">
      {running ? <Loader2 className="h-6 w-6 animate-spin text-[#7C5CFF]" /> : <Monitor className="h-7 w-7 text-[#9A9AA5]" />}
      <p>{running ? 'AI 团队正在构建第一个版本，完成后会在这里实时预览' : '在左侧描述你想做的应用，生成后会在这里预览'}</p>
    </div>
  );
}

function PreviewPane({ run }: { run: Run }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const html = useMemo(() => bundleHtml(run.files), [run.files]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[#F2F2F4] px-3">
        <span className="rounded bg-[#F2F2F4] px-1.5 font-mono text-[11px]">v{run.version}</span>
        <span className="truncate text-[12px] text-[#9A9AA5]">index.html · 沙箱预览</span>
        <span className="flex-1" />
        {(['desktop', 'mobile'] as const).map((d) => {
          const Icon = d === 'desktop' ? Monitor : Smartphone;
          return (
            <button
              key={d}
              aria-label={d === 'desktop' ? '桌面尺寸' : '手机尺寸'}
              onClick={() => setDevice(d)}
              className={cn('icon-btn h-7 w-7', device === d && 'bg-[#F2F2F4] text-[#0B0B0F]')}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        <button aria-label="刷新预览" className="icon-btn h-7 w-7" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#F7F7F8] p-3">
        <iframe
          key={`${run.id}-${reloadKey}`}
          title={`预览 v${run.version}`}
          srcDoc={html}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          className={cn(
            'h-full rounded-[12px] border border-[#E7E7EA] bg-white shadow-sm transition-all',
            device === 'desktop' ? 'w-full' : 'w-[390px] max-w-full',
          )}
        />
      </div>
    </div>
  );
}

function CodePane({ run }: { run: Run }) {
  const names = useMemo(() => Object.keys(run.files).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b))), [run.files]);
  const [active, setActive] = useState(names[0]);
  const [copied, setCopied] = useState(false);
  const current = names.includes(active) ? active : names[0];
  const content = run.files[current] ?? '';
  const lines = content.split('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-44 shrink-0 overflow-y-auto border-r border-[#F2F2F4] bg-[#FAFAFB] p-2">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-[#9A9AA5]">文件 · v{run.version}</p>
        {names.map((n) => (
          <button
            key={n}
            onClick={() => setActive(n)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-mono text-[12px] transition-colors',
              n === current ? 'bg-white font-medium text-[#0B0B0F] shadow-sm ring-1 ring-[#E7E7EA]' : 'text-[#5B5B66] hover:bg-[#F2F2F4]',
            )}
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{n}</span>
          </button>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#F2F2F4] px-3">
          <span className="truncate font-mono text-[12px]">{current}</span>
          <span className="text-[11px] text-[#9A9AA5]">{lines.length} 行</span>
          <span className="flex-1" />
          <button onClick={copy} className="chip-btn h-7">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? '已复制' : '复制'}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#0B0B0F]">
          <pre className="flex min-w-max py-3 font-mono text-[12px] leading-[19px]">
            <code className="select-none pl-3 pr-4 text-right text-[#5B5B66]">
              {lines.map((_, i) => (
                <span key={i} className="block">{i + 1}</span>
              ))}
            </code>
            <code className="pr-6 text-[#E7E7EA]">{content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

function VersionsPane({ runs, viewRun, onSelectRun }: { runs: Run[]; viewRun: Run | undefined; onSelectRun: (id: number) => void }) {
  if (!runs.length) return <div className="p-6 text-center text-sm text-[#9A9AA5]">还没有版本</div>;
  return (
    <div className="h-full space-y-2 overflow-y-auto p-4">
      {[...runs].reverse().map((r) => {
        const usable = r.status === 'done' && Object.keys(r.files).length > 0;
        return (
          <button
            key={r.id}
            disabled={!usable}
            onClick={() => onSelectRun(r.id)}
            className={cn(
              'flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors',
              viewRun?.id === r.id ? 'border-[#CFC3FF] bg-[#FAF8FF]' : 'border-[#E7E7EA] bg-white hover:bg-[#FAFAFB]',
              !usable && 'cursor-not-allowed opacity-70',
            )}
          >
            <span className="rounded-md bg-[#0B0B0F] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">v{r.version}</span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[13px]">{r.prompt}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#9A9AA5]">
                <span>{formatTime(r.create_time)}</span>
                <span>{Object.keys(r.files).length} 个文件</span>
                {r.dev_output && <span className={r.dev_output.self_check.passed ? 'text-[#15803D]' : 'text-[#B45309]'}>{r.dev_output.self_check.passed ? '自测通过' : '自测未通过'}</span>}
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
          </button>
        );
      })}
    </div>
  );
}

export default function ArtifactPanel({ runs, viewRun, tab, onTabChange, onSelectRun }: Props) {
  const running = runs.some((r) => r.status === 'running');
  return (
    <Tabs value={tab} onValueChange={onTabChange} className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-[#EFEFF2] px-3">
        <TabsList className="h-9 rounded-[10px] bg-[#F2F2F4] p-1">
          <TabsTrigger value="preview" className="rounded-lg px-3 text-[13px]">预览</TabsTrigger>
          <TabsTrigger value="code" className="rounded-lg px-3 text-[13px]">代码</TabsTrigger>
          <TabsTrigger value="versions" className="rounded-lg px-3 text-[13px]">版本 {runs.length > 0 && `(${runs.length})`}</TabsTrigger>
        </TabsList>
        <span className="flex-1" />
        {running && (
          <span className="flex items-center gap-1.5 text-[12px] text-[#5B3FD9]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 新版本构建中
          </span>
        )}
      </div>
      <TabsContent value="preview" className="mt-0 min-h-0 flex-1">
        {viewRun ? <PreviewPane run={viewRun} /> : <EmptyState running={running} />}
      </TabsContent>
      <TabsContent value="code" className="mt-0 min-h-0 flex-1">
        {viewRun ? <CodePane key={viewRun.id} run={viewRun} /> : <EmptyState running={running} />}
      </TabsContent>
      <TabsContent value="versions" className="mt-0 min-h-0 flex-1">
        <VersionsPane runs={runs} viewRun={viewRun} onSelectRun={onSelectRun} />
      </TabsContent>
    </Tabs>
  );
}
