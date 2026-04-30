import { getApiBaseUrl } from '../api/client.js';

function realtimeUrl(token) {
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  const url = baseUrl.startsWith('http')
    ? new URL(`${baseUrl}/notifications/stream`)
    : new URL(`${baseUrl}/notifications/stream`, window.location.origin);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url;
}

export function connectRealtimeAlertStream({ token, onSignal }) {
  if (!token || typeof window === 'undefined' || !('WebSocket' in window)) {
    return () => {};
  }

  let socket = null;
  let reconnectTimer = null;
  let stopped = false;
  let retryCount = 0;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = Math.min(30000, 1000 * 2 ** retryCount);
    retryCount += 1;
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(connect, delay);
  }

  function connect() {
    clearReconnectTimer();
    if (stopped) return;

    socket = new window.WebSocket(realtimeUrl(token));
    socket.addEventListener('open', () => {
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
    socket.addEventListener('close', scheduleReconnect);
    socket.addEventListener('error', () => {
      socket?.close();
    });
  }

  connect();

  return () => {
    stopped = true;
    clearReconnectTimer();
    socket?.close();
  };
}
