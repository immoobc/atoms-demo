import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { errMsg, projApi, type ProjectMemory } from '@/lib/projects';

interface Props {
  projectId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  version: number;
  onChanged: () => void;
}

export default function ProjectMemorySheet({ projectId, open, onOpenChange, version, onChanged }: Props) {
  const [items, setItems] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await projApi.memories(projectId)).items);
    } catch (e) {
      toast.error('加载记忆失败', { description: errMsg(e) });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) load();
  }, [open, version, load]);

  const visible = useMemo(() => {
    const kw = query.trim().toLowerCase();
    return items.filter((m) => !kw || `${m.title}${m.content}${m.scene}`.toLowerCase().includes(kw));
  }, [items, query]);

  const toggle = async (m: ProjectMemory, on: boolean) => {
    setPending(m.memory_id);
    try {
      if (on) await projApi.link(projectId, m.memory_id);
      else await projApi.unlink(projectId, m.memory_id);
      setItems((xs) => xs.map((x) => (x.memory_id === m.memory_id ? { ...x, linked: on, relation: on ? x.relation ?? 'bound' : null } : x)));
      onChanged();
    } catch (e) {
      toast.error('操作失败', { description: errMsg(e) });
    } finally {
      setPending(null);
    }
  };

  const linkedCount = items.filter((m) => m.linked).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="border-b border-[#EFEFF2] px-5 pb-4 pt-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-[#7C5CFF]" /> 项目记忆 · {linkedCount}
          </SheetTitle>
          <SheetDescription className="text-xs">
            从长期记忆库中选出要绑定到项目的记忆，项目主管和开发工程师都会读取它们。项目迭代产生的结论会自动沉淀并绑定到项目。
          </SheetDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9AA5]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索记忆" className="h-9 rounded-[10px] pl-9 text-sm" />
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {loading && !items.length && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#9A9AA5]" /></div>}
          {!loading && !visible.length && (
            <div className="rounded-[14px] border border-dashed border-[#E7E7EA] px-4 py-10 text-center text-sm text-[#5B5B66]">
              {items.length ? '没有匹配的记忆' : '记忆库还是空的，先去对话里让 AI 记住一些信息吧'}
            </div>
          )}
          {visible.map((m) => (
            <label
              key={m.memory_id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-[12px] border p-3 transition-colors',
                m.linked ? 'border-[#D9CFFF] bg-[#FAF8FF]' : 'border-[#E7E7EA] bg-white hover:bg-[#FAFAFB]',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-[#F2F2F4] px-1.5 py-0.5 text-[11px] text-[#5B5B66]">{m.category}</span>
                  <span className="text-sm font-medium">{m.title}</span>
                  {m.relation === 'derived' && (
                    <span className="rounded-md bg-[#EFFAF3] px-1.5 py-0.5 text-[11px] font-medium text-[#15803D]">项目沉淀</span>
                  )}
                </div>
                <p className="mt-1 text-[13px] leading-5 text-[#5B5B66]">{m.content}</p>
              </div>
              {pending === m.memory_id ? (
                <Loader2 className="mt-1 h-4 w-4 animate-spin text-[#9A9AA5]" />
              ) : (
                <Switch checked={m.linked} onCheckedChange={(v) => toggle(m, v)} aria-label={`绑定 ${m.title}`} />
              )}
            </label>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
