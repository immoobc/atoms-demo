import { useState } from 'react';
import { ChevronDown, Loader2, Search, Sparkles, PenLine, Trash2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMsg, Memory } from '@/lib/memchat';

type Kind = 'recalled' | 'created' | 'updated' | 'deleted';

const KIND_META: Record<Kind, { label: string; icon: typeof Search; cls: string }> = {
  recalled: { label: '召回', icon: Search, cls: 'border-[#E4DCFF] bg-[#F5F2FF] text-[#5B3FD9]' },
  created: { label: '新建', icon: Sparkles, cls: 'border-[#CDEFD9] bg-[#EFFAF3] text-[#15803D]' },
  updated: { label: '更新', icon: PenLine, cls: 'border-[#FBE3B5] bg-[#FFF8EB] text-[#B45309]' },
  deleted: { label: '删除', icon: Trash2, cls: 'border-[#F8D0D0] bg-[#FEF2F2] text-[#B91C1C]' },
};

export default function MemoryEvents({ msg }: { msg: ChatMsg }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const ev = msg.events;
  const groups: Record<Kind, Partial<Memory>[]> = {
    recalled: ev?.recalled ?? msg.recalled ?? [],
    created: ev?.created ?? [],
    updated: ev?.updated ?? [],
    deleted: ev?.deleted ?? [],
  };
  const kinds = (Object.keys(groups) as Kind[]).filter((k) => groups[k].length > 0);
  const memorizing = msg.status === 'memorizing';
  if (!kinds.length && !memorizing && !ev?.notice) return null;

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {kinds.map((k) => {
          const meta = KIND_META[k];
          const Icon = meta.icon;
          return (
            <button
              key={k}
              onClick={() => setOpen(open === k ? null : k)}
              aria-expanded={open === k}
              className={cn('flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-opacity hover:opacity-80', meta.cls)}
            >
              <Icon className="h-3 w-3" />
              {meta.label}记忆 {groups[k].length}
              <ChevronDown className={cn('h-3 w-3 transition-transform', open === k && 'rotate-180')} />
            </button>
          );
        })}
        {memorizing && (
          <span className="flex items-center gap-1 text-[12px] text-[#9A9AA5]">
            <Loader2 className="h-3 w-3 animate-spin" /> 正在提炼记忆…
          </span>
        )}
        {!memorizing && ev?.notice && (
          <span className="flex items-center gap-1 text-[12px] text-[#9A9AA5]">
            <Info className="h-3 w-3" /> {ev.notice}
          </span>
        )}
      </div>
      {open && (
        <ul className="mt-2 space-y-1.5 rounded-xl border border-[#E7E7EA] bg-[#FAFAFB] p-2.5">
          {groups[open].map((m, i) => (
            <li key={`${m.memory_id}-${i}`} className="text-[13px] leading-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-white px-1.5 text-[11px] text-[#5B5B66] ring-1 ring-[#E7E7EA]">{m.category}</span>
                <span className="font-medium">{m.title}</span>
                {m.reason && <span className="text-[11px] text-[#9A9AA5]">· {m.reason}</span>}
              </div>
              {m.before && <p className="text-[#9A9AA5] line-through">{m.before}</p>}
              <p className={cn('text-[#5B5B66]', open === 'deleted' && 'line-through')}>{m.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
