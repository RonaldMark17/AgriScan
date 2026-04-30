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

export function browserNotificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
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
  const title = notification?.title || 'AgriScan';
  const url = notificationUrl(notification);
  const options = {
    body: notification?.body || 'Open AgriScan for details.',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: notification?.tag || id || notification?.type || 'agriscan-notification',
    renotify: true,
    requireInteraction: true,
    timestamp: notification?.created_at ? Date.parse(notification.created_at) || Date.now() : Date.now(),
    data: {
      ...(notification?.payload || {}),
      notification_id: id || undefined,
      type: notification?.type || 'system',
      url,
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        if (id) {
          const current = readShownNotificationIds(userId);
          current.ids.add(id);
          writeShownNotificationIds(userId, current.ids);
        }
        return true;
      }
    }
  } catch {
    // Fall back to the window Notification API when the service worker is not ready.
  }

  try {
    const browserNotification = new window.Notification(title, options);
    browserNotification.onclick = () => {
      window.focus();
      window.location.assign(url);
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
