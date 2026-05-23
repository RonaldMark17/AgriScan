import { Bell, CheckCheck, Leaf, Loader2, LogOut, Settings, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';
import { notifyUnreadNotifications } from '../../utils/browserNotifications.js';
import { connectRealtimeAlertStream } from '../../utils/realtimeAlerts.js';
import LanguageToggle from '../shared/LanguageToggle.jsx';

const NOTIFICATION_AJAX_REFRESH_MS = 10000;

function formatNotificationTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function notificationTarget(notification) {
  if (notification?.payload?.url) return notification.payload.url;

  switch (notification?.type) {
    case 'weather':
    case 'inspection':
      return '/farms';
    case 'marketplace':
    case 'recommendation':
      return '/scan';
    case 'disease_scan':
      return '/disease-detector';
    case 'farm_pending':
    case 'farm_updated':
    case 'farm_deleted':
      return '/farms';
    case 'flagged_crop':
      return '/crop-management';
    case 'farm_approved':
    case 'farm_rejected':
    case 'farm_review_undone':
      return '/farms';
    default:
      return '/notifications';
  }
}

function notificationId(notification) {
  return notification?.id === undefined || notification?.id === null ? '' : String(notification.id);
}

function dispatchNotificationEvents(notifications) {
  if (typeof window === 'undefined' || !Array.isArray(notifications)) return;
  notifications.forEach((notification) => {
    window.dispatchEvent(new CustomEvent('agriscan:notification', { detail: { notification } }));
  });
}

function pageMeta(pathname) {
  if (pathname === '/') return { title: 'Dashboard', breadcrumb: 'Workspace / Dashboard' };
  if (pathname.startsWith('/farms')) return { title: 'Farmers', breadcrumb: 'Workspace / Farmers' };
  if (pathname.startsWith('/crop-management')) return { title: 'Crop Management', breadcrumb: 'Workspace / Crop Management' };
  if (pathname.startsWith('/scan')) return { title: 'Manual Scan', breadcrumb: 'Crop Management / Manual Scan' };
  if (pathname.startsWith('/disease-detector')) return { title: 'Disease Detector', breadcrumb: 'Crop Management / Disease Detector' };
  if (pathname.startsWith('/reports')) return { title: 'Reports', breadcrumb: 'Workspace / Reports' };
  if (pathname.startsWith('/notifications')) return { title: 'Notifications', breadcrumb: 'Workspace / Notifications' };
  if (pathname.startsWith('/audit-logs')) return { title: 'Audit Logs', breadcrumb: 'Admin / Security Monitoring' };
  if (pathname.startsWith('/analytics')) return { title: 'Analytics', breadcrumb: 'Admin / Analytics' };
  if (pathname.startsWith('/settings')) return { title: 'Settings', breadcrumb: 'Workspace / Settings' };
  if (pathname.startsWith('/profile')) return { title: 'Profile', breadcrumb: 'Workspace / Profile' };
  if (pathname.startsWith('/admin/users')) return { title: 'User Management', breadcrumb: 'Admin / User Management' };
  if (pathname.startsWith('/admin')) return { title: 'Administration', breadcrumb: 'Admin' };
  return { title: 'Dashboard', breadcrumb: 'Workspace / Dashboard' };
}

export default function Topbar() {
  const { accessToken, logout, user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [notificationToast, setNotificationToast] = useState(null);
  const notificationsRef = useRef(null);
  const profileRef = useRef(null);
  const knownNotificationIdsRef = useRef(new Set());
  const notificationsInitializedRef = useRef(false);
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const userDisplayName = user?.full_name || user?.email || 'AgriScan User';
  const currentPage = useMemo(() => pageMeta(location.pathname), [location.pathname]);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);
  const notificationSummary = useMemo(() => {
    if (unreadCount > 0) return t('unreadNotifications', { count: unreadCount });
    if (notifications.length > 0) return t('allNotificationsRead');
    return t('noNotificationsYet');
  }, [notifications.length, t, unreadCount]);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setNotificationsLoading(true);
    try {
      const { data } = await api.get('/notifications');
      const nextNotifications = Array.isArray(data) ? data : [];
      const unreadNotifications = nextNotifications.filter((notification) => !notification.is_read && notificationId(notification));
      const newUnreadNotifications = unreadNotifications.filter(
        (notification) => !knownNotificationIdsRef.current.has(notificationId(notification))
      );
      if (notificationsInitializedRef.current && newUnreadNotifications.length > 0) {
        setNotificationToast(newUnreadNotifications[0]);
        dispatchNotificationEvents(newUnreadNotifications);
      }
      knownNotificationIdsRef.current = new Set(nextNotifications.map(notificationId).filter(Boolean));
      notificationsInitializedRef.current = true;
      setNotifications(nextNotifications);
      void notifyUnreadNotifications(nextNotifications, user?.id);
    } catch {
      if (!silent) setNotifications([]);
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    knownNotificationIdsRef.current = new Set();
    notificationsInitializedRef.current = false;
    setNotificationToast(null);
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!notificationsOpen) return;
    loadNotifications();
  }, [notificationsOpen, loadNotifications]);

  useEffect(() => {
    const pollNotifications = () => {
      void loadNotifications({ silent: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollNotifications();
      }
    };

    const intervalId = window.setInterval(pollNotifications, NOTIFICATION_AJAX_REFRESH_MS);
    window.addEventListener('focus', pollNotifications);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', pollNotifications);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    return connectRealtimeAlertStream({
      token: accessToken,
      onSignal: (message) => {
        if (message?.payload || message?.title || message?.body) {
          window.dispatchEvent(new CustomEvent('agriscan:notification', { detail: { notification: message } }));
        }
        void loadNotifications({ silent: true });
      },
    });
  }, [accessToken, loadNotifications]);

  useEffect(() => {
    if (!notificationToast) return undefined;
    const timeoutId = window.setTimeout(() => setNotificationToast(null), 8000);
    return () => window.clearTimeout(timeoutId);
  }, [notificationToast]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setProfileOpen(false);
        setConfirmLogoutOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function markNotificationRead(notificationId) {
    try {
      await api.patch(`/notifications/${notificationId}/read`);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
      );
    } catch {
      // Keep the menu responsive even if the read status update fails.
    }
  }

  async function markAllNotificationsRead() {
    if (unreadCount === 0 || markingAllRead) return;
    const unreadNotificationIds = notifications.filter((item) => !item.is_read && notificationId(item)).map(notificationId);
    if (unreadNotificationIds.length === 0) return;

    setMarkingAllRead(true);
    try {
      const results = await Promise.allSettled(
        unreadNotificationIds.map((id) => api.patch(`/notifications/${id}/read`))
      );
      const readIds = new Set(
        results
          .map((result, index) => (result.status === 'fulfilled' ? unreadNotificationIds[index] : null))
          .filter(Boolean)
      );

      if (readIds.size > 0) {
        setNotifications((current) =>
          current.map((item) => (readIds.has(notificationId(item)) ? { ...item, is_read: true } : item))
        );
        setNotificationToast(null);
      }
    } catch {
      // Keep the menu responsive even if the read status update fails.
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
      setConfirmLogoutOpen(false);
    }
  }

  return (
    <>
      <header className="topbar fixed inset-x-0 top-0 z-[70] border-b border-stone-200/90 bg-white/95 backdrop-blur">
        <div className="topbar-shell">
          <Link
            to="/"
            className="topbar-brand flex h-full min-w-0 flex-1 items-center gap-2 border-0 px-3 sm:gap-3 sm:px-5 lg:flex-none lg:px-5"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-700 text-white ring-1 ring-leaf-600/20">
              <Leaf className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <span className="truncate text-lg font-bold text-leaf-800 sm:text-xl">AgriScan</span>
          </Link>

          <div className="hidden min-w-0 flex-col justify-center px-3 sm:px-5 lg:flex lg:min-w-0 lg:px-5 xl:px-7">
            <p className="hidden truncate text-base font-bold text-stone-950 lg:block">{currentPage.title}</p>
            <p className="truncate text-sm font-semibold text-stone-600 sm:text-xs md:text-stone-500">{currentPage.breadcrumb}</p>
          </div>

          <div className="topbar-actions flex shrink-0 items-center justify-end gap-1.5 border-0 px-3 sm:gap-2 sm:px-4 md:px-5 lg:min-w-0 lg:px-5 xl:px-7">
            <div className="hidden min-[700px]:block lg:hidden">
              <LanguageToggle />
            </div>
            <Link
              to="/settings"
              className="focus-ring hidden h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:border-leaf-200 hover:bg-leaf-50 hover:text-leaf-800 md:grid"
              title={t('settings')}
              aria-label={t('settings')}
            >
              <Settings className="h-4 w-4" />
            </Link>
            <div className="topbar-presence-cluster flex items-center gap-1 md:gap-1.5">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                className="topbar-icon-button focus-ring relative grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:border-leaf-200 hover:bg-leaf-50 hover:text-leaf-800"
                aria-label={t('notifications')}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  setProfileOpen(false);
                }}
              >
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                ) : null}
              </button>

            {notificationsOpen ? (
              <div className="notification-menu topbar-popover surface fixed left-3 right-3 top-16 z-[80] rounded-lg p-2 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[min(92vw,380px)]">
                <div className="flex flex-col gap-3 px-3 py-2 min-[700px]:flex-row min-[700px]:items-start min-[700px]:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-950">{t('notifications')}</p>
                    <p className="text-xs text-stone-500">{notificationSummary}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 min-[700px]:justify-end">
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        className="focus-ring inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-leaf-100 bg-leaf-50 px-2.5 text-xs font-bold text-leaf-800 transition hover:border-leaf-200 hover:bg-leaf-100 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={markAllNotificationsRead}
                        disabled={markingAllRead}
                      >
                        {markingAllRead ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                        <span className="whitespace-nowrap">{t('markAllAsRead')}</span>
                      </button>
                    ) : null}
                    <Link
                      to="/notifications"
                      className="text-xs font-bold text-leaf-700"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      View all
                    </Link>
                  </div>
                </div>

                <div className="max-h-[320px] space-y-1 overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="grid min-h-28 place-items-center px-3 py-6 text-sm text-stone-500">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('loading')}
                      </div>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-stone-500">{t('noNotificationsYet')}</div>
                  ) : (
                    notifications.slice(0, 6).map((notification) => (
                      <Link
                        key={notification.id}
                        to={notificationTarget(notification)}
                        className={`block rounded-lg px-3 py-3 transition hover:bg-stone-50 ${
                          notification.is_read ? 'bg-white' : 'bg-leaf-50/60'
                        }`}
                        onClick={() => {
                          if (!notification.is_read) {
                            void markNotificationRead(notification.id);
                          }
                          setNotificationsOpen(false);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-stone-900">{notification.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{notification.body}</p>
                          </div>
                          {!notification.is_read ? (
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-leaf-500" />
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-stone-400">
                          {formatNotificationTime(notification.created_at)}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="topbar-avatar-button focus-ring relative grid h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:border-leaf-200 hover:bg-leaf-50 hover:text-leaf-800 md:h-10 md:w-10 lg:h-11 lg:w-11"
              aria-label={t('settings')}
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((current) => !current);
                setNotificationsOpen(false);
              }}
            >
              <UserRound className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-leaf-500 ring-2 ring-white" />
            </button>

            {profileOpen ? (
              <div className="profile-menu topbar-popover surface fixed left-3 right-3 top-16 z-[80] rounded-lg p-2 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[min(92vw,320px)]">
                <div className="rounded-lg bg-stone-50 px-3 py-3">
                  <p className="text-sm font-bold text-stone-950">{userDisplayName}</p>
                  <p className="mt-1 text-xs text-stone-500">{user?.email || ''}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    {t('role')}: {roleName}
                  </p>
                </div>

                <div className="mt-2 space-y-1">
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    <UserRound className="h-4 w-4" />
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    {t('settings')}
                  </Link>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    onClick={() => {
                      setProfileOpen(false);
                      setConfirmLogoutOpen(true);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('logout')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="topbar-icon-button focus-ring hidden h-10 w-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 xl:grid"
            aria-label={t('logout')}
            title={t('logout')}
            onClick={() => setConfirmLogoutOpen(true)}
          >
            <LogOut className="h-4 w-4" />
          </button>
          </div>
        </div>
        </div>
      </header>
      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-stone-950/45 p-4 sm:items-center">
          <div className="surface modal-panel w-full max-w-md flex-none rounded-lg bg-white p-6">
            <h2 className="text-xl font-bold text-stone-950">{t('logoutConfirmTitle')}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{t('logoutConfirmBody')}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmLogoutOpen(false)}
                disabled={loggingOut}
              >
                {t('cancel')}
              </button>
              <button type="button" className="btn-danger" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {loggingOut ? t('loading') : t('confirmLogout')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {notificationToast ? (
        <div className="surface fixed right-3 top-20 z-[90] w-[min(92vw,360px)] rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
              <Bell className="h-5 w-5" />
            </div>
            <Link
              to={notificationTarget(notificationToast)}
              className="min-w-0 flex-1"
              onClick={() => setNotificationToast(null)}
            >
              <p className="truncate text-sm font-bold text-stone-950">{notificationToast.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{notificationToast.body}</p>
            </Link>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              aria-label="Dismiss notification"
              onClick={() => setNotificationToast(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
