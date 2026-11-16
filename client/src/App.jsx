import CanvasPage from './pages/CanvasPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './hooks/useAuth';

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="auth-loading">Restoring session…</div>;
  }
  if (!user) {
    return <LoginPage />;
  }
  return <CanvasPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
