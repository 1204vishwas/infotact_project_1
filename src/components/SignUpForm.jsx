import { useMemo, useState } from 'react';
import {
  OPERATOR_ROLES,
  evaluatePasswordStrength,
  validateField,
  validateSignUpForm,
} from '../utils/validation';

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

function EyeIcon({ visible }) {
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

function InputField({
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

/**
 * NexusFlow operator account sign-up form with client-side validation,
 * password strength evaluation, and workspace provisioning preview.
 */
export function SignUpForm() {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAccount, setSubmittedAccount] = useState(null);
  const [signInNotice, setSignInNotice] = useState(false);

  const strength = useMemo(() => evaluatePasswordStrength(values.password), [values.password]);

  const updateField = (name, nextValue) => {
    const nextValues = { ...values, [name]: nextValue };
    setValues(nextValues);

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

  const handleSubmit = (event) => {
    event.preventDefault();

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
    window.setTimeout(() => {
      const roleObj = OPERATOR_ROLES.find((item) => item.value === values.role);
      const slug = values.facilityName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18);

      setSubmittedAccount({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        facilityName: values.facilityName.trim(),
        roleLabel: roleObj ? roleObj.label : values.role,
        alertPhone: values.alertPhone.trim(),
        workspaceId: `nf-${slug || 'plant'}-${Math.floor(1000 + Math.random() * 9000)}`,
      });
      setIsSubmitting(false);
    }, 650);
  };

  const handleReset = () => {
    setValues(INITIAL_VALUES);
    setErrors({});
    setTouched({});
    setSubmittedAccount(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  if (submittedAccount) {
    return (
      <div className="signup-card success-card" role="status" aria-live="polite">
        <div className="success-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="form-title">Workspace account created</h2>
        <p className="form-subtitle">
          Operator credentials for <strong>{submittedAccount.facilityName}</strong> are ready for
          NexusFlow telemetry rule authoring.
        </p>

        <dl className="summary-grid">
          <div className="summary-row">
            <dt>Operator</dt>
            <dd>{submittedAccount.fullName}</dd>
          </div>
          <div className="summary-row">
            <dt>Work Email</dt>
            <dd>{submittedAccount.email}</dd>
          </div>
          <div className="summary-row">
            <dt>Role</dt>
            <dd>{submittedAccount.roleLabel}</dd>
          </div>
          <div className="summary-row">
            <dt>Workspace ID</dt>
            <dd className="mono-value">{submittedAccount.workspaceId}</dd>
          </div>
          {submittedAccount.alertPhone && (
            <div className="summary-row">
              <dt>SMS Alert Target</dt>
              <dd className="mono-value">{submittedAccount.alertPhone}</dd>
            </div>
          )}
        </dl>

        <button type="button" className="btn-secondary" onClick={handleReset}>
          Register another operator
        </button>
      </div>
    );
  }

  return (
    <div className="signup-card">
      <div className="form-header">
        <h1 className="form-title">Create your NexusFlow account</h1>
        <p className="form-subtitle">
          Set up operator access to design real-time sensor pipelines and anomaly alerts.
        </p>
      </div>

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
            label="Work Email"
            type="email"
            placeholder="alex@apexplant.io"
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
          onClick={() => setSignInNotice((prev) => !prev)}
        >
          Sign in
        </button>
        {signInNotice && (
          <p className="signin-notice" role="status">
            This build includes the NexusFlow Sign Up page only.
          </p>
        )}
      </div>
    </div>
  );
}
