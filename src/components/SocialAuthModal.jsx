import { useEffect, useState } from 'react';
import { getSavedAccountsByProvider, loginWithSocial } from '../utils/auth';
import { validateField, validateSocialAuthForm } from '../utils/validation';
import { FacebookLogoIcon, GoogleLogoIcon, InputField } from './FormFields';

const PROVIDER_META = {
  google: {
    name: 'Google',
    title: 'Sign in with Google',
    subtitle: 'Choose a Google account or enter your Gmail address to continue to NexusFlow.',
    emailLabel: 'Gmail / Google Email',
    emailPlaceholder: 'you@gmail.com',
    demoProfile: { fullName: 'Alex Rivera', email: 'alex.rivera@gmail.com' },
    accentClass: 'provider-google',
  },
  facebook: {
    name: 'Facebook',
    title: 'Log in with Facebook',
    subtitle: 'NexusFlow is requesting access to your name and email address.',
    emailLabel: 'Facebook Email Address',
    emailPlaceholder: 'you@gmail.com',
    demoProfile: { fullName: 'Jordan Lee', email: 'jordan.lee@gmail.com' },
    accentClass: 'provider-facebook',
  },
};

function getInitials(name, email) {
  const source = (name || email || 'U').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Interactive OAuth account chooser and consent modal for Google and Facebook sign-in.
 */
export function SocialAuthModal({ provider, rememberMe = true, onClose, onSuccess }) {
  const meta = PROVIDER_META[provider];
  const [savedAccounts] = useState(() => getSavedAccountsByProvider(provider));
  const [showCustomForm, setShowCustomForm] = useState(() => getSavedAccountsByProvider(provider).length === 0);
  const [values, setValues] = useState({ fullName: '', email: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isConnecting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnecting, onClose]);

  if (!meta) return null;

  const completeSocialLogin = ({ email, fullName }) => {
    setIsConnecting(true);
    window.setTimeout(() => {
      const result = loginWithSocial({
        provider,
        email,
        fullName,
        rememberMe,
      });
      setIsConnecting(false);
      if (result.ok) {
        onSuccess(result);
      }
    }, 450);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);
    if (touched[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: validateField(name, value, nextValues),
      }));
    }
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({
      ...prev,
      [name]: validateField(name, values[name], values),
    }));
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    setTouched({ fullName: true, email: true });
    const nextErrors = validateSocialAuthForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    completeSocialLogin({
      email: values.email,
      fullName: values.fullName,
    });
  };

  const handleFillDemo = () => {
    setValues(meta.demoProfile);
    setErrors({});
    setTouched({ fullName: true, email: true });
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!isConnecting) onClose();
      }}
    >
      <div
        className={`oauth-modal ${meta.accentClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="oauth-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="oauth-modal-header">
          <div className="oauth-brand-pill">
            {provider === 'google' ? <GoogleLogoIcon size={20} /> : <FacebookLogoIcon size={20} />}
            <span>{meta.name} OAuth</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={isConnecting}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <h2 id="oauth-modal-title" className="oauth-modal-title">
          {meta.title}
        </h2>
        <p className="oauth-modal-subtitle">{meta.subtitle}</p>

        {!showCustomForm && savedAccounts.length > 0 ? (
          <div className="oauth-account-list">
            {savedAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className="oauth-account-item"
                disabled={isConnecting}
                onClick={() =>
                  completeSocialLogin({
                    email: account.email,
                    fullName: account.fullName,
                  })
                }
              >
                <span className="oauth-avatar" aria-hidden="true">
                  {getInitials(account.fullName, account.email)}
                </span>
                <span className="oauth-account-info">
                  <span className="oauth-account-name">{account.fullName}</span>
                  <span className="oauth-account-email">{account.email}</span>
                </span>
                <span className="oauth-account-action">
                  {isConnecting ? 'Signing in...' : 'Continue'}
                </span>
              </button>
            ))}

            <button
              type="button"
              className="oauth-switch-btn"
              disabled={isConnecting}
              onClick={() => setShowCustomForm(true)}
            >
              + Use another {meta.name} account
            </button>
          </div>
        ) : (
          <form className="oauth-form" onSubmit={handleFormSubmit} noValidate>
            <InputField
              id="social-fullName"
              name="fullName"
              label="Full Name"
              placeholder="Alex Rivera"
              autoComplete="name"
              value={values.fullName}
              error={errors.fullName}
              onChange={handleFieldChange}
              onBlur={handleBlur}
              disabled={isConnecting}
            />

            <InputField
              id="social-email"
              name="email"
              label={meta.emailLabel}
              type="email"
              placeholder={meta.emailPlaceholder}
              autoComplete="email"
              value={values.email}
              error={errors.email}
              onChange={handleFieldChange}
              onBlur={handleBlur}
              disabled={isConnecting}
            />

            <div className="oauth-helper-row">
              <button
                type="button"
                className="link-button oauth-demo-link"
                onClick={handleFillDemo}
                disabled={isConnecting}
              >
                Use sample {meta.name} account
              </button>

              {savedAccounts.length > 0 && (
                <button
                  type="button"
                  className="link-button oauth-demo-link"
                  onClick={() => setShowCustomForm(false)}
                  disabled={isConnecting}
                >
                  Back to saved accounts
                </button>
              )}
            </div>

            <div className="oauth-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={isConnecting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn-primary ${provider === 'facebook' ? 'btn-facebook-submit' : ''}`}
                disabled={isConnecting}
              >
                {isConnecting ? `Connecting ${meta.name}...` : `Continue with ${meta.name}`}
              </button>
            </div>
          </form>
        )}

        <p className="oauth-disclaimer">
          Local OAuth preview: creates or links your NexusFlow operator session in this browser.
        </p>
      </div>
    </div>
  );
}
