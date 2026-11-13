import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { diffLines, diffStats, type DiffLine } from '@/lib/diff';
import { sortFiles, type Run } from '@/lib/projects';

const CONTEXT = 3;

type Block = { kind: 'lines'; lines: DiffLine[] } | { kind: 'fold'; count: number };

function toBlocks(lines: DiffLine[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== 'same') {
      const start = i;
      while (i < lines.length && lines[i].type !== 'same') i += 1;
      blocks.push({ kind: 'lines', lines: lines.slice(start, i) });
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i].type === 'same') i += 1;
    const run = lines.slice(start, i);
    const head = start === 0 ? 0 : CONTEXT;
    const tail = i === lines.length ? 0 : CONTEXT;
    if (run.length > head + tail + 2) {
      if (head) blocks.push({ kind: 'lines', lines: run.slice(0, head) });
      blocks.push({ kind: 'fold', count: run.length - head - tail });
      if (tail) blocks.push({ kind: 'lines', lines: run.slice(run.length - tail) });
    } else {
      blocks.push({ kind: 'lines', lines: run });
    }
  }
  return blocks;
}

export default function DiffView({ from, to }: { from: Run; to: Run }) {
  const files = useMemo(() => {
    const names = sortFiles([...new Set([...Object.keys(from.files), ...Object.keys(to.files)])]);
    return names.map((name) => {
      const lines = diffLines(from.files[name] ?? '', to.files[name] ?? '');
      const status = !(name in from.files) ? '新增' : !(name in to.files) ? '删除' : null;
      return { name, lines, status, ...diffStats(lines) };
    });
  }, [from, to]);
  const firstChanged = files.find((f) => f.add || f.del)?.name ?? files[0]?.name;
  const [active, setActive] = useState(firstChanged);
  const current = files.find((f) => f.name === active) ?? files[0];
  const total = files.reduce((acc, f) => ({ add: acc.add + f.add, del: acc.del + f.del }), { add: 0, del: 0 });

  if (!current) return <p className="p-4 text-sm text-[#9A9AA5]">两个版本都没有文件</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[#F2F2F4] px-3 py-2">
        <span className="mr-1 text-[12px] text-[#5B5B66]">
          v{from.version} → v{to.version}：<span className="text-[#15803D]">+{total.add}</span> <span className="text-[#B91C1C]">-{total.del}</span>
        </span>
        {files.map((f) => (
          <button
            key={f.name}
            onClick={() => setActive(f.name)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11.5px] ring-1 transition-colors',
              f.name === current.name ? 'bg-[#0B0B0F] text-white ring-[#0B0B0F]' : 'bg-white text-[#5B5B66] ring-[#E7E7EA] hover:bg-[#F7F7F8]',
            )}
          >
            {f.name}
            {f.status && <span className="font-sans text-[10px] opacity-80">{f.status}</span>}
            {f.add + f.del === 0 ? (
              <span className="font-sans text-[10px] opacity-60">无变化</span>
            ) : (
              <span className="font-sans text-[10px]">
                <span className={f.name === current.name ? 'text-[#86EFAC]' : 'text-[#15803D]'}>+{f.add}</span>{' '}
                <span className={f.name === current.name ? 'text-[#FCA5A5]' : 'text-[#B91C1C]'}>-{f.del}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        {current.add + current.del === 0 ? (
          <p className="p-6 text-center text-sm text-[#9A9AA5]">{current.name} 在两个版本中完全相同</p>
        ) : (
          <table className="w-full min-w-max border-collapse font-mono text-[12px] leading-[19px]">
            <tbody>
              {toBlocks(current.lines).map((block, bi) =>
                block.kind === 'fold' ? (
                  <tr key={`f${bi}`} className="bg-[#F7F7F8] text-[#9A9AA5]">
                    <td colSpan={4} className="px-3 py-0.5 text-center text-[11px]">… {block.count} 行未变化 …</td>
                  </tr>
                ) : (
                  block.lines.map((l, li) => (
                    <tr
                      key={`${bi}-${li}`}
                      className={cn(l.type === 'add' && 'bg-[#ECFDF3]', l.type === 'del' && 'bg-[#FEF2F2]')}
                    >
                      <td className="w-10 select-none px-2 text-right text-[#9A9AA5]">{l.a ?? ''}</td>
                      <td className="w-10 select-none px-2 text-right text-[#9A9AA5]">{l.b ?? ''}</td>
                      <td className={cn('w-5 select-none text-center', l.type === 'add' ? 'text-[#15803D]' : l.type === 'del' ? 'text-[#B91C1C]' : 'text-[#CFCFD6]')}>
                        {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}
                      </td>
                      <td className="whitespace-pre pr-6 text-[#2A2A33]">{l.text}</td>
                    </tr>
                  ))
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
