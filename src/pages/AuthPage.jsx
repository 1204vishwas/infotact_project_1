import { useEffect, useState } from 'react';
import { AuthSessionCard } from '../components/AuthSessionCard';
import { BrandLogo } from '../components/BrandLogo';
import { LoginForm } from '../components/LoginForm';
import { PipelinePreview } from '../components/PipelinePreview';
import { SignUpForm } from '../components/SignUpForm';
import { getCurrentSession, signOut } from '../utils/auth';

const CAPABILITY_PILLS = [
  { label: 'MongoDB Time-Series', detail: '5,000+ writes/sec' },
  { label: 'RxJS Stream Compiler', detail: 'Sub-ms evaluation' },
  { label: 'WebSocket & SMS', detail: 'Instant anomaly alerts' },
];

const HERO_COPY = {
  login: {
    eyebrow: 'Operator Access Console',
    title: 'Jump back into your live telemetry rule canvas.',
    description:
      'Sign in with your Gmail & password, Google, or Facebook to monitor reactive sensor streams, threshold filters, and WebSocket alerts.',
  },
  signup: {
    eyebrow: 'No-Code Industrial Rule Engine',
    title: 'Turn factory telemetry streams into live visual logic.',
    description:
      'Connect sensor streams, moving-average filters, and real-time alert triggers on a visual canvas—compiled instantly into reactive pipelines without hardcoding rules.',
  },
};

function resolveModeFromUrl(fallbackMode) {
  if (typeof window === 'undefined') return fallbackMode;
  const hash = window.location.hash.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  if (hash.includes('signup') || path.endsWith('/signup')) return 'signup';
  if (hash.includes('login') || hash.includes('signin') || path.endsWith('/login')) return 'login';
  return fallbackMode;
}

/**
 * Primary two-column NexusFlow authentication page combining the live telemetry
 * pipeline showcase with Sign In and Sign Up workflows.
 */
export function AuthPage({ defaultMode = 'login' }) {
  const [mode, setMode] = useState(() => resolveModeFromUrl(defaultMode));
  const [draftEmail, setDraftEmail] = useState('');
  const [session, setSession] = useState(() => {
    const existing = getCurrentSession();
    return existing ? { ...existing, isNewUser: false } : null;
  });

  useEffect(() => {
    document.title = mode === 'signup' ? 'NexusFlow — Sign Up' : 'NexusFlow — Sign In';
  }, [mode]);

  useEffect(() => {
    const syncModeFromUrl = () => {
      setMode(resolveModeFromUrl(defaultMode));
    };
    window.addEventListener('hashchange', syncModeFromUrl);
    window.addEventListener('popstate', syncModeFromUrl);
    return () => {
      window.removeEventListener('hashchange', syncModeFromUrl);
      window.removeEventListener('popstate', syncModeFromUrl);
    };
  }, [defaultMode]);

  const switchMode = (nextMode, prefillEmail) => {
    if (typeof prefillEmail === 'string') {
      setDraftEmail(prefillEmail);
    }
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      const targetHash = nextMode === 'signup' ? '#signup' : '#login';
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }
  };

  const handleAuthSuccess = ({ user, provider, isNewUser }) => {
    setSession({ user, provider, isNewUser });
  };

  const handleSignOut = () => {
    const lastEmail = session?.user?.email || '';
    signOut();
    setSession(null);
    switchMode('login', lastEmail);
  };

  const handleCreateAnother = () => {
    signOut();
    setSession(null);
    switchMode('signup', '');
  };

  const hero = HERO_COPY[mode] || HERO_COPY.login;

  return (
    <main className="signup-layout">
      <section className="showcase-panel" aria-label="NexusFlow Platform Overview">
        <div className="showcase-inner">
          <BrandLogo />

          <div className="hero-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h2 className="hero-title">{hero.title}</h2>
            <p className="hero-description">{hero.description}</p>
          </div>

          <PipelinePreview />

          <div className="capability-strip">
            {CAPABILITY_PILLS.map((item) => (
              <div key={item.label} className="capability-card">
                <span className="capability-label">{item.label}</span>
                <span className="capability-detail">{item.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="form-panel"
        aria-label={mode === 'signup' ? 'Operator Sign Up' : 'Operator Sign In'}
      >
        <div className="mobile-brand">
          <BrandLogo />
        </div>

        {session ? (
          <AuthSessionCard
            user={session.user}
            provider={session.provider}
            isNewUser={session.isNewUser}
            onSignOut={handleSignOut}
            onCreateAnother={handleCreateAnother}
          />
        ) : mode === 'signup' ? (
          <SignUpForm
            key={`signup-${draftEmail}`}
            initialEmail={draftEmail}
            onSwitchToLogin={(email) => switchMode('login', email)}
            onAuthSuccess={handleAuthSuccess}
          />
        ) : (
          <LoginForm
            key={`login-${draftEmail}`}
            initialEmail={draftEmail}
            onSwitchToSignUp={(email) => switchMode('signup', email)}
            onAuthSuccess={handleAuthSuccess}
          />
        )}
      </section>
    </main>
  );
}
