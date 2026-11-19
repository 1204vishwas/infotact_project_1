import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login, register, loginWithGoogle, loginWithFacebook, demoLogin, guestLogin } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Social Auth Modal state
  const [socialModal, setSocialModal] = useState(null); // 'google' | 'facebook' | null
  const [socialCustomEmail, setSocialCustomEmail] = useState('');
  const [socialCustomName, setSocialCustomName] = useState('');

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter a valid email address.');
      setBusy(false);
      return;
    }

    try {
      if (mode === 'login') {
        await login(cleanEmail, password);
      } else {
        await register(name.trim(), cleanEmail, password);
      }
    } catch (err) {
      setError(err.message || 'Authentication error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const openSocialPrompt = (provider) => {
    const currentEmail = email.trim();
    const defaultEmail = currentEmail || (provider === 'google' ? 'vishutripathi1204@gmail.com' : 'operator@facebook.com');
    const defaultName = currentEmail ? currentEmail.split('@')[0] : provider === 'google' ? 'Vishu Tripathi' : 'Facebook Operator';

    setSocialCustomEmail(defaultEmail);
    setSocialCustomName(defaultName);
    setSocialModal(provider);
    setError(null);
  };

  const confirmSocialLogin = async (e) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const cleanEmail = socialCustomEmail.trim() || (socialModal === 'google' ? 'user@gmail.com' : 'user@facebook.com');
      const cleanName = socialCustomName.trim() || cleanEmail.split('@')[0];

      if (socialModal === 'google') {
        await loginWithGoogle({ email: cleanEmail, name: cleanName });
      } else {
        await loginWithFacebook({ email: cleanEmail, name: cleanName });
      }
      setSocialModal(null);
    } catch (err) {
      setError(err.message || 'Social sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      await demoLogin();
    } catch (err) {
      setError(err.message || 'Demo login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-brand">
          <div className="brand-badge-row">
            <div className="brand-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="18" r="3" />
                <path d="M6 9v3a3 3 0 0 0 3 3h6" />
                <circle cx="18" cy="6" r="3" />
                <path d="M18 9v3a3 3 0 0 1-3 3" />
              </svg>
            </div>
            <span className="platform-tag">IoT TELEMETRY ENGINE</span>
          </div>
          <h1>NexusFlow</h1>
          <p>Visual IoT Telemetry &amp; Reactive Rule Engine</p>
        </div>

        {/* Social Authentication Row */}
        <div className="social-auth-section">
          <div className="social-buttons-grid">
            {/* Google Login Button */}
            <button
              type="button"
              className="social-btn google-btn"
              onClick={() => openSocialPrompt('google')}
              disabled={busy}
              title="Sign in with your Google or Gmail account"
            >
              <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Facebook Login Button */}
            <button
              type="button"
              className="social-btn facebook-btn"
              onClick={() => openSocialPrompt('facebook')}
              disabled={busy}
              title="Sign in with your Facebook account"
            >
              <svg className="social-icon" viewBox="0 0 24 24" width="20" height="20" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>Continue with Facebook</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="auth-divider">
          <span>or continue with email</span>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        {/* Email & Password Form */}
        <form className="auth-form" onSubmit={handleEmailSubmit}>
          {mode === 'register' && (
            <label className="form-group">
              <span className="field-label">Full Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Vishu Tripathi"
                required
                minLength={2}
              />
            </label>
          )}

          <label className="form-group">
            <span className="field-label">Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="operator@nexusflow.io or Gmail"
              required
            />
          </label>

          <label className="form-group">
            <div className="field-header">
              <span className="field-label">Password</span>
              {mode === 'login' && (
                <button
                  type="button"
                  className="inline-reset-btn"
                  onClick={() => alert('Enter your email and click Quick Demo or sign in with Google/Facebook!')}
                >
                  Need help?
                </button>
              )}
            </div>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {error && (
            <div className="auth-error-banner" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button className="primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {/* Fast Action Options */}
        <div className="auth-divider">
          <span>or explore canvas</span>
        </div>

        <div className="quick-access-grid">
          <button
            type="button"
            className="guest-canvas-btn"
            onClick={guestLogin}
            disabled={busy}
            title="Open the visual drag-and-drop rule canvas immediately in guest mode"
          >
            <span>Open Visual Canvas in Guest Mode →</span>
          </button>

          <button
            type="button"
            className="demo-operator-btn"
            onClick={handleQuickDemo}
            disabled={busy}
            title="1-click demo login as Floor Manager with preset pipelines"
          >
            <span className="demo-dot" />
            <span>1-Click Demo Operator Access</span>
          </button>
        </div>

        <p className="auth-hint">
          {mode === 'login'
            ? 'Sign in with Google, Facebook, or your Email to build, test, and activate real-time telemetry rule graphs.'
            : 'Accounts persist across sessions with salted scrypt encryption and instant visual rule evaluation.'}
        </p>
      </div>

      {/* Interactive Social Login Modal */}
      {socialModal && (
        <div className="social-modal-overlay" onClick={() => setSocialModal(null)}>
          <div className="social-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                {socialModal === 'google' ? (
                  <svg className="social-icon" viewBox="0 0 24 24" width="22" height="22">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                ) : (
                  <svg className="social-icon" viewBox="0 0 24 24" width="22" height="22" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                )}
                <h3>Sign in with {socialModal === 'google' ? 'Google' : 'Facebook'}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSocialModal(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={confirmSocialLogin} className="social-modal-form">
              <p className="modal-description">
                Confirm your account profile to open the NexusFlow rule canvas:
              </p>

              <label className="form-group">
                <span className="field-label">Name</span>
                <input
                  type="text"
                  value={socialCustomName}
                  onChange={(e) => setSocialCustomName(e.target.value)}
                  placeholder="Operator Name"
                  required
                />
              </label>

              <label className="form-group">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  value={socialCustomEmail}
                  onChange={(e) => setSocialCustomEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  required
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setSocialModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary modal-confirm-btn"
                  disabled={busy}
                >
                  {busy ? 'Connecting…' : `Continue with ${socialModal === 'google' ? 'Google' : 'Facebook'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
