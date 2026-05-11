import { getApiBaseUrl } from '../api/client.js';

const MAX_REALTIME_RETRIES = 4;
const TOKEN_EXPIRY_GRACE_MS = 15000;
const REALTIME_ALERTS_ENABLED = import.meta.env.VITE_ENABLE_REALTIME_ALERTS === 'true';

function realtimeUrl(token) {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  const url = baseUrl.startsWith('http')
    ? new URL(`${baseUrl}/notifications/stream`)
    : new URL(`${baseUrl}/notifications/stream`, window.location.origin);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url;
}

function decodeTokenPayload(token) {
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

function isTokenExpiredOrClose(token) {
  const payload = decodeTokenPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + TOKEN_EXPIRY_GRACE_MS;
}

export function connectRealtimeAlertStream({ token, onSignal }) {
  if (!REALTIME_ALERTS_ENABLED || !token || typeof window === 'undefined' || !('WebSocket' in window) || isTokenExpiredOrClose(token)) {
    return () => {};
  }

  let socket = null;
  let reconnectTimer = null;
  let stopped = false;
  let retryCount = 0;
  let opened = false;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    if (!window.navigator.onLine || isTokenExpiredOrClose(token)) return;
    if (!opened && retryCount >= MAX_REALTIME_RETRIES) return;
    const delay = Math.min(30000, 1000 * 2 ** retryCount);
    retryCount += 1;
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(connect, delay);
  }

  function connect() {
    clearReconnectTimer();
    if (stopped) return;
    if (!window.navigator.onLine || isTokenExpiredOrClose(token)) return;

    opened = false;
    socket = new window.WebSocket(realtimeUrl(token));
    socket.addEventListener('open', () => {
      opened = true;
      retryCount = 0;
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'notifications.changed') {
          onSignal?.(message);
        }
      } catch {
        // Ignore malformed realtime messages; polling remains the fallback.
      }
    });
    socket.addEventListener('close', (event) => {
      if (event.code === 1008 || event.code === 4001 || event.code === 4401) {
        return;
      }
      scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      socket?.close();
    });
  }

  connect();
  const resume = () => {
    if (!socket || socket.readyState === window.WebSocket.CLOSED) {
      retryCount = 0;
      connect();
    }
  };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);

  return () => {
    stopped = true;
    clearReconnectTimer();
    window.removeEventListener('online', resume);
    window.removeEventListener('focus', resume);
    socket?.close();
  };
}
