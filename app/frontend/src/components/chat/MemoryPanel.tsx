import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Check, Pencil, Plus, Search, Trash2, X, Loader2, ScrollText, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  CATEGORIES,
  MODE_OPTIONS,
  errMsg,
  formatTime,
  memApi,
  type Memory,
  type MemoryInput,
  type MemoryMode,
  type Rule,
} from '@/lib/memchat';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  version: number;
  mode: MemoryMode;
  onModeChange: (m: MemoryMode) => void;
  onCountChange: (n: number) => void;
}

const SOURCE_LABEL: Record<string, string> = { explicit: '显式记住', implicit: '自动抽取', manual: '手动编辑' };
const EMPTY: MemoryInput = { title: '', scene: '', content: '', category: '偏好' };

export default function MemoryPanel({ open, onOpenChange, version, mode, onModeChange, onCountChange }: Props) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<{ id: number | null; data: MemoryInput } | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [ruleEdit, setRuleEdit] = useState<{ id: number; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([memApi.memories(), memApi.rules()]);
      setMemories(m.items);
      setRules(r.items);
      onCountChange(m.items.length);
    } catch (e) {
      toast.error('加载记忆失败', { description: errMsg(e) });
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (open) load();
  }, [open, version, load]);

  const visible = useMemo(() => {
    const kw = query.trim().toLowerCase();
    return memories.filter(
      (m) =>
        (category === 'all' || m.category === category) &&
        (!kw || `${m.title}${m.scene}${m.content}`.toLowerCase().includes(kw)),
    );
  }, [memories, query, category]);

  const saveMemory = async () => {
    if (!editing) return;
    const d = editing.data;
    if (!d.title.trim() || !d.content.trim()) {
      toast.error('标题和内容不能为空');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) await memApi.updateMemory(editing.id, d);
      else await memApi.createMemory(d);
      toast.success(editing.id ? '记忆已更新' : '记忆已添加');
      setEditing(null);
      await load();
    } catch (e) {
      toast.error('保存失败', { description: errMsg(e) });
    } finally {
      setSaving(false);
    }
  };

  const removeMemory = async (m: Memory) => {
    try {
      await memApi.deleteMemory(m.memory_id);
      toast.success(`已删除「${m.title}」`);
      await load();
    } catch (e) {
      toast.error('删除失败', { description: errMsg(e) });
    }
  };

  const addRule = async () => {
    const text = newRule.trim();
    if (!text) return;
    try {
      const r = await memApi.createRule(text);
      setRules((rs) => [...rs, r]);
      setNewRule('');
    } catch (e) {
      toast.error('添加规则失败', { description: errMsg(e) });
    }
  };

  const updateRule = async (r: Rule, content: string, enabled: boolean) => {
    try {
      const saved = await memApi.updateRule(r.id, content, enabled);
      setRules((rs) => rs.map((x) => (x.id === r.id ? saved : x)));
      setRuleEdit(null);
    } catch (e) {
      toast.error('更新规则失败', { description: errMsg(e) });
    }
  };

  const removeRule = async (r: Rule) => {
    try {
      await memApi.deleteRule(r.id);
      setRules((rs) => rs.filter((x) => x.id !== r.id));
    } catch (e) {
      toast.error('删除规则失败', { description: errMsg(e) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-[#EFEFF2] px-5 pb-4 pt-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-[#7C5CFF]" /> 记忆
          </SheetTitle>
          <SheetDescription className="text-xs">
            规则层全局生效 · 会话层仅限当前对话 · 长期记忆跨会话召回
          </SheetDescription>
          <Select value={mode} onValueChange={(v) => onModeChange(v as MemoryMode)}>
            <SelectTrigger className="mt-2 h-9 rounded-[10px] text-sm" aria-label="记忆模式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label} — <span className="text-[#9A9AA5]">{o.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SheetHeader>

        <Tabs defaultValue="memories" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid h-10 grid-cols-2 rounded-[10px] bg-[#F2F2F4] p-1">
            <TabsTrigger value="memories" className="rounded-lg text-[13px]">
              <Layers className="mr-1.5 h-3.5 w-3.5" />长期记忆 ({memories.length})
            </TabsTrigger>
            <TabsTrigger value="rules" className="rounded-lg text-[13px]">
              <ScrollText className="mr-1.5 h-3.5 w-3.5" />规则 ({rules.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="memories" className="mt-0 flex min-h-0 flex-1 flex-col px-5 pb-5">
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9AA5]" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索记忆" className="h-9 rounded-[10px] pl-9 text-sm" />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-[104px] rounded-[10px] text-sm" aria-label="按分类筛选">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setEditing({ id: null, data: { ...EMPTY } })} className="h-9 rounded-[10px] bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {loading && memories.length === 0 && (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#9A9AA5]" /></div>
              )}
              {!loading && visible.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-[#E7E7EA] px-4 py-10 text-center text-sm text-[#5B5B66]">
                  {memories.length === 0 ? '还没有长期记忆。试着在对话里说“记住：我喜欢简洁的回答”。' : '没有匹配的记忆'}
                </div>
              )}
              {visible.map((m) => (
                <article key={m.memory_id} className="group rounded-[14px] border border-[#E7E7EA] bg-white p-3.5 transition-shadow hover:shadow-[0_6px_18px_rgba(15,15,20,0.06)]">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-[#F5F2FF] px-1.5 py-0.5 text-[11px] font-medium text-[#5B3FD9]">{m.category}</span>
                        <h3 className="text-sm font-semibold">{m.title}</h3>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-5 text-[#2A2A33]">{m.content}</p>
                      {m.scene && <p className="mt-1 text-xs text-[#9A9AA5]">适用场景：{m.scene}</p>}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        aria-label={`编辑 ${m.title}`}
                        className="icon-btn"
                        onClick={() => setEditing({ id: m.memory_id, data: { title: m.title, scene: m.scene, content: m.content, category: m.category } })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button aria-label={`删除 ${m.title}`} className="icon-btn hover:text-[#DC2626]" onClick={() => removeMemory(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9A9AA5]">
                    <span className="flex items-center gap-1.5">
                      置信度
                      <span className="h-1 w-12 overflow-hidden rounded-full bg-[#F2F2F4]">
                        <span className="block h-full rounded-full bg-[#7C5CFF]" style={{ width: `${Math.round(m.confidence * 100)}%` }} />
                      </span>
                      {m.confidence.toFixed(2)}
                    </span>
                    <span>{SOURCE_LABEL[m.source] ?? m.source}</span>
                    {m.source_session_id && <span>来源对话 #{m.source_session_id}</span>}
                    <span>召回 {m.hit_count ?? 0} 次</span>
                    <span>更新于 {formatTime(m.update_time)}</span>
                  </div>
                </article>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="mt-0 flex min-h-0 flex-1 flex-col px-5 pb-5">
            <p className="mt-3 text-xs leading-5 text-[#5B5B66]">
              规则是你主动定义的全局约定（类似 Steering 规则），每次对话都会注入系统提示词，优先级最高。
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addRule()}
                placeholder="例如：回答先给结论，再分点说明"
                className="h-9 rounded-[10px] text-sm"
              />
              <Button size="sm" disabled={!newRule.trim()} onClick={addRule} className="h-9 rounded-[10px] bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
                添加
              </Button>
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {rules.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-[#E7E7EA] px-4 py-10 text-center text-sm text-[#5B5B66]">还没有规则</div>
              )}
              {rules.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-[12px] border border-[#E7E7EA] bg-white p-3">
                  <Switch checked={r.enabled} onCheckedChange={(v) => updateRule(r, r.content, v)} aria-label="启用规则" className="mt-0.5" />
                  {ruleEdit?.id === r.id ? (
                    <div className="flex flex-1 gap-1.5">
                      <Input value={ruleEdit.text} onChange={(e) => setRuleEdit({ id: r.id, text: e.target.value })} className="h-8 text-sm" autoFocus />
                      <button aria-label="保存规则" className="icon-btn" disabled={!ruleEdit.text.trim()} onClick={() => updateRule(r, ruleEdit.text.trim(), r.enabled)}>
                        <Check className="h-4 w-4" />
                      </button>
                      <button aria-label="取消编辑" className="icon-btn" onClick={() => setRuleEdit(null)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className={cn('flex-1 text-[13px] leading-5', !r.enabled && 'text-[#9A9AA5] line-through')}>{r.content}</p>
                      <button aria-label="编辑规则" className="icon-btn h-7 w-7" onClick={() => setRuleEdit({ id: r.id, text: r.content })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button aria-label="删除规则" className="icon-btn h-7 w-7 hover:text-[#DC2626]" onClick={() => removeRule(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing?.id ? '编辑记忆' : '新增记忆'}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={editing.data.title}
                    maxLength={40}
                    onChange={(e) => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })}
                    placeholder="标题"
                    aria-label="标题"
                  />
                  <Select value={editing.data.category} onValueChange={(v) => setEditing({ ...editing, data: { ...editing.data, category: v } })}>
                    <SelectTrigger className="w-[120px]" aria-label="分类"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={editing.data.scene}
                  onChange={(e) => setEditing({ ...editing, data: { ...editing.data, scene: e.target.value } })}
                  placeholder="适用场景（何时该用这条记忆）"
                  aria-label="适用场景"
                />
                <Textarea
                  value={editing.data.content}
                  maxLength={300}
                  rows={4}
                  onChange={(e) => setEditing({ ...editing, data: { ...editing.data, content: e.target.value } })}
                  placeholder="核心内容，例如：用户是前端工程师，主要使用 React"
                  aria-label="核心内容"
                />
                <p className="text-xs text-[#9A9AA5]">手动编辑的记忆置信度为 1.0。</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button disabled={saving} onClick={saveMemory} className="bg-[#0B0B0F] text-white hover:bg-[#2A2A33]">
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
