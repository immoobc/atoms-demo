import { useMemo, type KeyboardEvent } from 'react';
import Prism from 'prismjs';
import './code-theme.css';

function langOf(path: string): string | null {
  if (/\.html?$/i.test(path)) return 'markup';
  if (/\.css$/i.test(path)) return 'css';
  if (/\.(m?js|json)$/i.test(path)) return 'javascript';
  return null;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(code: string, path: string): string {
  const lang = langOf(path);
  const grammar = lang ? Prism.languages[lang] : undefined;
  return grammar && lang ? Prism.highlight(code, grammar, lang) : escapeHtml(code);
}

function Gutter({ count }: { count: number }) {
  return (
    <div aria-hidden className="prism-code select-none pl-3 pr-4 text-right !text-[#5B5B66]">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="block">{i + 1}</span>
      ))}
    </div>
  );
}

export function CodeView({ code, path }: { code: string; path: string }) {
  const html = useMemo(() => highlight(code, path), [code, path]);
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#0B0B0F]">
      <div className="flex min-w-max py-3">
        <Gutter count={code.split('\n').length} />
        <pre className="prism-code m-0 whitespace-pre pr-6" dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
      </div>
    </div>
  );
}

/** Highlighted editor: a transparent textarea layered over the highlighted code. */
export function CodeEditor({ value, path, onChange }: { value: string; path: string; onChange: (v: string) => void }) {
  const html = useMemo(() => highlight(value, path), [value, path]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: end } = el;
    onChange(`${value.slice(0, s)}  ${value.slice(end)}`);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = s + 2;
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#0B0B0F]">
      <div className="flex min-h-full min-w-max py-3">
        <Gutter count={value.split('\n').length} />
        <div className="relative min-w-[480px] flex-1 pr-6">
          <pre aria-hidden className="prism-code m-0 whitespace-pre" dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            aria-label={`编辑 ${path}`}
            className="code-input absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 text-transparent caret-white outline-none selection:bg-[#7C5CFF]/40"
          />
        </div>
      </div>
    </div>
  );
}
