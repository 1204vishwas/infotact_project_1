import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'nexusflow.token';
const USER_KEY = 'nexusflow.user';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const persist = useCallback((nextToken, nextUser) => {
    if (nextToken && nextUser) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    setToken(nextToken || null);
    setUser(nextUser || null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Only an explicit auth rejection invalidates the stored session. A
        // network error or a 5xx must not sign the user out on a flaky link.
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) persist(null, null);
          return;
        }
        if (!res.ok) return;

        const json = await res.json();
        if (!cancelled && json.user) {
          setUser(json.user);
          localStorage.setItem(USER_KEY, JSON.stringify(json.user));
        }
      } catch {
        // Keep the cached user so a transient outage does not destroy the session.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, persist]);

  const authenticate = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || json.detail || 'Request failed');
    }
    persist(json.token, json.user);
    return json.user;
  }, [persist]);

  const login = useCallback(
    (email, password) => authenticate('/api/auth/login', { email, password }),
    [authenticate]
  );

  const register = useCallback(
    (name, email, password) => authenticate('/api/auth/register', { name, email, password }),
    [authenticate]
  );

  const logout = useCallback(() => persist(null, null), [persist]);

  const authFetch = useCallback((path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, authFetch }),
    [user, token, loading, login, register, logout, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
