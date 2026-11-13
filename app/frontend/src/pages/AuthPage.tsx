import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Brain, CheckCircle2, FolderKanban, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AtomsLogo } from '@/components/chat/ChatSidebar';
import { AGENT_AVATARS } from '@/lib/memchat';
import { rememberReturn } from '@/lib/authFlow';

const COPY = {
  login: {
    title: '登录 Atoms',
    desc: '使用邮箱和密码登录，继续你的对话、记忆和项目。',
    cta: '使用邮箱登录',
    switchText: '还没有账号？',
    switchLink: '免费注册',
    switchTo: '/register',
  },
  register: {
    title: '注册 Atoms 账号',
    desc: '用邮箱和密码创建账号，记忆和项目会安全保存在你的账号下。',
    cta: '使用邮箱注册',
    switchText: '已有账号？',
    switchLink: '直接登录',
    switchTo: '/login',
  },
} as const;

const HIGHLIGHTS = [
  { Icon: Brain, text: '三层记忆：规则、会话、长期记忆，跨对话召回' },
  { Icon: FolderKanban, text: '项目主管 + 开发工程师协作，生成可预览的应用' },
  { Icon: ShieldCheck, text: '账号由 Atoms Cloud 托管，数据按账号隔离' },
];

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, login, error } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';
  const [redirecting, setRedirecting] = useState(false);
  const copy = COPY[mode];

  useEffect(() => {
    if (!loading && user) navigate(redirect, { replace: true });
  }, [loading, user, redirect, navigate]);

  useEffect(() => {
    if (error && redirecting) setRedirecting(false);
  }, [error, redirecting]);

  const start = async () => {
    rememberReturn(redirect);
    setRedirecting(true);
    await login();
  };

  return (
    <div className="flex min-h-[100dvh] bg-white text-[#0B0B0F]">
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden bg-[#0B0B0F] p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#7C5CFF]/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[#C25BFF]/30 blur-3xl" />
        <Link to="/" className="relative w-fit rounded-lg bg-white px-2.5 py-1.5 text-[#0B0B0F]"><AtomsLogo /></Link>
        <div className="relative">
          <div className="flex -space-x-2">
            {AGENT_AVATARS.map((a) => (
              <img key={a} src={a} alt="" className="h-10 w-10 rounded-full border-2 border-[#0B0B0F] bg-[#1F1F27] object-cover" />
            ))}
          </div>
          <h2 className="mt-6 text-[30px] font-bold leading-[38px] tracking-tight">
            一个会<span className="bg-gradient-to-r from-[#A78BFA] to-[#E879F9] bg-clip-text text-transparent">记住你</span>的 AI 团队
          </h2>
          <ul className="mt-6 space-y-3 text-[14px] text-white/80">
            {HIGHLIGHTS.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#A78BFA]" />{text}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-white/50">© Atoms Demo</p>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between px-6 lg:justify-end">
          <Link to="/" className="lg:hidden"><AtomsLogo /></Link>
          <p className="text-[13px] text-[#5B5B66]">
            {copy.switchText}
            <Link to={`${copy.switchTo}?redirect=${encodeURIComponent(redirect)}`} className="ml-1 font-medium text-[#5B3FD9] hover:underline">{copy.switchLink}</Link>
          </p>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[28px] font-bold tracking-tight">{copy.title}</h1>
            <p className="mt-2 text-[14px] leading-6 text-[#5B5B66]">{copy.desc}</p>

            <div className="mt-8 rounded-[16px] border border-[#E7E7EA] p-5 shadow-[0_8px_32px_rgba(15,15,20,0.06)]">
              <ol className="space-y-3 text-[13px] text-[#2A2A33]">
                <li className="flex gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CFF]" />点击下方按钮，进入 Atoms Cloud 安全认证页</li>
                <li className="flex gap-2.5"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CFF]" />{mode === 'register' ? '填写邮箱并设置密码完成注册（认证页会校验邮箱格式和密码强度）' : '输入邮箱和密码（认证页负责校验并提示错误）'}</li>
                <li className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CFF]" />完成后自动返回{redirect === '/' ? '首页' : '刚才访问的页面'}</li>
              </ol>
              <button
                onClick={start}
                disabled={loading || redirecting}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#0B0B0F] text-[15px] font-medium text-white transition-colors hover:bg-[#2A2A33] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading || redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {redirecting ? '正在前往认证页…' : copy.cta}
                {!redirecting && <ArrowRight className="h-4 w-4" />}
              </button>
              {error && <p role="alert" className="mt-3 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">无法发起登录：{error}，请稍后重试。</p>}
            </div>
            <p className="mt-4 text-center text-[12px] leading-5 text-[#9A9AA5]">
              认证由 Atoms Cloud 统一托管，本应用不保存你的密码。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
