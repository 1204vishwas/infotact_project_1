import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAuthStore,
  getCurrentSession,
  getSavedAccountsByProvider,
  loginWithEmail,
  loginWithSocial,
  registerWithEmail,
  resetPassword,
  signOut,
} from './auth.js';

describe('auth service', () => {
  beforeEach(() => {
    clearAuthStore();
  });

  it('registers a user with Gmail and password and logs them back in', async () => {
    const reg = await registerWithEmail({
      fullName: 'Priya Sharma',
      email: 'Priya.Sharma@gmail.com',
      facilityName: 'Solar Grid Plant #2',
      role: 'automation_engineer',
      alertPhone: '+1 555 901 2233',
      password: 'Password1!',
    });

    assert.equal(reg.ok, true);
    assert.equal(reg.isNewUser, true);
    assert.equal(reg.user.email, 'priya.sharma@gmail.com');
    assert.equal('passwordHash' in reg.user, false);

    const active = getCurrentSession();
    assert.equal(active.provider, 'password');
    assert.equal(active.user.email, 'priya.sharma@gmail.com');

    signOut();
    assert.equal(getCurrentSession(), null);

    const wrongLogin = await loginWithEmail({
      email: 'priya.sharma@gmail.com',
      password: 'WrongPassword1!',
    });
    assert.equal(wrongLogin.ok, false);
    assert.equal(wrongLogin.code, 'INVALID_PASSWORD');

    const okLogin = await loginWithEmail({
      email: 'priya.sharma@gmail.com',
      password: 'Password1!',
    });
    assert.equal(okLogin.ok, true);
    assert.equal(okLogin.user.fullName, 'Priya Sharma');
  });

  it('rejects duplicate email registration with password', async () => {
    await registerWithEmail({
      fullName: 'Alex Rivera',
      email: 'alex@gmail.com',
      facilityName: 'Plant A',
      role: 'floor_manager',
      password: 'Password1!',
    });

    const dup = await registerWithEmail({
      fullName: 'Alex Rivera',
      email: 'alex@gmail.com',
      facilityName: 'Plant B',
      role: 'floor_manager',
      password: 'Password2!',
    });

    assert.equal(dup.ok, false);
    assert.equal(dup.code, 'EMAIL_EXISTS');
  });

  it('returns ACCOUNT_NOT_FOUND for unknown email on login', async () => {
    const res = await loginWithEmail({
      email: 'missing@gmail.com',
      password: 'Password1!',
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ACCOUNT_NOT_FOUND');
  });

  it('supports Google and Facebook login, linking providers to existing emails', async () => {
    const googleRes = loginWithSocial({
      provider: 'google',
      email: 'sam.operator@gmail.com',
      fullName: 'Sam Operator',
    });
    assert.equal(googleRes.ok, true);
    assert.equal(googleRes.isNewUser, true);
    assert.deepEqual(googleRes.user.providers, ['google']);

    const savedGoogle = getSavedAccountsByProvider('google');
    assert.equal(savedGoogle.length, 1);
    assert.equal(savedGoogle[0].email, 'sam.operator@gmail.com');

    const socialOnlyLogin = await loginWithEmail({
      email: 'sam.operator@gmail.com',
      password: 'AnyPassword1!',
    });
    assert.equal(socialOnlyLogin.ok, false);
    assert.equal(socialOnlyLogin.code, 'SOCIAL_ONLY');

    const fbRes = loginWithSocial({
      provider: 'facebook',
      email: 'sam.operator@gmail.com',
      fullName: 'Sam Operator',
    });
    assert.equal(fbRes.ok, true);
    assert.equal(fbRes.isNewUser, false);
    assert.deepEqual(fbRes.user.providers, ['google', 'facebook']);
  });

  it('resets password for an existing account and enables email login', async () => {
    loginWithSocial({
      provider: 'facebook',
      email: 'jordan@gmail.com',
      fullName: 'Jordan Lee',
    });
    signOut();

    const reset = await resetPassword({
      email: 'jordan@gmail.com',
      newPassword: 'NewStrong1!',
    });
    assert.equal(reset.ok, true);

    const login = await loginWithEmail({
      email: 'jordan@gmail.com',
      password: 'NewStrong1!',
    });
    assert.equal(login.ok, true);
    assert.deepEqual(login.user.providers, ['facebook', 'password']);
  });
});
