import { api } from '../api/client.js';

const MANUAL_NOTIFICATIONS_KEY = 'agriscan_manual_notifications';
const SHOWN_NOTIFICATION_IDS_PREFIX = 'agriscan_shown_notification_ids';

function storageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function shownNotificationStorageKey(userId) {
  return `${SHOWN_NOTIFICATION_IDS_PREFIX}_${userId || 'current'}`;
}

function readShownNotificationIds(userId) {
  if (!storageAvailable()) {
    return { initialized: false, ids: new Set() };
  }

  const raw = window.localStorage.getItem(shownNotificationStorageKey(userId));
  if (!raw) {
    return { initialized: false, ids: new Set() };
  }

  try {
    const parsed = JSON.parse(raw);
    const values = Array.isArray(parsed) ? parsed : parsed.ids;
    return {
      initialized: true,
      ids: new Set((Array.isArray(values) ? values : []).map(String)),
    };
  } catch {
    return { initialized: true, ids: new Set() };
  }
}

function writeShownNotificationIds(userId, ids) {
  if (!storageAvailable()) return;
  const values = Array.from(ids).slice(-200);
  window.localStorage.setItem(shownNotificationStorageKey(userId), JSON.stringify({ ids: values }));
}

function notificationId(notification) {
  const id = notification?.id ?? notification?.notification_id ?? notification?.payload?.notification_id;
  return id === undefined || id === null ? '' : String(id);
}

function notificationUrl(notification) {
  return notification?.payload?.url || notification?.url || notification?.data?.url || '/';
}

function notificationPayload(notification) {
  const id = notificationId(notification);
  const url = notificationUrl(notification);
  return {
    ...(notification?.payload || {}),
    title: notification?.title || 'AgriScan',
    body: notification?.body || 'Open AgriScan for details.',
    tag: notification?.tag || id || notification?.type || 'agriscan-notification',
    notification_id: id || undefined,
    type: notification?.type || 'system',
    timestamp: notification?.created_at ? Date.parse(notification.created_at) || Date.now() : Date.now(),
    url,
  };
}

function waitForServiceWorkerResult(worker, payload) {
  return new Promise((resolve) => {
    const channel = new window.MessageChannel();
    const timeoutId = window.setTimeout(() => resolve(false), 4000);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeoutId);
      resolve(Boolean(event.data?.ok));
    };

    worker.postMessage({ type: 'SHOW_NOTIFICATION', payload }, [channel.port2]);
  });
}

