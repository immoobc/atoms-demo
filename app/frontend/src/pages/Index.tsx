import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'markdown-to-jsx';
import { Loader2, Menu, PanelLeftOpen, Brain, Plus, AlertCircle, RotateCw } from 'lucide-react';
import { LAST_CONVERSATION_KEY } from '@/lib/authFlow';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import ChatSidebar, { AtomsLogo } from '@/components/chat/ChatSidebar';
import Composer from '@/components/chat/Composer';
import MemoryEvents from '@/components/chat/MemoryEvents';
import MemoryPanel from '@/components/chat/MemoryPanel';
import {
  AGENT_AVATARS,
  ASSISTANT_AVATAR,
  errMsg,
  memApi,
  streamReply,
  type ChatMsg,
  type Conversation,
  type MemoryMode,
} from '@/lib/memchat';

const SUGGESTIONS = [
  '记住：我是前端工程师，主要用 React 和 TypeScript',
  '我更喜欢简洁、先给结论的回答',
  '根据你对我的了解，推荐一个周末学习计划',
  '你记得关于我的哪些信息？',
];

function Landing({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-[#0B0B0F]">
      <header className="flex h-16 items-center justify-between px-6">
        <AtomsLogo />
        <div className="flex items-center gap-2">
          <button onClick={onLogin} className="h-9 rounded-[10px] px-3 text-sm font-medium text-[#2A2A33] hover:bg-[#F2F2F4]">
            登录
          </button>
          <button onClick={onRegister} className="h-9 rounded-[10px] bg-[#0B0B0F] px-4 text-sm font-medium text-white hover:bg-[#2A2A33]">
            注册
          </button>
        </div>
      </header>
      <main className="mx-auto flex max-w-[760px] flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="flex -space-x-2">
          {AGENT_AVATARS.map((a) => (
            <img key={a} src={a} alt="" className="h-10 w-10 rounded-full border-2 border-white bg-[#F2F2F4] object-cover" />
          ))}
        </div>
        <h1 className="mt-6 text-[34px] font-bold leading-[42px] tracking-tight md:text-[46px] md:leading-[56px]">
          一个会<span className="bg-gradient-to-r from-[#7C5CFF] to-[#C25BFF] bg-clip-text text-transparent">记住你</span>的 AI 助手
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] leading-6 text-[#5B5B66]">
          规则层、会话层、长期记忆三层协同。偏好和背景会被提炼成结构化记忆，新开对话也能召回。每一次读写都清楚可见、随时可改。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={onRegister} className="h-11 rounded-[12px] bg-[#0B0B0F] px-6 text-[15px] font-medium text-white hover:bg-[#2A2A33]">
            免费注册
          </button>
          <button onClick={onLogin} className="h-11 rounded-[12px] border border-[#E7E7EA] px-6 text-[15px] font-medium text-[#0B0B0F] hover:bg-[#F7F7F8]">
            登录开始体验
          </button>
        </div>
      </main>
    </div>
  );
}

function ChatApp({ userName, userEmail, onLogout }: { userName: string; userEmail: string; onLogout: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<MemoryMode>('learn');
  const [memoryCount, setMemoryCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [memVersion, setMemVersion] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [listError, setListError] = useState('');
  const [msgError, setMsgError] = useState('');
  const selectConversationRef = useRef<(id: number) => void>(() => {});
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await memApi.conversations();
      setConversations(res.items);
      setListError('');
      return res.items;
    } catch (e) {
      setListError(errMsg(e));
      toast.error('加载对话失败', { description: errMsg(e) });
      return null;
    }
  }, []);

  const refreshMemoryCount = useCallback(async () => {
    try {
      const res = await memApi.memories();
      setMemoryCount(res.items.length);
    } catch {
      /* count is non-critical */
    }
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(LAST_CONVERSATION_KEY, String(activeId));
  }, [activeId]);

  useEffect(() => {
    refreshConversations().then((items) => {
      const last = Number(localStorage.getItem(LAST_CONVERSATION_KEY));
      if (last && items?.some((c) => c.id === last)) selectConversationRef.current(last);
    });
    refreshMemoryCount();
    memApi
      .getMode()
      .then((r) => setMode(r.mode))
      .catch((e) => toast.error('加载记忆设置失败', { description: errMsg(e) }));
  }, [refreshConversations, refreshMemoryCount]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const patchMsg = (id: ChatMsg['id'], patch: Partial<ChatMsg>) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const changeMode = async (m: MemoryMode) => {
    const prev = mode;
    setMode(m);
    try {
      await memApi.setMode(m);
      toast.success(`记忆模式：${m === 'off' ? '关闭' : m === 'use' ? '仅使用' : '使用+自动学习'}`);
    } catch (e) {
      setMode(prev);
      toast.error('切换失败', { description: errMsg(e) });
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setMsgError('');
    localStorage.removeItem(LAST_CONVERSATION_KEY);
    setMobileOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const loadMessages = async (id: number) => {
    setMessages([]);
    setMsgError('');
    setLoadingMsgs(true);
    try {
      const res = await memApi.messages(id);
      setMessages(
        res.items.map((m) => ({ id: m.id, role: m.role, content: m.content, events: m.events, status: 'done' as const })),
      );
    } catch (e) {
      setMsgError(errMsg(e));
    } finally {
      setLoadingMsgs(false);
    }
  };

  const selectConversation = async (id: number) => {
    setMobileOpen(false);
    if (id === activeId) return;
    setActiveId(id);
    await loadMessages(id);
  };
  selectConversationRef.current = selectConversation;

  const deleteConversation = async (id: number) => {
    try {
      await memApi.deleteConversation(id);
      setConversations((cs) => cs.filter((c) => c.id !== id));
      if (id === activeId) newChat();
      toast.success('对话已删除（长期记忆不受影响）');
    } catch (e) {
      toast.error('删除失败', { description: errMsg(e) });
    }
  };

  const send = async (text: string) => {
    if (busy) return;
    setBusy(true);
    const stamp = Date.now();
    const userId = `u-${stamp}`;
    const botId = `a-${stamp}`;
    setMessages((ms) => [
      ...ms,
      { id: userId, role: 'user', content: text },
      { id: botId, role: 'assistant', content: '', status: 'thinking' },
    ]);
    try {
      const prep = await memApi.prepare(activeId, text);
      const convId = prep.conversation.id;
      if (activeId !== convId) setActiveId(convId);
      setConversations((cs) => [prep.conversation, ...cs.filter((c) => c.id !== convId)]);
      patchMsg(botId, { recalled: prep.recalled, status: 'thinking' });

      const reply = await streamReply(prep.messages, prep.model, (acc) => patchMsg(botId, { content: acc, status: 'streaming' }));
      if (!reply.trim()) throw new Error('模型没有返回内容');
      patchMsg(botId, { content: reply, status: prep.mode === 'learn' ? 'memorizing' : 'streaming' });

      const fin = await memApi.finalize(convId, text, reply, prep.recalled);
      patchMsg(botId, { events: fin.events, status: 'done' });
      const ev = fin.events;
      const changed = ev.created.length + ev.updated.length + ev.deleted.length;
      if (changed) {
        setMemVersion((v) => v + 1);
        refreshMemoryCount();
        toast.success(`记忆已更新：新建 ${ev.created.length} · 更新 ${ev.updated.length} · 删除 ${ev.deleted.length}`);
      }
    } catch (e) {
      patchMsg(botId, { status: 'error', error: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const sidebarProps = {
    conversations,
    activeId,
    busy,
    mode,
    memoryCount,
    userName,
    userEmail,
    onSelect: selectConversation,
    onNew: newChat,
    onDelete: deleteConversation,
    onModeChange: changeMode,
    onOpenMemory: () => {
      setMobileOpen(false);
      setPanelOpen(true);
    },
    onOpenProjects: () => navigate('/projects'),
    onOpenAccount: () => navigate('/account'),
    onRetryList: refreshConversations,
    listError,
    onLogout,
  };

  const empty = messages.length === 0 && !loadingMsgs && !msgError;
  const title = conversations.find((c) => c.id === activeId)?.title ?? '新对话';

  return (
    <div className="flex h-screen bg-white text-[#0B0B0F]">
      {!collapsed && (
        <div className="hidden h-full shrink-0 border-r border-[#EFEFF2] lg:block">
          <ChatSidebar {...sidebarProps} onCollapse={() => setCollapsed(true)} />
        </div>
      )}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[260px] p-0">
          <SheetTitle className="sr-only">导航</SheetTitle>
          <ChatSidebar {...sidebarProps} />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#F2F2F4] px-4 md:px-6">
          <button aria-label="打开菜单" className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          {collapsed && (
            <button aria-label="展开侧边栏" className="icon-btn hidden lg:flex" onClick={() => setCollapsed(false)}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{empty ? '新对话' : title}</h2>
          <button aria-label="新建对话" disabled={busy} className="icon-btn" onClick={newChat}>
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={() => setPanelOpen(true)} className="chip-btn h-9">
            <Brain className="h-4 w-4 text-[#7C5CFF]" /> 记忆 {memoryCount}
          </button>
        </header>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-16">
            <div className="w-full max-w-[760px]">
              <div className="flex justify-center -space-x-2">
                {AGENT_AVATARS.map((a) => (
                  <img key={a} src={a} alt="" className="h-9 w-9 rounded-full border-2 border-white bg-[#F2F2F4] object-cover" />
                ))}
              </div>
              <h1 className="mt-5 text-center text-[30px] font-bold leading-[38px] tracking-tight md:text-[40px] md:leading-[48px]">
                今天想聊点<span className="bg-gradient-to-r from-[#7C5CFF] to-[#C25BFF] bg-clip-text text-transparent">什么</span>？
              </h1>
              <p className="mt-3 text-center text-sm text-[#5B5B66]">
                {memoryCount > 0 ? `我已经记住了关于你的 ${memoryCount} 条信息，新对话也会用上。` : '告诉我你的偏好和背景，我会跨对话记住它们。'}
              </p>
              <div className="mt-7">
                <Composer ref={inputRef} busy={busy} mode={mode} onSend={send} onOpenMemory={() => setPanelOpen(true)} large />
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => send(s)}
                    className="rounded-full border border-[#E7E7EA] bg-white px-3.5 py-1.5 text-[13px] text-[#5B5B66] transition-colors hover:border-[#CFCFD6] hover:text-[#0B0B0F]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[760px] space-y-6 px-4 py-8">
                {loadingMsgs && (
                  <div className="flex flex-col items-center gap-2 py-10 text-sm text-[#9A9AA5]"><Loader2 className="h-5 w-5 animate-spin" />正在加载对话记录…</div>
                )}
                {msgError && (
                  <div className="flex flex-col items-center gap-3 rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-6 text-center text-sm text-[#B91C1C]">
                    <AlertCircle className="h-5 w-5" /> 加载消息失败：{msgError}
                    <button onClick={() => activeId && loadMessages(activeId)} className="chip-btn h-8 bg-white">
                      <RotateCw className="h-3.5 w-3.5" /> 重试
                    </button>
                  </div>
                )}
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-[#F2F2F4] px-4 py-2.5 text-[15px] leading-6">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3">
                      <img src={ASSISTANT_AVATAR} alt="Atoms 助手" className="h-8 w-8 shrink-0 rounded-full bg-[#F2F2F4] object-cover" />
                      <div className="min-w-0 flex-1 pt-1">
                        {m.status === 'thinking' && !m.content && (
                          <div className="flex items-center gap-2 text-sm text-[#9A9AA5]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {m.recalled ? `已召回 ${m.recalled.length} 条记忆，正在思考…` : '正在检索记忆…'}
                          </div>
                        )}
                        {m.content && (
                          <div className="md-body text-[15px] leading-7">
                            <Markdown options={{ forceBlock: true }}>{m.content}</Markdown>
                          </div>
                        )}
                        {m.status === 'error' && (
                          <div className="mt-1 flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
                            <AlertCircle className="h-4 w-4 shrink-0" /> 回复失败：{m.error}，请重新发送。
                          </div>
                        )}
                        <MemoryEvents msg={m} />
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="shrink-0 px-4 pb-5">
              <div className="mx-auto max-w-[760px]">
                <Composer ref={inputRef} busy={busy} mode={mode} onSend={send} onOpenMemory={() => setPanelOpen(true)} />
              </div>
            </div>
          </>
        )}
      </main>

      <MemoryPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        version={memVersion}
        mode={mode}
        onModeChange={changeMode}
        onCountChange={setMemoryCount}
      />
    </div>
  );
}

export default function Index() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 bg-white text-sm text-[#9A9AA5]">
        <Loader2 className="h-6 w-6 animate-spin" /> 正在确认登录状态…
      </div>
    );
  }
  if (!user) return <Landing onLogin={() => navigate('/login')} onRegister={() => navigate('/register')} />;
  const doLogout = async () => {
    localStorage.removeItem(LAST_CONVERSATION_KEY);
    localStorage.removeItem('atoms:lastProject');
    await logout();
  };
  return <ChatApp userName={user.name ?? ''} userEmail={user.email} onLogout={doLogout} />;
}
