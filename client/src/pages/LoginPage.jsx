import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login, register, guestLogin } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>NexusFlow</h1>
          <p>Visual IoT Telemetry &amp; Rule Engine</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === 'register' && (
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Factory Floor Manager"
                required
                minLength={2}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="manager@factory.example"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              required
              minLength={6}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or explore canvas</span>
        </div>

        <button
          type="button"
          className="guest-canvas-btn"
          onClick={guestLogin}
          title="Directly open the visual drag-and-drop canvas in guest mode"
        >
          Open Visual Canvas in Guest Mode →
        </button>

        <p className="auth-hint">
          {mode === 'login'
            ? 'New here? Create an account to build and own rule graphs.'
            : 'Passwords are hashed with scrypt and sessions use signed JWTs.'}
        </p>
      </div>
    </div>
  );
}
