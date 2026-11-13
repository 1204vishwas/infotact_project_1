import { OPERATOR_ROLES } from './validation.js';

const ACCOUNTS_STORAGE_KEY = 'nexusflow_accounts_v1';
const SESSION_STORAGE_KEY = 'nexusflow_session_v1';

const memoryStorage = {
  local: new Map(),
  session: new Map(),
};

function getStorageArea(kind) {
  if (typeof window !== 'undefined') {
    try {
      const storage = kind === 'session' ? window.sessionStorage : window.localStorage;
      const probe = '__nf_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      // Fallback to memory map when storage is blocked or unavailable.
    }
  }

  const map = kind === 'session' ? memoryStorage.session : memoryStorage.local;
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function generateSalt() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compact pure-JS SHA-256 fallback for environments where Web Crypto subtle is unavailable.
 */
function sha256Fallback(message) {
  const bytes = new TextEncoder().encode(message);
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bitLen = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLen >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLen / 0x100000000), false);

  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

async function digestHex(input) {
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(input);
}

export async function hashPassword(password, salt = generateSalt()) {
  const hash = await digestHex(`${salt}:${password}`);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expected] = storedHash.split(':');
  const computed = await digestHex(`${salt}:${password}`);
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i += 1) {
    diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function buildWorkspaceId(facilityName) {
  const slug = (facilityName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18);
  return `nf-${slug || 'plant'}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function resolveRoleLabel(roleValue) {
  const found = OPERATOR_ROLES.find((item) => item.value === roleValue);
  return found ? found.label : roleValue || 'Factory Floor Manager';
}

function loadAccounts() {
  const storage = getStorageArea('local');
  const list = readJson(storage, ACCOUNTS_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveAccounts(accounts) {
  const storage = getStorageArea('local');
  writeJson(storage, ACCOUNTS_STORAGE_KEY, accounts);
}

function sanitizeAccount(account) {
  if (!account) return null;
  const { passwordHash: _omitted, ...safeFields } = account;
  return {
    ...safeFields,
    roleLabel: resolveRoleLabel(account.role),
    providers: Array.isArray(account.providers) ? account.providers : [],
  };
}

function persistSession(account, provider, rememberMe = true) {
  const local = getStorageArea('local');
  const session = getStorageArea('session');

  local.removeItem(SESSION_STORAGE_KEY);
  session.removeItem(SESSION_STORAGE_KEY);

  const payload = {
    email: account.email,
    provider,
    signedInAt: new Date().toISOString(),
    user: sanitizeAccount(account),
  };

  writeJson(rememberMe ? local : session, SESSION_STORAGE_KEY, payload);
  return payload;
}

export function formatProviderName(provider) {
  if (provider === 'google') return 'Google';
  if (provider === 'facebook') return 'Facebook';
  return 'Email & Password';
}

/**
 * Registers a new operator account with email/Gmail and password, or attaches
 * password credentials to an existing social-only account.
 */
export async function registerWithEmail({
  fullName,
  email,
  facilityName,
  role = 'floor_manager',
  alertPhone = '',
  password,
}) {
  const normalizedEmail = normalizeEmail(email);
  const accounts = loadAccounts();
  const existingIndex = accounts.findIndex((item) => normalizeEmail(item.email) === normalizedEmail);

  if (existingIndex !== -1) {
    const existing = accounts[existingIndex];
    const hasPassword = Boolean(existing.passwordHash) || existing.providers?.includes('password');
    if (hasPassword) {
      return {
        ok: false,
        code: 'EMAIL_EXISTS',
        error: 'An account with this email already exists. Please sign in instead.',
      };
    }

    const passwordHash = await hashPassword(password);
    const nextFacility = facilityName.trim() || existing.facilityName;
    const updated = {
      ...existing,
      fullName: fullName.trim() || existing.fullName,
      facilityName: nextFacility,
      role,
      alertPhone: alertPhone.trim(),
      passwordHash,
      providers: Array.from(new Set([...(existing.providers || []), 'password'])),
      lastProvider: 'password',
      lastLoginAt: new Date().toISOString(),
    };
    accounts[existingIndex] = updated;
    saveAccounts(accounts);
    const session = persistSession(updated, 'password', true);
    return { ok: true, user: session.user, isNewUser: false };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const newAccount = {
    id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    fullName: fullName.trim(),
    email: normalizedEmail,
    facilityName: facilityName.trim(),
    role,
    alertPhone: alertPhone.trim(),
    workspaceId: buildWorkspaceId(facilityName),
    passwordHash,
    providers: ['password'],
    lastProvider: 'password',
    createdAt: now,
    lastLoginAt: now,
  };

  accounts.push(newAccount);
  saveAccounts(accounts);
  const session = persistSession(newAccount, 'password', true);
  return { ok: true, user: session.user, isNewUser: true };
}

/**
 * Authenticates an existing operator using their email/Gmail and password.
 */
export async function loginWithEmail({ email, password, rememberMe = true }) {
  const normalizedEmail = normalizeEmail(email);
  const accounts = loadAccounts();
  const existingIndex = accounts.findIndex((item) => normalizeEmail(item.email) === normalizedEmail);

  if (existingIndex === -1) {
    return {
      ok: false,
      code: 'ACCOUNT_NOT_FOUND',
      error: 'No account found with this email. Create an account or continue with Google or Facebook.',
    };
  }

  const account = accounts[existingIndex];
  if (!account.passwordHash) {
    const providerList = (account.providers || []).map(formatProviderName).join(' or ');
    return {
      ok: false,
      code: 'SOCIAL_ONLY',
      providers: account.providers || [],
      error: `This account uses ${providerList || 'social'} sign-in. Use ${providerList || 'Google/Facebook'} above, or reset password to set one.`,
    };
  }

  const matches = await verifyPassword(password, account.passwordHash);
  if (!matches) {
    return {
      ok: false,
      code: 'INVALID_PASSWORD',
      error: 'Incorrect password. Please check your password and try again.',
    };
  }

  const updated = {
    ...account,
    lastProvider: 'password',
    lastLoginAt: new Date().toISOString(),
  };
  accounts[existingIndex] = updated;
  saveAccounts(accounts);

  const session = persistSession(updated, 'password', rememberMe);
  return { ok: true, user: session.user };
}

/**
 * Authenticates or provisions an account via Google or Facebook sign-in.
 */
export function loginWithSocial({ provider, email, fullName, rememberMe = true }) {
  if (provider !== 'google' && provider !== 'facebook') {
    return { ok: false, code: 'INVALID_PROVIDER', error: 'Unsupported OAuth provider.' };
  }

  const normalizedEmail = normalizeEmail(email);
  const accounts = loadAccounts();
  const existingIndex = accounts.findIndex((item) => normalizeEmail(item.email) === normalizedEmail);
  const now = new Date().toISOString();

  if (existingIndex !== -1) {
    const existing = accounts[existingIndex];
    const updated = {
      ...existing,
      fullName: existing.fullName || fullName.trim(),
      providers: Array.from(new Set([...(existing.providers || []), provider])),
      lastProvider: provider,
      lastLoginAt: now,
    };
    accounts[existingIndex] = updated;
    saveAccounts(accounts);
    const session = persistSession(updated, provider, rememberMe);
    return { ok: true, user: session.user, isNewUser: false };
  }

  const cleanName = fullName.trim();
  const defaultFacility = `${cleanName.split(' ')[0] || 'Operator'} Telemetry Lab`;
  const newAccount = {
    id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    fullName: cleanName,
    email: normalizedEmail,
    facilityName: defaultFacility,
    role: 'floor_manager',
    alertPhone: '',
    workspaceId: buildWorkspaceId(defaultFacility),
    passwordHash: null,
    providers: [provider],
    lastProvider: provider,
    createdAt: now,
    lastLoginAt: now,
  };

  accounts.push(newAccount);
  saveAccounts(accounts);
  const session = persistSession(newAccount, provider, rememberMe);
  return { ok: true, user: session.user, isNewUser: true };
}

/**
 * Sets or replaces the password for an existing registered email address.
 */
export async function resetPassword({ email, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  const accounts = loadAccounts();
  const existingIndex = accounts.findIndex((item) => normalizeEmail(item.email) === normalizedEmail);

  if (existingIndex === -1) {
    return {
      ok: false,
      code: 'ACCOUNT_NOT_FOUND',
      error: 'No account found with this email address.',
    };
  }

  const passwordHash = await hashPassword(newPassword);
  const existing = accounts[existingIndex];
  accounts[existingIndex] = {
    ...existing,
    passwordHash,
    providers: Array.from(new Set([...(existing.providers || []), 'password'])),
  };
  saveAccounts(accounts);

  return { ok: true };
}

/**
 * Returns saved accounts previously linked to the specified social provider.
 */
export function getSavedAccountsByProvider(provider) {
  return loadAccounts()
    .filter((account) => Array.isArray(account.providers) && account.providers.includes(provider))
    .map(sanitizeAccount);
}

/**
 * Restores the active authenticated session if present in sessionStorage or localStorage.
 */
export function getCurrentSession() {
  const sessionStore = getStorageArea('session');
  const localStore = getStorageArea('local');
  const active = readJson(sessionStore, SESSION_STORAGE_KEY, null)
    || readJson(localStore, SESSION_STORAGE_KEY, null);

  if (!active || !active.email) return null;

  const accounts = loadAccounts();
  const matched = accounts.find((item) => normalizeEmail(item.email) === normalizeEmail(active.email));

  return {
    provider: active.provider || matched?.lastProvider || 'password',
    signedInAt: active.signedInAt,
    user: matched ? sanitizeAccount(matched) : active.user,
  };
}

/**
 * Clears the active operator session while keeping saved accounts intact.
 */
export function signOut() {
  getStorageArea('local').removeItem(SESSION_STORAGE_KEY);
  getStorageArea('session').removeItem(SESSION_STORAGE_KEY);
}

/**
 * Clears all stored accounts and active sessions (for testing).
 */
export function clearAuthStore() {
  getStorageArea('local').removeItem(ACCOUNTS_STORAGE_KEY);
  getStorageArea('local').removeItem(SESSION_STORAGE_KEY);
  getStorageArea('session').removeItem(SESSION_STORAGE_KEY);
}
