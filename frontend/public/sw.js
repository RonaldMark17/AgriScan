/* global Response */

const CACHE_NAME = 'agriscan-cache-v25';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg'
];
const API_PATH_PREFIXES = ['/api/', '/uploads/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function notificationOptions(data = {}) {
  return {
    body: data.body || 'Open AgriScan for details.',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: data.tag || data.type || data.notification_id || 'agriscan-notification',
    renotify: true,
    requireInteraction: true,
    timestamp: Number(data.timestamp) || Date.now(),
    vibrate: [120, 60, 120],
    actions: [
      { action: 'open', title: 'Open AgriScan' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: {
      ...data,
      url: data.url || '/'
    }
  };
}

function showAgriScanNotification(data = {}) {
  return self.registration.showNotification(data.title || 'AgriScan', notificationOptions(data));
}

function replyToMessage(event, message) {
  if (event.ports?.[0]) {
    event.ports[0].postMessage(message);
    return;
  }
  event.source?.postMessage(message);
}

self.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (message.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      showAgriScanNotification(message.payload || {})
        .then(() => replyToMessage(event, { type: 'SHOW_NOTIFICATION_RESULT', ok: true }))
        .catch((error) =>
          replyToMessage(event, {
            type: 'SHOW_NOTIFICATION_RESULT',
            ok: false,
            error: error?.message || 'Notification failed'
          })
        )
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (
    requestUrl.pathname === '/sw.js' ||
    requestUrl.pathname === '/index.html' ||
    requestUrl.pathname.startsWith('/assets/')
  ) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (API_PATH_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const requestClone = response.clone();
            const indexClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, requestClone);
              cache.put('/index.html', indexClone);
            });
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match('/index.html'))
            .then((cached) => cached || caches.match('/offline.html'))
            .then((cached) => cached || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  const isAppRoute = !requestUrl.pathname.includes('.') && !requestUrl.pathname.startsWith('/api/') && !requestUrl.pathname.startsWith('/uploads/');
  if (isAppRoute) {
    event.respondWith(
      fetch(request)
        .then((response) => response.ok ? response : caches.match('/index.html'))
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/offline.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || new Response('', { status: 503 }));
      return cached || network;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const targetUrl = typeof data === 'string' ? data : data.url || '/';
  const url = new URL(targetUrl, self.location.origin);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const matchingClient = clientList.find((client) => {
        const clientUrl = new URL(client.url);
        return clientUrl.origin === url.origin && clientUrl.pathname === url.pathname;
      });
      if (matchingClient) {
        return matchingClient.focus();
      }
      return clients.openWindow(url.href);
    })
  );
});
