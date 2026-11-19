import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'nexusflow.token';
const USER_KEY = 'nexusflow.user';
const LOCAL_USERS_KEY = 'nexusflow.local_users_v2';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function getLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalUsers(users) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
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

    // Preserve offline, demo, guest, and local session tokens without wiping on network outage
    const isLocalSession =
      token === 'guest-token' ||
      token === 'demo-token' ||
      token.startsWith('local-') ||
      token.startsWith('google-') ||
      token.startsWith('facebook-');

    if (isLocalSession) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          if (!cancelled) persist(null, null);
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.user) {
            setUser(json.user);
            localStorage.setItem(USER_KEY, JSON.stringify(json.user));
          }
        }
      } catch {
        // Network outage or server offline: keep stored user profile in local mode
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, persist]);

  const login = useCallback(
    async (email, password) => {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const rawPassword = String(password || '');

      // 1. Try remote backend API first
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: rawPassword }),
        });

        const json = await res.json().catch(() => ({}));
        if (res.ok && json.token && json.user) {
          const fullUser = { ...json.user, provider: json.user.provider || 'email' };
          persist(json.token, fullUser);
          return fullUser;
        }

        // If server explicitly returned an auth error (400 or 401)
        if (res.status === 400 || res.status === 401) {
          // Check if user was registered in local offline database instead
          const localUsers = getLocalUsers();
          const localMatch = localUsers.find((u) => u.email === cleanEmail);
          if (localMatch && localMatch.password === rawPassword) {
            const localUser = {
              id: localMatch.id,
              name: localMatch.name,
              email: localMatch.email,
              provider: localMatch.provider || 'email',
              isOffline: true,
            };
            persist(`local-token-${Date.now()}`, localUser);
            return localUser;
          }
          throw new Error(json.error || 'Invalid email or password');
        }

        throw new Error('BACKEND_UNAVAILABLE');
      } catch (err) {
        // If the error was a real credential rejection, rethrow it
        if (err.message === 'Invalid email or password') {
          throw err;
        }

        // 2. Resilient Offline Fallback (never block the user if backend is down)
        const localUsers = getLocalUsers();
        const existing = localUsers.find((u) => u.email === cleanEmail);

        if (existing) {
          if (existing.password && existing.password !== rawPassword) {
            throw new Error('Incorrect password for this account. Please try again.');
          }
          const localUser = {
            id: existing.id,
            name: existing.name,
            email: existing.email,
            provider: existing.provider || 'email',
            isOffline: true,
          };
          persist(`local-token-${Date.now()}`, localUser);
          return localUser;
        }

        // If not in local store and backend is unreachable, provision a local session
        const namePart = cleanEmail.split('@')[0] || 'Operator';
        const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        const newLocalUser = {
          id: `usr_loc_${Date.now().toString(36)}`,
          name: displayName,
          email: cleanEmail,
          password: rawPassword,
          provider: 'email',
          isOffline: true,
        };
        localUsers.push(newLocalUser);
        saveLocalUsers(localUsers);

        const sessionUser = {
          id: newLocalUser.id,
          name: newLocalUser.name,
          email: newLocalUser.email,
          provider: 'email',
          isOffline: true,
        };
        persist(`local-token-${Date.now()}`, sessionUser);
        return sessionUser;
      }
    },
    [persist]
  );

  const register = useCallback(
    async (name, email, password) => {
      const cleanName = String(name || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const rawPassword = String(password || '');

      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cleanName, email: cleanEmail, password: rawPassword }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.token && json.user) {
          const fullUser = { ...json.user, provider: 'email' };
          persist(json.token, fullUser);
          return fullUser;
        }
        if (res.status === 400 || res.status === 409) {
          throw new Error(json.error || 'Registration failed');
        }
        throw new Error('BACKEND_UNAVAILABLE');
      } catch (err) {
        if (err.message && (err.message.includes('already exists') || err.message.includes('required'))) {
          throw err;
        }

        // Offline / Local registration
        const localUsers = getLocalUsers();
        if (localUsers.some((u) => u.email === cleanEmail)) {
          throw new Error('An account with this email already exists locally. Please sign in.');
        }

        const newLocalUser = {
          id: `usr_loc_${Date.now().toString(36)}`,
          name: cleanName || cleanEmail.split('@')[0],
          email: cleanEmail,
          password: rawPassword,
          provider: 'email',
          isOffline: true,
        };
        localUsers.push(newLocalUser);
        saveLocalUsers(localUsers);

        const sessionUser = {
          id: newLocalUser.id,
          name: newLocalUser.name,
          email: newLocalUser.email,
          provider: 'email',
          isOffline: true,
        };
        persist(`local-token-${Date.now()}`, sessionUser);
        return sessionUser;
      }
    },
    [persist]
  );

  const loginWithSocial = useCallback(
    async (provider, profile = {}) => {
      const defaultEmail = profile.email || (provider === 'google' ? 'operator@gmail.com' : 'operator@facebook.com');
      const defaultName = profile.name || (provider === 'google' ? 'Google Operator' : 'Facebook Operator');
      const cleanEmail = defaultEmail.trim().toLowerCase();

      // 1. Try remote backend social endpoint
      try {
        const res = await fetch(`${API_BASE}/api/auth/social`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            email: cleanEmail,
            name: defaultName,
            avatar: profile.avatar || null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.token && json.user) {
          const fullUser = { ...json.user, provider };
          persist(json.token, fullUser);
          return fullUser;
        }
      } catch {}

      // 2. Resilient Offline Social Login Session
      const localUsers = getLocalUsers();
      let existing = localUsers.find((u) => u.email === cleanEmail);
      if (!existing) {
        existing = {
          id: `usr_${provider}_${Date.now().toString(36)}`,
          name: defaultName,
          email: cleanEmail,
          provider,
          avatar: profile.avatar || null,
          isOffline: true,
        };
        localUsers.push(existing);
        saveLocalUsers(localUsers);
      }

      const socialUser = {
        id: existing.id,
        name: existing.name || defaultName,
        email: existing.email,
        provider,
        avatar: profile.avatar || existing.avatar || null,
        isOffline: true,
      };
      persist(`${provider}-token-${Date.now()}`, socialUser);
      return socialUser;
    },
    [persist]
  );

  const loginWithGoogle = useCallback(
    (profile) => loginWithSocial('google', profile),
    [loginWithSocial]
  );

  const loginWithFacebook = useCallback(
    (profile) => loginWithSocial('facebook', profile),
    [loginWithSocial]
  );

  const demoLogin = useCallback(() => {
    const demoUser = {
      id: 'usr_demo_operator',
      name: 'Demo Floor Manager',
      email: 'demo.operator@nexusflow.io',
      provider: 'demo',
      isOffline: true,
    };
    persist('demo-token', demoUser);
    return demoUser;
  }, [persist]);

  const guestLogin = useCallback(() => {
    const guestUser = {
      id: 'guest-operator',
      name: 'Guest Operator',
      email: 'operator@nexusflow.local',
      provider: 'guest',
      isOffline: true,
    };
    persist('guest-token', guestUser);
    return guestUser;
  }, [persist]);

  const logout = useCallback(() => persist(null, null), [persist]);

  const authFetch = useCallback(
    (path, options = {}) => {
      const headers = { ...(options.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      return fetch(`${API_BASE}${path}`, { ...options, headers });
    },
    [token]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      loginWithGoogle,
      loginWithFacebook,
      demoLogin,
      guestLogin,
      logout,
      authFetch,
    }),
    [
      user,
      token,
      loading,
      login,
      register,
      loginWithGoogle,
      loginWithFacebook,
      demoLogin,
      guestLogin,
      logout,
      authFetch,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
