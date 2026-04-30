/* global Response */

const CACHE_NAME = 'agriscan-cache-v8';
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
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
        .catch(() => cached || new Response('', { status: 504, statusText: 'Offline' }));
      return cached || network;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'AgriScan', body: 'New farm alert available.', url: '/' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { ...data, body: event.data.text() || data.body };
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'AgriScan', {
      body: data.body || 'Open AgriScan for details.',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: data.tag || data.type || 'agriscan-notification',
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