async function showWithServiceWorker(payload) {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration?.active || navigator.serviceWorker.controller;
    if (worker && 'MessageChannel' in window) {
      return await waitForServiceWorkerResult(worker, payload);
    }
    if (registration?.showNotification) {
      await registration.showNotification(payload.title || 'AgriScan', {
        body: payload.body || 'Open AgriScan for details.',
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        tag: payload.tag || payload.type || payload.notification_id || 'agriscan-notification',
        renotify: true,
        requireInteraction: true,
        timestamp: Number(payload.timestamp) || Date.now(),
        data: payload,
      });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function browserNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function webPushNotificationsSupported() {
  return (
    browserNotificationsSupported() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    window.isSecureContext
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

async function getWebPushPublicKey() {
  const { data } = await api.get('/notifications/push/public-key');
  if (!data?.enabled || !data?.public_key) {
    throw new Error('Web Push is not configured.');
  }
  return data.public_key;
}

async function getServiceWorkerRegistration({ create = true } = {}) {
  if (!('serviceWorker' in navigator)) return null;

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration && create) {
    registration = await navigator.serviceWorker.register('/sw.js');
  }
  return registration || null;
}

export async function getWebPushSubscriptionState() {
  if (!webPushNotificationsSupported()) {
    return {
      supported: false,
      serverEnabled: false,
      subscribed: false,
      permission: browserNotificationsSupported() ? window.Notification.permission : 'unsupported',
    };
  }

  let serverEnabled = false;
  try {
    await getWebPushPublicKey();
    serverEnabled = true;
  } catch {
    serverEnabled = false;
  }

  let subscribed = false;
  try {
    const registration = await getServiceWorkerRegistration({ create: false });
    const subscription = await registration?.pushManager?.getSubscription();
    subscribed = Boolean(subscription);
  } catch {
    subscribed = false;
  }

  return {
    supported: true,
    serverEnabled,
    subscribed,
    permission: window.Notification.permission,
  };
}

export async function ensureWebPushNotificationsEnabled() {
  if (!webPushNotificationsSupported()) return false;

  let permission = window.Notification.permission;
  if (permission === 'default') {
    permission = await window.Notification.requestPermission();
  }
  if (permission !== 'granted') return false;

  const publicKey = await getWebPushPublicKey();
  const registration = await getServiceWorkerRegistration({ create: true });
  if (!registration?.pushManager) return false;

  const subscription = await (
    (await registration.pushManager.getSubscription()) ||
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  );
  await api.post('/notifications/push/subscribe', subscription.toJSON());
  return true;
}

export function manualNotificationsEnabled() {
  return (
    browserNotificationsSupported() &&
    window.Notification.permission === 'granted' &&
    window.localStorage.getItem(MANUAL_NOTIFICATIONS_KEY) === 'true'
  );
}

export function setManualNotificationsEnabled(enabled) {
  if (!storageAvailable()) return;
  if (enabled) {
    window.localStorage.setItem(MANUAL_NOTIFICATIONS_KEY, 'true');
  } else {
    window.localStorage.removeItem(MANUAL_NOTIFICATIONS_KEY);
  }
}

export async function ensureManualNotificationsEnabled() {
  if (!browserNotificationsSupported()) return false;

  let permission = window.Notification.permission;
  if (permission === 'default') {
    permission = await window.Notification.requestPermission();
  }
  if (permission !== 'granted') {
    setManualNotificationsEnabled(false);
    return false;
  }

  setManualNotificationsEnabled(true);
  return true;
}

export function rememberNotificationIds(notifications, userId) {
  if (!Array.isArray(notifications)) return;
  const current = readShownNotificationIds(userId);
  const nextIds = new Set(current.ids);
  notifications.forEach((notification) => {
    const id = notificationId(notification);
    if (id) nextIds.add(id);
  });
  writeShownNotificationIds(userId, nextIds);
}

export async function showBrowserNotification(notification, userId) {
  if (!manualNotificationsEnabled()) return false;

  const id = notificationId(notification);
  const payload = notificationPayload(notification);

  if (await showWithServiceWorker(payload)) {
    if (id) {
      const current = readShownNotificationIds(userId);
      current.ids.add(id);
      writeShownNotificationIds(userId, current.ids);
    }
    return true;
  }

  try {
    const browserNotification = new window.Notification(payload.title, {
      body: payload.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: payload.tag,
      data: payload,
    });
    browserNotification.onclick = () => {
      window.focus();
      window.location.assign(payload.url || '/');
    };
    if (id) {
      const current = readShownNotificationIds(userId);
      current.ids.add(id);
      writeShownNotificationIds(userId, current.ids);
    }
    return true;
  } catch {
    return false;
  }
}

export async function notifyUnreadNotifications(notifications, userId) {
  if (!manualNotificationsEnabled() || !Array.isArray(notifications)) return 0;

  const unreadNotifications = notifications.filter((notification) => !notification?.is_read && notificationId(notification));
  const current = readShownNotificationIds(userId);

  if (!current.initialized) {
    rememberNotificationIds(unreadNotifications, userId);
    return 0;
  }

  let shown = 0;
  for (const notification of unreadNotifications) {
    if (current.ids.has(notificationId(notification))) continue;
    if (await showBrowserNotification(notification, userId)) {
      current.ids.add(notificationId(notification));
      shown += 1;
    }
  }

  writeShownNotificationIds(userId, current.ids);
  return shown;
}
