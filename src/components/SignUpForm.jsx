import { useMemo, useState } from 'react';
import { registerWithEmail } from '../utils/auth';
import {
  OPERATOR_ROLES,
  evaluatePasswordStrength,
  validateField,
  validateSignUpForm,
} from '../utils/validation';
import { AuthSessionCard } from './AuthSessionCard';
import {
  EyeIcon,
  InputField,
  PasswordStrengthMeter,
  SocialAuthButtons,
} from './FormFields';
import { SocialAuthModal } from './SocialAuthModal';

const INITIAL_VALUES = {
  fullName: '',
  email: '',
  facilityName: '',
  role: 'floor_manager',
  alertPhone: '',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
};

/**
 * NexusFlow operator account sign-up form with client-side validation,
 * password strength evaluation, Google/Facebook sign-up, and account persistence.
 */
export function SignUpForm({
  initialEmail = '',
  onSwitchToLogin,
  onAuthSuccess,
}) {
  const [values, setValues] = useState({
    ...INITIAL_VALUES,
    email: initialEmail,
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [socialProvider, setSocialProvider] = useState(null);
  const [standaloneSession, setStandaloneSession] = useState(null);

  const strength = useMemo(() => evaluatePasswordStrength(values.password), [values.password]);

  const updateField = (name, nextValue) => {
    const nextValues = { ...values, [name]: nextValue };
    setValues(nextValues);
    setFormError('');

    if (touched[name]) {
      const nextError = validateField(name, nextValue, nextValues);
      setErrors((prev) => ({ ...prev, [name]: nextError }));
    }

    // Re-validate password confirmation immediately when the primary password changes.
    if (name === 'password' && touched.confirmPassword) {
      const confirmErr = validateField('confirmPassword', nextValues.confirmPassword, nextValues);
      setErrors((prev) => ({ ...prev, confirmPassword: confirmErr }));
    }
  };

  const handleInputChange = (event) => {
    const { name, type, checked, value } = event.target;
    updateField(name, type === 'checkbox' ? checked : value);
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const fieldError = validateField(name, values[name], values);
    setErrors((prev) => ({ ...prev, [name]: fieldError }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const allTouched = Object.keys(INITIAL_VALUES).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setTouched(allTouched);

    const nextErrors = validateSignUpForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    const result = await registerWithEmail({
      fullName: values.fullName,
      email: values.email,
      facilityName: values.facilityName,
      role: values.role,
      alertPhone: values.alertPhone,
      password: values.password,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    const sessionPayload = {
      user: result.user,
      provider: 'password',
      isNewUser: result.isNewUser,
    };

    if (onAuthSuccess) {
      onAuthSuccess(sessionPayload);
    } else {
      setStandaloneSession(sessionPayload);
    }
  };

  const handleReset = () => {
    setValues(INITIAL_VALUES);
    setErrors({});
    setTouched({});
    setStandaloneSession(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError('');
  };

  if (standaloneSession) {
    return (
      <AuthSessionCard
        user={standaloneSession.user}
        provider={standaloneSession.provider}
        isNewUser={standaloneSession.isNewUser}
        onSignOut={handleReset}
        onCreateAnother={handleReset}
      />
    );
  }

  return (
    <div className="signup-card">
      {onSwitchToLogin && (
        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="auth-mode-tab"
            onClick={() => onSwitchToLogin(values.email)}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="auth-mode-tab is-active"
          >
            Create Account
          </button>
        </div>
      )}

      <div className="form-header">
        <h1 className="form-title">Create your NexusFlow account</h1>
        <p className="form-subtitle">
          Set up operator access with your Gmail &amp; password, Google, or Facebook.
        </p>
      </div>

      <SocialAuthButtons
        mode="signup"
        onSelectProvider={(provider) => setSocialProvider(provider)}
        disabled={isSubmitting}
      />

      {formError && (
        <div className="auth-alert auth-alert-error" role="alert">
          <p>{formError}</p>
          {onSwitchToLogin && (
            <button
              type="button"
              className="alert-inline-action"
              onClick={() => onSwitchToLogin(values.email)}
            >
              Sign in with {values.email.trim() || 'this email'} →
            </button>
          )}
        </div>
      )}

      <form className="signup-form" onSubmit={handleSubmit} noValidate>
        <div className="two-col-row">
          <InputField
            id="fullName"
            name="fullName"
            label="Full Name"
            placeholder="Alex Rivera"
            autoComplete="name"
            value={values.fullName}
            error={errors.fullName}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <InputField
            id="email"
            name="email"
            label="Gmail / Email Address"
            type="email"
            placeholder="you@gmail.com"
            autoComplete="email"
            value={values.email}
            error={errors.email}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />
        </div>

        <div className="two-col-row">
          <InputField
            id="facilityName"
            name="facilityName"
            label="Factory / Plant Name"
            placeholder="Apex Turbine Plant #4"
            autoComplete="organization"
            value={values.facilityName}
            error={errors.facilityName}
            onChange={handleInputChange}
            onBlur={handleBlur}
          />

          <div className="field-group">
            <div className="field-label-row">
              <label htmlFor="role" className="field-label">
                Operational Role
              </label>
            </div>
            <select
              id="role"
              name="role"
              value={values.role}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'role-error' : undefined}
              className={`select-input ${errors.role ? 'has-error' : ''}`}
              onChange={handleInputChange}
              onBlur={handleBlur}
            >
              {OPERATOR_ROLES.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
            {errors.role && (
              <p id="role-error" className="field-error" role="alert">
                {errors.role}
              </p>
            )}
          </div>
        </div>

        <InputField
          id="alertPhone"
          name="alertPhone"
          label="SMS Alert Mobile Number"
          type="tel"
          placeholder="+1 555 234 5678"
          autoComplete="tel"
          optional
          hint="Used as the default recipient for SMS Alert rule nodes."
          value={values.alertPhone}
          error={errors.alertPhone}
          onChange={handleInputChange}
          onBlur={handleBlur}
        />

        <InputField
          id="password"
          name="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Create a strong password"
          autoComplete="new-password"
          value={values.password}
          error={errors.password}
          onChange={handleInputChange}
          onBlur={handleBlur}
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

        <PasswordStrengthMeter strength={strength} />

        <InputField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm Password"
          type={showConfirmPassword ? 'text' : 'password'}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          value={values.confirmPassword}
          error={errors.confirmPassword}
          onChange={handleInputChange}
          onBlur={handleBlur}
          rightSlot={
            <button
              type="button"
              className="password-toggle"
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              onClick={() => setShowConfirmPassword((prev) => !prev)}
            >
              <EyeIcon visible={showConfirmPassword} />
            </button>
          }
        />

        <div className="terms-group">
          <label className="checkbox-label" htmlFor="acceptedTerms">
            <input
              id="acceptedTerms"
              name="acceptedTerms"
              type="checkbox"
              checked={values.acceptedTerms}
              aria-invalid={Boolean(errors.acceptedTerms)}
              aria-describedby={errors.acceptedTerms ? 'terms-error' : undefined}
              onChange={handleInputChange}
              onBlur={handleBlur}
            />
            <span>
              I agree to the{' '}
              <a href="#terms" onClick={(e) => e.preventDefault()}>
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#privacy" onClick={(e) => e.preventDefault()}>
                Telemetry Data Policy
              </a>
              .
            </span>
          </label>
          {errors.acceptedTerms && (
            <p id="terms-error" className="field-error" role="alert">
              {errors.acceptedTerms}
            </p>
          )}
        </div>

        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Provisioning Workspace...' : 'Create NexusFlow Account'}
        </button>
      </form>

      <div className="form-footer">
        <span>Already have an operator account?</span>{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => onSwitchToLogin && onSwitchToLogin(values.email)}
        >
          Sign in
        </button>
      </div>

      {socialProvider && (
        <SocialAuthModal
          provider={socialProvider}
          rememberMe
          onClose={() => setSocialProvider(null)}
          onSuccess={(result) => {
            setSocialProvider(null);
            const payload = {
              user: result.user,
              provider: socialProvider,
              isNewUser: result.isNewUser,
            };
            if (onAuthSuccess) {
              onAuthSuccess(payload);
            } else {
              setStandaloneSession(payload);
            }
          }}
        />
      )}
    </div>
  );
}
