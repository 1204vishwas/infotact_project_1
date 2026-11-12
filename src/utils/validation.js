const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9\s\-().]{7,20}$/;

export const OPERATOR_ROLES = [
  { value: 'floor_manager', label: 'Factory Floor Manager' },
  { value: 'automation_engineer', label: 'Controls & Automation Engineer' },
  { value: 'iot_architect', label: 'IoT Systems Architect' },
  { value: 'operations_director', label: 'Plant Operations Director' },
];

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'number', label: 'One number', test: (pw) => /\d/.test(pw) },
  { id: 'symbol', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

/**
 * Evaluates password strength across the configured character criteria.
 * Returns a normalized score (0-4), display label, tone key, and per-rule checks.
 */
export function evaluatePasswordStrength(password) {
  const checks = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(password),
  }));

  const score = checks.filter((item) => item.passed).length;

  const levels = [
    { label: 'Too weak', tone: 'weak' },
    { label: 'Weak', tone: 'weak' },
    { label: 'Fair', tone: 'fair' },
    { label: 'Good', tone: 'good' },
    { label: 'Strong', tone: 'strong' },
  ];

  const meta = password ? levels[score] : { label: 'Enter a password', tone: 'idle' };

  return {
    score,
    label: meta.label,
    tone: meta.tone,
    checks,
  };
}

/**
 * Validates a single field of the NexusFlow sign-up form.
 * Returns an error string or an empty string when valid.
 */
export function validateField(name, value, formValues) {
  const trimmed = typeof value === 'string' ? value.trim() : value;

  switch (name) {
    case 'fullName':
      if (!trimmed) return 'Full name is required.';
      if (trimmed.length < 2) return 'Enter at least 2 characters.';
      return '';

    case 'email':
      if (!trimmed) return 'Work email is required.';
      if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid work email address.';
      return '';

    case 'facilityName':
      if (!trimmed) return 'Factory or organization name is required.';
      if (trimmed.length < 2) return 'Enter a valid plant or organization name.';
      return '';

    case 'role':
      if (!OPERATOR_ROLES.some((r) => r.value === trimmed)) {
        return 'Select your operational role.';
      }
      return '';

    case 'alertPhone':
      if (!trimmed) return '';
      if (!PHONE_PATTERN.test(trimmed)) {
        return 'Enter a valid phone number (e.g. +1 555 234 5678).';
      }
      return '';

    case 'password': {
      if (!value) return 'Password is required.';
      const { score } = evaluatePasswordStrength(value);
      if (score < 3 || value.length < 8) {
        return 'Use at least 8 characters and meet 3+ strength criteria.';
      }
      return '';
    }

    case 'confirmPassword':
      if (!value) return 'Please confirm your password.';
      if (value !== formValues.password) return 'Passwords do not match.';
      return '';

    case 'acceptedTerms':
      if (!value) return 'Accept the terms to create your NexusFlow workspace.';
      return '';

    default:
      return '';
  }
}

/**
 * Validates all fields in the sign-up form and returns a field-to-error map.
 */
export function validateSignUpForm(formValues) {
  const errors = {};
  Object.keys(formValues).forEach((fieldName) => {
    const error = validateField(fieldName, formValues[fieldName], formValues);
    if (error) {
      errors[fieldName] = error;
    }
  });
  return errors;
}
