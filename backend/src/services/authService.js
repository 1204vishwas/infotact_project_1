import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

/**
 * Password hashing uses Node's built-in scrypt, so no native build step is
 * required. Stored format: `scrypt$<salt-hex>$<derived-key-hex>`.
 */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const derived = await scrypt(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

export function signToken(user) {
  const id = String(user._id ?? user.id);
  return jwt.sign(
    { sub: id, email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload || typeof payload !== 'object' || !payload.sub) return null;
    return {
      id: String(payload.sub),
      email: payload.email || null,
      name: payload.name || null,
    };
  } catch {
    return null;
  }
}

export function publicUser(user) {
  return {
    id: String(user._id ?? user.id),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt || null,
  };
}
