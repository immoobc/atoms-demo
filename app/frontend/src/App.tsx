import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Index from './pages/Index';
import Projects from './pages/Projects';
import ProjectWorkspace from './pages/ProjectWorkspace';
import AuthPage from './pages/AuthPage';
import Account from './pages/Account';
import AuthCallback from './pages/AuthCallback';
import AuthError from './pages/AuthError';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { takeReturn } from './lib/authFlow';
// MODULE_IMPORTS_START
// MODULE_IMPORTS_END

const queryClient = new QueryClient();

/** After the hosted login lands on "/", send the user back to the page they originally requested. */
function ReturnAfterLogin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (loading || !user) return;
    const target = takeReturn();
    if (target && target !== `${location.pathname}${location.search}`) navigate(target, { replace: true });
  }, [loading, user]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const AppRoutes = () => (
  <>
    <ReturnAfterLogin />
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/account" element={<Account />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:id" element={<ProjectWorkspace />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/error" element={<AuthError />} />
      {/* MODULE_ROUTES_START */}
      {/* MODULE_ROUTES_END */}
    </Routes>
  </>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* MODULE_PROVIDERS_START */}
    {/* MODULE_PROVIDERS_END */}
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    {/* MODULE_PROVIDERS_CLOSE */}
  </QueryClientProvider>
);

export default App;
export { AppRoutes };
