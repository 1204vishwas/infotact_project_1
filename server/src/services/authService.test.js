import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, signToken, verifyPassword, verifyToken } from './authService.js';

test('hashes a password with a random salt and verifies it', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');

  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('correct horse battery staple', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

test('rejects malformed password hashes', async () => {
  assert.equal(await verifyPassword('anything', ''), false);
  assert.equal(await verifyPassword('anything', 'plaintext-hash'), false);
  assert.equal(await verifyPassword('anything', 'bcrypt$salt$hash'), false);
});

test('signs and verifies a session token', () => {
  const token = signToken({ _id: '507f1f77bcf86cd799439011', email: 'manager@example.com', name: 'Manager' });
  const payload = verifyToken(token);

  assert.equal(payload.id, '507f1f77bcf86cd799439011');
  assert.equal(payload.email, 'manager@example.com');
  assert.equal(payload.name, 'Manager');
});

test('rejects missing and tampered tokens', () => {
  assert.equal(verifyToken(null), null);
  assert.equal(verifyToken('not-a-jwt'), null);

  const token = signToken({ _id: '507f1f77bcf86cd799439011', email: 'manager@example.com', name: 'Manager' });
  assert.equal(verifyToken(`${token}x`), null);
});
