import { forwardRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Brain, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODE_OPTIONS, type MemoryMode } from '@/lib/memchat';

interface Props {
  busy: boolean;
  mode: MemoryMode;
  onSend: (text: string) => void;
  onOpenMemory: () => void;
  large?: boolean;
}

const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer({ busy, mode, onSend, onOpenMemory, large }, ref) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="w-full rounded-[20px] border border-[#E7E7EA] bg-white p-3 shadow-[0_4px_24px_rgba(15,15,20,0.06)] transition-shadow focus-within:border-[#CFCFD6] focus-within:shadow-[0_8px_32px_rgba(15,15,20,0.10)]">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        rows={large ? 3 : 2}
        placeholder="告诉 Atoms 你的想法，或者说“记住……”"
        aria-label="输入消息"
        className="max-h-48 w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 outline-none placeholder:text-[#9A9AA5]"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button onClick={onOpenMemory} className="chip-btn" title="管理记忆">
          <Brain className={cn('h-3.5 w-3.5', mode === 'off' ? 'text-[#9A9AA5]' : 'text-[#7C5CFF]')} />
          记忆：{MODE_OPTIONS.find((o) => o.value === mode)?.label}
        </button>
        <span className="hidden text-[11px] text-[#9A9AA5] sm:inline">Enter 发送 · Shift+Enter 换行</span>
        <div className="flex-1" />
        <button
          aria-label="发送"
          disabled={!canSend}
          onClick={submit}
          className={cn(
            'flex h-9 items-center gap-1 rounded-[10px] px-3.5 text-sm font-medium transition-colors',
            canSend ? 'bg-[#0B0B0F] text-white hover:bg-[#2A2A33]' : 'cursor-not-allowed bg-[#ECECEF] text-[#9A9AA5]',
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>发送 <ArrowUp className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  );
});

export default Composer;
