import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setAccessToken } from '../api/client.js';

const ACCESS_KEY = 'agriscan_access';
const REFRESH_KEY = 'agriscan_refresh';
const USER_KEY = 'agriscan_user';
const LAST_ACTIVE_KEY = 'agriscan_last_active';
const REMEMBER_UNTIL_KEY = 'agriscan_remember_until';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000;

const AuthContext = createContext(null);

function loadJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function decodeTokenPayload(token) {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + 5000;
}

function isAuthPath(pathname) {
  return pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname.startsWith('/mfa');
}

function getRememberUntil() {
  return Number(localStorage.getItem(REMEMBER_UNTIL_KEY) || 0);
}

function hasActiveRememberedSession() {
  const rememberUntil = getRememberUntil();
  return Boolean(localStorage.getItem(REFRESH_KEY) && rememberUntil && rememberUntil > Date.now());
}

export function AuthProvider({ children }) {
  const [accessToken, setTokenState] = useState(() => localStorage.getItem(ACCESS_KEY));
  const [refreshToken, setRefreshTokenState] = useState(() => localStorage.getItem(REFRESH_KEY));
  const [user, setUser] = useState(() => loadJson(USER_KEY));
  const [sessionReady, setSessionReady] = useState(false);
  const refreshPromiseRef = useRef(null);
  const sessionVersionRef = useRef(0);

  useEffect(() => {
    setAccessToken(accessToken);
  }, [accessToken]);

  const persistSession = useCallback((data) => {
    if (data.access_token) {
      localStorage.setItem(ACCESS_KEY, data.access_token);
      setTokenState(data.access_token);
    }
    if (data.refresh_token) {
      localStorage.setItem(REFRESH_KEY, data.refresh_token);
      setRefreshTokenState(data.refresh_token);
    }
    if (data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
    }
    if (data.remember_me === true) {
      localStorage.setItem(REMEMBER_UNTIL_KEY, String(Date.now() + REMEMBER_ME_MS));
    } else if (data.remember_me === false) {
      localStorage.removeItem(REMEMBER_UNTIL_KEY);
    }
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  }, []);

  const clearSession = useCallback(() => {
    sessionVersionRef.current += 1;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LAST_ACTIVE_KEY);
    localStorage.removeItem(REMEMBER_UNTIL_KEY);
    setTokenState(null);
    setRefreshTokenState(null);
    setUser(null);
    setAccessToken(null);
  }, []);

  const login = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/login', payload);
      if (data.status === 'ok') {
        persistSession(data);
      }
      return data;
    },
    [persistSession]
  );

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data;
  }, []);

  const verifyMfa = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/mfa/verify', payload);
      if (data.status === 'ok') {
        persistSession(data);
      }
      return data;
    },
    [persistSession]
  );

  const saveTokensFromMfaSetup = useCallback(
    (data) => {
      persistSession(data);
    },
    [persistSession]
  );

  const logout = useCallback(async () => {
    const token = localStorage.getItem(REFRESH_KEY);
    try {
      if (token) {
        await api.post('/auth/logout', { refresh_token: token });
      }
    } catch {
      // Local logout must still complete if the network or token revocation fails.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshSession = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const token = localStorage.getItem(REFRESH_KEY);
    if (!token) {
      throw new Error('No refresh token available');
    }
    const refreshSessionVersion = sessionVersionRef.current;

    refreshPromiseRef.current = api
      .post('/auth/refresh', { refresh_token: token })
      .then(async ({ data }) => {
        if (sessionVersionRef.current !== refreshSessionVersion) {
          throw new Error('Session changed during refresh');
        }
        let sessionUser = user;
        if (!sessionUser && data.access_token) {
          setAccessToken(data.access_token);
          const meResponse = await api.get('/auth/me');
          sessionUser = meResponse.data;
        }
        if (sessionVersionRef.current !== refreshSessionVersion) {
          throw new Error('Session changed during refresh');
        }
        persistSession({ ...data, user: sessionUser });
        return data.access_token;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    return refreshPromiseRef.current;
  }, [persistSession, user]);

  const restoreRememberedSession = useCallback(async () => {
    if (!hasActiveRememberedSession()) {
      return false;
    }
    try {
      await refreshSession();
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [clearSession, refreshSession]);

  useEffect(() => {
    let active = true;

    async function bootstrapSession() {
      const storedAccessToken = localStorage.getItem(ACCESS_KEY);
      const storedRefreshToken = localStorage.getItem(REFRESH_KEY);
      const rememberUntil = getRememberUntil();

      if (!storedRefreshToken) {
        if (active) {
          setSessionReady(true);
        }
        return;
      }

      if (rememberUntil && rememberUntil <= Date.now()) {
        clearSession();
        if (active) {
          setSessionReady(true);
        }
        return;
      }

      if (storedAccessToken && !isTokenExpired(storedAccessToken)) {
        if (active) {
          setSessionReady(true);
        }
        return;
      }

      try {
        await refreshSession();
      } catch {
        clearSession();
      } finally {
        if (active) {
          setSessionReady(true);
        }
      }
    }

    bootstrapSession();

    return () => {
      active = false;
    };
  }, [clearSession, refreshSession]);

  useEffect(() => {
    const requestId = api.interceptors.request.use((config) => {
      localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      return config;
    });
    const responseId = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && refreshToken && !original?._retry && !original?.url?.includes('/auth/')) {
          original._retry = true;
          try {
            const newToken = await refreshSession();
            original.headers = {
              ...original.headers,
              Authorization: `Bearer ${newToken}`,
            };
            return api(original);
          } catch (refreshError) {
            clearSession();
            if (typeof window !== 'undefined' && !isAuthPath(window.location.pathname)) {
              window.location.replace('/login');
            }
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );
    return () => {
      api.interceptors.request.eject(requestId);
      api.interceptors.response.eject(responseId);
    };
  }, [clearSession, refreshSession, refreshToken]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const rememberUntil = getRememberUntil();
      if (rememberUntil > Date.now()) {
        return;
      }
      if (rememberUntil && rememberUntil <= Date.now()) {
        clearSession();
        return;
      }
      const lastActive = Number(localStorage.getItem(LAST_ACTIVE_KEY) || Date.now());
      if (accessToken && Date.now() - lastActive > SESSION_TIMEOUT_MS) {
        clearSession();
      }
    }, 30000);
    return () => window.clearInterval(interval);
  }, [accessToken, clearSession]);

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      user,
      sessionReady,
      isAuthenticated: Boolean(accessToken && user),
      login,
      register,
      verifyMfa,
      saveTokensFromMfaSetup,
      logout,
      clearSession,
      restoreRememberedSession,
      hasRememberedSession: hasActiveRememberedSession,
    }),
    [
      accessToken,
      refreshToken,
      user,
      sessionReady,
      login,
      register,
      verifyMfa,
      saveTokensFromMfaSetup,
      logout,
      clearSession,
      restoreRememberedSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
