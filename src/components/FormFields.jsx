export function EyeIcon({ visible }) {
  if (visible) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A10.8 10.8 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.17 4.49" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function GoogleLogoIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.37l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l4 3.09C6.22 6.87 8.87 4.76 12 4.76z"
      />
    </svg>
  );
}

export function FacebookLogoIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M16.67 15.47l.53-3.47h-3.33V9.75c0-.95.46-1.87 1.95-1.87h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.04V24h3.75v-8.53h2.8z"
      />
    </svg>
  );
}

export function InputField({
  id,
  name,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  value,
  error,
  optional = false,
  hint,
  onChange,
  onBlur,
  rightSlot,
  disabled = false,
}) {
  const errorId = `${id}-error`;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [error ? errorId : null, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field-group">
      <div className="field-label-row">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {optional && <span className="field-optional">Optional</span>}
      </div>

      <div className="input-wrapper">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`text-input ${rightSlot ? 'has-right-slot' : ''} ${error ? 'has-error' : ''}`}
          onChange={onChange}
          onBlur={onBlur}
        />
        {rightSlot}
      </div>

      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordStrengthMeter({ strength }) {
  return (
    <div className="strength-panel" aria-live="polite">
      <div className="strength-header">
        <span className="strength-title">Password strength</span>
        <span className={`strength-badge tone-${strength.tone}`}>{strength.label}</span>
      </div>
      <div className="strength-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`strength-bar ${
              segment < strength.score ? `is-filled tone-${strength.tone}` : ''
            }`}
          />
        ))}
      </div>
      <ul className="strength-rules">
        {strength.checks.map((rule) => (
          <li key={rule.id} className={rule.passed ? 'is-passed' : ''}>
            <span className="rule-dot" aria-hidden="true" />
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SocialAuthButtons({ mode = 'login', onSelectProvider, disabled = false }) {
  const actionVerb = mode === 'signup' ? 'Sign up' : 'Continue';

  return (
    <div className="social-auth-block">
      <div className="social-buttons-grid">
        <button
          type="button"
          className="btn-social btn-social-google"
          onClick={() => onSelectProvider('google')}
          disabled={disabled}
        >
          <GoogleLogoIcon />
          <span>{actionVerb} with Google</span>
        </button>

        <button
          type="button"
          className="btn-social btn-social-facebook"
          onClick={() => onSelectProvider('facebook')}
          disabled={disabled}
        >
          <FacebookLogoIcon />
          <span>{actionVerb} with Facebook</span>
        </button>
      </div>

      <div className="auth-divider" role="separator" aria-label="or">
        <span>or {mode === 'signup' ? 'create with Gmail / email' : 'sign in with Gmail / email'}</span>
      </div>
    </div>
  );
}
