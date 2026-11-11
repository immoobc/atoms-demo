import { forwardRef, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, ChevronDown, Mic, X, Users, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AGENTS, MODELS, MODES, SUGGESTIONS } from "./data";
import { cn } from "@/lib/utils";

interface PromptBoxProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (prompt: string, mode: string) => void;
}

const PromptBox = forwardRef<HTMLTextAreaElement, PromptBoxProps>(function PromptBox(
  { value, onChange, onSubmit },
  ref,
) {
  const [mode, setMode] = useState(MODES[0]);
  const [model, setModel] = useState(MODELS[0]);
  const [files, setFiles] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim(), mode.label);
    setFiles([]);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[760px] flex-col items-center pt-10 md:pt-16">
      <div className="flex -space-x-2">
        {AGENTS.map((a) => (
          <img
            key={a.name}
            src={a.avatar}
            alt={`${a.name} - ${a.role}`}
            title={`${a.name} · ${a.role}`}
            className="h-9 w-9 rounded-full border-2 border-white bg-[#F2F2F4] object-cover transition-transform hover:-translate-y-1"
          />
        ))}
      </div>
      <h1 className="mt-5 text-center text-[32px] font-bold leading-[40px] tracking-tight md:text-[44px] md:leading-[52px]">
        把想法变成可销售的
        <span className="bg-gradient-to-r from-[#7C5CFF] to-[#C25BFF] bg-clip-text text-transparent">产品</span>
      </h1>
      <p className="mt-3 text-center text-[15px] text-[#5B5B66]">
        AI 员工用于验证想法、构建产品并获取客户。几分钟内完成，无需编码。
      </p>

      <div className="mt-8 w-full rounded-[20px] border border-[#E7E7EA] bg-white p-3 shadow-[0_4px_24px_rgba(15,15,20,0.06)] transition-shadow focus-within:border-[#CFCFD6] focus-within:shadow-[0_8px_32px_rgba(15,15,20,0.10)]">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {files.map((f) => (
              <span key={f} className="flex items-center gap-1 rounded-lg bg-[#F2F2F4] px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{f}</span>
                <button aria-label={`移除 ${f}`} onClick={() => setFiles(files.filter((x) => x !== f))}>
                  <X className="h-3 w-3 text-[#9A9AA5] hover:text-[#0B0B0F]" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
          placeholder="创建一个具有用户登录和数据库存储功能的 SaaS 订阅应用…"
          className="w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 outline-none placeholder:text-[#9A9AA5]"
          aria-label="告知 Atoms 团队你的需求"
        />
        <div className="mt-2 flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const names = Array.from(e.target.files ?? []).map((f) => f.name);
              setFiles((prev) => Array.from(new Set([...prev, ...names])));
              e.target.value = "";
            }}
          />
          <button aria-label="添加附件" className="icon-btn border border-[#E7E7EA]" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="chip-btn">
                <Users className="h-3.5 w-3.5" /> {mode.label} <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {MODES.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => setMode(m)} className="items-start gap-2 py-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-[#9A9AA5]">{m.desc}</div>
                  </div>
                  {m.id === mode.id && <Check className="mt-0.5 h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="chip-btn hidden sm:flex">
                <Sparkles className="h-3.5 w-3.5" /> {model} <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs text-[#9A9AA5]">选择模型</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MODELS.map((m) => (
                <DropdownMenuItem key={m} onClick={() => setModel(m)}>
                  <span className="flex-1">{m}</span>
                  {m === model && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />
          <button aria-label="语音输入" className="icon-btn" onClick={() => toast("语音输入需要麦克风权限（演示）")}>
            <Mic className="h-4 w-4" />
          </button>
          <button
            aria-label="开始"
            disabled={!canSend}
            onClick={submit}
            className={cn(
              "flex h-9 items-center gap-1 rounded-[10px] px-3.5 text-sm font-medium transition-colors",
              canSend ? "bg-[#0B0B0F] text-white hover:bg-[#2A2A33]" : "cursor-not-allowed bg-[#ECECEF] text-[#9A9AA5]",
            )}
          >
            开始 <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onChange(`帮我创建一个${s}`)}
            className="rounded-full border border-[#E7E7EA] bg-white px-3.5 py-1.5 text-[13px] text-[#5B5B66] transition-colors hover:border-[#CFCFD6] hover:text-[#0B0B0F]"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
});

export default PromptBox;
