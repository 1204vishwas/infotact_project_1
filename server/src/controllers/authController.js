import { User } from '../models/User.js';
import {
  hashPassword,
  publicUser,
  signToken,
  verifyPassword,
} from '../services/authService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration({ name, email, password }) {
  const errors = [];
  if (!name || name.length < 2) errors.push('Name must be at least 2 characters');
  if (!EMAIL_PATTERN.test(email)) errors.push('A valid email address is required');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
  return errors;
}

export async function register(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const errors = validateRegistration({ name, email, password });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: await hashPassword(password),
    });

    return res.status(201).json({
      ok: true,
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    return res.status(500).json({ error: 'Failed to create account', detail: error.message });
  }
}

export async function login(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({
      ok: true,
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to sign in', detail: error.message });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load account', detail: error.message });
  }
}
