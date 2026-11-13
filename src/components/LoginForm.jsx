import { useMemo, useState } from 'react';
import { loginWithEmail, resetPassword } from '../utils/auth';
import {
  evaluatePasswordStrength,
  validateField,
  validateLoginField,
  validateLoginForm,
  validateResetPasswordForm,
} from '../utils/validation';
import {
  EyeIcon,
  InputField,
  PasswordStrengthMeter,
  SocialAuthButtons,
} from './FormFields';
import { SocialAuthModal } from './SocialAuthModal';

/**
 * NexusFlow operator sign-in form supporting Gmail/email & password,
 * inline password reset, and Google / Facebook OAuth sign-in.
 */
export function LoginForm({
  initialEmail = '',
  onSwitchToSignUp,
  onAuthSuccess,
}) {
  const [view, setView] = useState('login');
  const [values, setValues] = useState({
    email: initialEmail,
    password: '',
    rememberMe: true,
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [statusBanner, setStatusBanner] = useState('');
  const [socialProvider, setSocialProvider] = useState(null);

  const [resetValues, setResetValues] = useState({
    email: initialEmail,
    password: '',
    confirmPassword: '',
  });
  const [resetErrors, setResetErrors] = useState({});
  const [resetTouched, setResetTouched] = useState({});
  const [resetBannerError, setResetBannerError] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const resetStrength = useMemo(
    () => evaluatePasswordStrength(resetValues.password),
    [resetValues.password]
  );

  const handleLoginChange = (event) => {
    const { name, type, checked, value } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setValues((prev) => ({ ...prev, [name]: nextValue }));
    setAuthError(null);

    if (touched[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: validateLoginField(name, nextValue),
      }));
    }
  };

  const handleLoginBlur = (event) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({
      ...prev,
      [name]: validateLoginField(name, values[name]),
    }));
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setAuthError(null);
    setStatusBanner('');
    setTouched({ email: true, password: true });

    const nextErrors = validateLoginForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    const result = await loginWithEmail({
      email: values.email,
      password: values.password,
      rememberMe: values.rememberMe,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setAuthError({
        code: result.code,
        message: result.error,
        providers: result.providers || [],
      });
      return;
    }

    onAuthSuccess({
      user: result.user,
      provider: 'password',
      isNewUser: false,
    });
  };

  const openResetView = () => {
    setResetValues({
      email: values.email.trim(),
      password: '',
      confirmPassword: '',
    });
    setResetErrors({});
    setResetTouched({});
    setResetBannerError('');
    setShowResetPassword(false);
    setShowResetConfirm(false);
    setView('forgot');
  };

  const handleResetChange = (event) => {
    const { name, value } = event.target;
    const nextValues = { ...resetValues, [name]: value };
    setResetValues(nextValues);
    setResetBannerError('');

    if (resetTouched[name]) {
      setResetErrors((prev) => ({
        ...prev,
        [name]: validateField(name, value, nextValues),
      }));
    }

    if (name === 'password' && resetTouched.confirmPassword) {
      setResetErrors((prev) => ({
        ...prev,
        confirmPassword: validateField('confirmPassword', nextValues.confirmPassword, nextValues),
      }));
    }
  };

  const handleResetBlur = (event) => {
    const { name } = event.target;
    setResetTouched((prev) => ({ ...prev, [name]: true }));
    setResetErrors((prev) => ({
      ...prev,
      [name]: validateField(name, resetValues[name], resetValues),
    }));
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    setResetBannerError('');
    setResetTouched({ email: true, password: true, confirmPassword: true });

    const nextErrors = validateResetPasswordForm(resetValues);
    setResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsResetting(true);
    const result = await resetPassword({
      email: resetValues.email,
      newPassword: resetValues.password,
    });
    setIsResetting(false);

    if (!result.ok) {
      setResetBannerError(result.error);
      return;
    }

    setValues((prev) => ({
      ...prev,
      email: resetValues.email.trim(),
      password: '',
    }));
    setAuthError(null);
    setStatusBanner('Password updated. Sign in below with your new password.');
    setView('login');
  };

  if (view === 'forgot') {
    return (
      <div className="signup-card">
        <div className="form-header">
          <button
            type="button"
            className="back-link-button"
            onClick={() => setView('login')}
          >
            ← Back to Sign In
          </button>
          <h1 className="form-title">Reset your password</h1>
          <p className="form-subtitle">
            Enter the Gmail or email address for your NexusFlow account and choose a new password.
          </p>
        </div>

        {resetBannerError && (
          <div className="auth-alert auth-alert-error" role="alert">
            <p>{resetBannerError}</p>
            {onSwitchToSignUp && (
              <button
                type="button"
                className="alert-inline-action"
                onClick={() => onSwitchToSignUp(resetValues.email)}
              >
                Create an account instead →
              </button>
            )}
          </div>
        )}

        <form className="signup-form" onSubmit={handleResetSubmit} noValidate>
          <InputField
            id="reset-email"
            name="email"
            label="Gmail / Email Address"
            type="email"
            placeholder="you@gmail.com"
            autoComplete="email"
            value={resetValues.email}
            error={resetErrors.email}
            onChange={handleResetChange}
            onBlur={handleResetBlur}
          />

          <InputField
            id="reset-password"
            name="password"
            label="New Password"
            type={showResetPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            autoComplete="new-password"
            value={resetValues.password}
            error={resetErrors.password}
            onChange={handleResetChange}
            onBlur={handleResetBlur}
            rightSlot={
              <button
                type="button"
                className="password-toggle"
                aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowResetPassword((prev) => !prev)}
              >
                <EyeIcon visible={showResetPassword} />
              </button>
            }
          />

          <PasswordStrengthMeter strength={resetStrength} />

          <InputField
            id="reset-confirmPassword"
            name="confirmPassword"
            label="Confirm New Password"
            type={showResetConfirm ? 'text' : 'password'}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            value={resetValues.confirmPassword}
            error={resetErrors.confirmPassword}
            onChange={handleResetChange}
            onBlur={handleResetBlur}
            rightSlot={
              <button
                type="button"
                className="password-toggle"
                aria-label={showResetConfirm ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowResetConfirm((prev) => !prev)}
              >
                <EyeIcon visible={showResetConfirm} />
              </button>
            }
          />

          <button type="submit" className="btn-primary" disabled={isResetting}>
            {isResetting ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="signup-card">
      {onSwitchToSignUp && (
        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="auth-mode-tab is-active"
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="auth-mode-tab"
            onClick={() => onSwitchToSignUp(values.email)}
          >
            Create Account
          </button>
        </div>
      )}

      <div className="form-header">
        <h1 className="form-title">Sign in to NexusFlow</h1>
        <p className="form-subtitle">
          Access your visual telemetry rules with Gmail &amp; password, Google, or Facebook.
        </p>
      </div>

      {statusBanner && (
        <div className="auth-alert auth-alert-success" role="status">
          <p>{statusBanner}</p>
        </div>
      )}

      <SocialAuthButtons
        mode="login"
        onSelectProvider={(provider) => setSocialProvider(provider)}
        disabled={isSubmitting}
      />

      {authError && (
        <div className="auth-alert auth-alert-error" role="alert">
          <p>{authError.message}</p>
          {authError.code === 'ACCOUNT_NOT_FOUND' && onSwitchToSignUp && (
            <button
              type="button"
              className="alert-inline-action"
              onClick={() => onSwitchToSignUp(values.email)}
            >
              Create account with {values.email.trim() || 'this email'} →
            </button>
          )}
          {authError.code === 'SOCIAL_ONLY' && (
            <div className="alert-inline-row">
              {authError.providers.includes('google') && (
                <button
                  type="button"
                  className="alert-inline-action"
                  onClick={() => setSocialProvider('google')}
                >
                  Open Google sign-in
                </button>
              )}
              {authError.providers.includes('facebook') && (
                <button
                  type="button"
                  className="alert-inline-action"
                  onClick={() => setSocialProvider('facebook')}
                >
                  Open Facebook sign-in
                </button>
              )}
              <button
                type="button"
                className="alert-inline-action"
                onClick={openResetView}
              >
                Set a password
              </button>
            </div>
          )}
        </div>
      )}

      <form className="signup-form" onSubmit={handleLoginSubmit} noValidate>
        <InputField
          id="login-email"
          name="email"
          label="Gmail / Email Address"
          type="email"
          placeholder="you@gmail.com"
          autoComplete="email"
          value={values.email}
          error={errors.email}
          onChange={handleLoginChange}
          onBlur={handleLoginBlur}
        />

        <InputField
          id="login-password"
          name="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          autoComplete="current-password"
          value={values.password}
          error={errors.password}
          onChange={handleLoginChange}
          onBlur={handleLoginBlur}
          rightSlot={
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              <EyeIcon visible={showPassword} />
            </button>
          }
        />

        <div className="login-options-row">
          <label className="remember-label" htmlFor="login-rememberMe">
            <input
              id="login-rememberMe"
              name="rememberMe"
              type="checkbox"
              checked={values.rememberMe}
              onChange={handleLoginChange}
            />
            <span>Remember me</span>
          </label>

          <button
            type="button"
            className="link-button forgot-link"
            onClick={openResetView}
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Signing In...' : 'Sign In to NexusFlow'}
        </button>
      </form>

      <div className="form-footer">
        <span>Don&apos;t have an operator account?</span>{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => onSwitchToSignUp && onSwitchToSignUp(values.email)}
        >
          Create account
        </button>
      </div>

      {socialProvider && (
        <SocialAuthModal
          provider={socialProvider}
          rememberMe={values.rememberMe}
          onClose={() => setSocialProvider(null)}
          onSuccess={(result) => {
            setSocialProvider(null);
            onAuthSuccess({
              user: result.user,
              provider: socialProvider,
              isNewUser: result.isNewUser,
            });
          }}
        />
      )}
    </div>
  );
}
