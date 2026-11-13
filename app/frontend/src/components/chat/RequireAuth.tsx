import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/** Gate for protected pages: waits for auth, then sends anonymous visitors to /login with a return path. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 bg-white text-sm text-[#9A9AA5]">
        <Loader2 className="h-6 w-6 animate-spin" /> 正在确认登录状态…
      </div>
    );
  }
  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return <>{children}</>;
}
