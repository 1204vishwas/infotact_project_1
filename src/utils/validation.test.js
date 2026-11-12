import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePasswordStrength,
  validateField,
  validateSignUpForm,
} from './validation.js';

describe('evaluatePasswordStrength', () => {
  it('returns idle state for empty password', () => {
    const result = evaluatePasswordStrength('');
    assert.equal(result.score, 0);
    assert.equal(result.tone, 'idle');
  });

  it('scores strong password with all 4 criteria', () => {
    const result = evaluatePasswordStrength('Turbine#2026');
    assert.equal(result.score, 4);
    assert.equal(result.label, 'Strong');
    assert.equal(result.tone, 'strong');
  });
});

describe('validateSignUpForm', () => {
  const validForm = {
    fullName: 'Alex Rivera',
    email: 'alex@apexplant.io',
    facilityName: 'Apex Turbine Plant #4',
    role: 'floor_manager',
    alertPhone: '+1 555 234 5678',
    password: 'Password1!',
    confirmPassword: 'Password1!',
    acceptedTerms: true,
  };

  it('passes with valid operator details', () => {
    assert.deepEqual(validateSignUpForm(validForm), {});
  });

  it('allows blank optional alertPhone', () => {
    const errors = validateSignUpForm({ ...validForm, alertPhone: '' });
    assert.deepEqual(errors, {});
  });

  it('rejects mismatched confirmation password and unchecked terms', () => {
    const errors = validateSignUpForm({
      ...validForm,
      confirmPassword: 'Different1!',
      acceptedTerms: false,
    });
    assert.equal(errors.confirmPassword, 'Passwords do not match.');
    assert.ok(errors.acceptedTerms);
  });

  it('validates invalid phone when provided', () => {
    const error = validateField('alertPhone', 'abc', validForm);
    assert.ok(error);
  });
});
