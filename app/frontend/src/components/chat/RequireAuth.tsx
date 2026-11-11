import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AtomsLogo } from '@/components/chat/ChatSidebar';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, login } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#9A9AA5]" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
        <AtomsLogo />
        <p className="text-sm text-[#5B5B66]">登录后即可使用项目工作区</p>
        <button onClick={login} className="h-10 rounded-[10px] bg-[#0B0B0F] px-5 text-sm font-medium text-white hover:bg-[#2A2A33]">
          登录
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
