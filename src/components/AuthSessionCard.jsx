import { formatProviderName } from '../utils/auth';
import { FacebookLogoIcon, GoogleLogoIcon } from './FormFields';

function ProviderBadge({ provider }) {
  if (provider === 'google') {
    return (
      <span className="provider-chip provider-chip-google">
        <GoogleLogoIcon size={14} />
        Signed in with Google
      </span>
    );
  }
  if (provider === 'facebook') {
    return (
      <span className="provider-chip provider-chip-facebook">
        <FacebookLogoIcon size={14} />
        Signed in with Facebook
      </span>
    );
  }
  return <span className="provider-chip provider-chip-email">Email &amp; Password</span>;
}

/**
 * Authenticated operator workspace summary shown after successful sign-up or login.
 */
export function AuthSessionCard({
  user,
  provider = 'password',
  isNewUser = false,
  onSignOut,
  onCreateAnother,
}) {
  const connectedMethods = Array.isArray(user.providers) && user.providers.length > 0
    ? user.providers.map(formatProviderName).join(' · ')
    : formatProviderName(provider);

  return (
    <div className="signup-card success-card" role="status" aria-live="polite">
      <div className="session-top-row">
        <div className="success-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <ProviderBadge provider={provider} />
      </div>

      <h2 className="form-title">
        {isNewUser ? 'Workspace account created' : `Welcome back, ${user.fullName}`}
      </h2>
      <p className="form-subtitle">
        Operator credentials for <strong>{user.facilityName}</strong> are active for NexusFlow
        telemetry rule authoring.
      </p>

      <dl className="summary-grid">
        <div className="summary-row">
          <dt>Operator</dt>
          <dd>{user.fullName}</dd>
        </div>
        <div className="summary-row">
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div className="summary-row">
          <dt>Role</dt>
          <dd>{user.roleLabel}</dd>
        </div>
        <div className="summary-row">
          <dt>Workspace ID</dt>
          <dd className="mono-value">{user.workspaceId}</dd>
        </div>
        <div className="summary-row">
          <dt>Auth Methods</dt>
          <dd>{connectedMethods}</dd>
        </div>
        {user.alertPhone && (
          <div className="summary-row">
            <dt>SMS Alert Target</dt>
            <dd className="mono-value">{user.alertPhone}</dd>
          </div>
        )}
      </dl>

      <div className="session-actions">
        <button type="button" className="btn-primary" onClick={onSignOut}>
          Sign out
        </button>
        {onCreateAnother && (
          <button type="button" className="btn-secondary" onClick={onCreateAnother}>
            Register another operator
          </button>
        )}
      </div>
    </div>
  );
}
