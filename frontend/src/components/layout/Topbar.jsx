import { Bell, Leaf, Loader2, LogOut, Mic, Settings, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useI18n } from '../../context/I18nContext.jsx';
import { useVoice } from '../../context/VoiceContext.jsx';
import { notifyUnreadNotifications } from '../../utils/browserNotifications.js';
import LanguageToggle from '../shared/LanguageToggle.jsx';

function formatNotificationTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function notificationTarget(notification) {
  switch (notification?.type) {
    case 'weather':
    case 'inspection':
      return '/farms';
    case 'marketplace':
    case 'recommendation':
      return '/scan';
    case 'disease_scan':
      return '/disease-detector';
    case 'farm_approved':
      return '/farms';
    default:
      return '/reports';
  }
}

function voiceGuideKey(pathname) {
  if (pathname === '/') return 'voiceGuideDashboard';
  if (pathname.startsWith('/farms')) return 'voiceGuideFarms';
  if (pathname.startsWith('/scan')) return 'voiceGuideManualScan';
  if (pathname.startsWith('/disease-detector')) return 'voiceGuideDiseaseDetector';
  if (pathname.startsWith('/reports')) return 'voiceGuideReports';
  if (pathname.startsWith('/settings')) return 'voiceGuideSettings';
  if (pathname.startsWith('/admin')) return 'voiceGuideAdmin';
  return 'voiceGuideDefault';
}

function pageTitleKey(pathname) {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/farms')) return 'farms';
  if (pathname.startsWith('/scan')) return 'manualScan';
  if (pathname.startsWith('/disease-detector')) return 'diseaseDetector';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/settings')) return 'security';
  if (pathname.startsWith('/admin')) return 'users';
  return 'dashboard';
}

export default function Topbar() {
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const { speak, speechSupported, voiceAssistantEnabled } = useVoice();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const notificationsRef = useRef(null);
  const profileRef = useRef(null);
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setNotificationsLoading(true);
    try {
      const { data } = await api.get('/notifications');
      const nextNotifications = Array.isArray(data) ? data : [];
      setNotifications(nextNotifications);
      void notifyUnreadNotifications(nextNotifications, user?.id);
    } catch {
      if (!silent) setNotifications([]);
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
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

    const intervalId = window.setInterval(pollNotifications, 30000);
    window.addEventListener('focus', pollNotifications);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', pollNotifications);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadNotifications]);

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

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setConfirmLogoutOpen(false);
    }
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[70] border-b border-stone-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="topbar-shell flex h-16 min-w-0 items-center justify-between lg:grid lg:h-[72px] lg:grid-cols-[256px_minmax(0,1fr)_auto]">
          <Link
            to="/"
            className="topbar-brand flex h-full min-w-0 flex-1 items-center gap-2 border-0 px-3 sm:gap-3 sm:px-5 lg:flex-none lg:px-6"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf-600 text-white sm:h-11 sm:w-11">
              <Leaf className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <span className="truncate text-lg font-bold text-leaf-600 sm:text-2xl">AgriScan</span>
          </Link>

          <div className="hidden min-w-0 px-7 lg:block xl:px-9">
            <p className="truncate text-lg font-bold text-stone-950">{t(pageTitleKey(location.pathname))}</p>
            <p className="truncate text-xs font-semibold text-stone-500">{user?.full_name || user?.email || 'AgriScan User'}</p>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5 border-0 px-3 sm:gap-2 sm:px-5 lg:min-w-0 lg:px-7 xl:px-9">
            <div className="hidden sm:block lg:hidden">
              <LanguageToggle />
            </div>
            <Link
              to="/settings/security"
              className="focus-ring hidden min-h-10 max-w-[12rem] items-center gap-2 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-2 text-sm font-bold text-leaf-700 transition hover:bg-leaf-100 md:inline-flex"
              onClick={(event) => {
                if (!voiceAssistantEnabled || !speechSupported) return;
                event.preventDefault();
                speak(t(voiceGuideKey(location.pathname)), { kind: 'assistant' });
              }}
            >
              <Mic className="h-4 w-4" />
              <span className="truncate">{voiceAssistantEnabled ? t('voiceActive') : t('voiceInactive')}</span>
            </Link>
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                className="focus-ring relative grid h-10 w-10 place-items-center rounded-lg border border-transparent bg-white text-stone-700 transition hover:border-stone-200 hover:bg-stone-50"
                aria-label={t('notifications')}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  setProfileOpen(false);
                }}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                ) : null}
              </button>

            {notificationsOpen ? (
              <div className="notification-menu surface fixed left-3 right-3 top-16 z-[80] rounded-lg p-2 sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[min(92vw,380px)]">
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-bold text-stone-950">{t('notifications')}</p>
                    <p className="text-xs text-stone-500">
                      {unreadCount > 0 ? t('unreadNotifications', { count: unreadCount }) : t('noNotificationsYet')}
                    </p>
                  </div>
                  <Link
                    to="/reports"
                    className="text-xs font-bold text-leaf-700"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    {t('reports')}
                  </Link>
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
              className="focus-ring relative grid h-10 w-10 place-items-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 sm:h-11 sm:w-11"
              aria-label={t('settings')}
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((current) => !current);
                setNotificationsOpen(false);
              }}
            >
              <UserRound className="h-5 w-5" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-leaf-500 ring-2 ring-white" />
            </button>

            {profileOpen ? (
              <div className="surface absolute right-0 top-[calc(100%+10px)] z-40 w-[min(90vw,280px)] rounded-lg p-2">
                <div className="rounded-lg bg-stone-50 px-3 py-3">
                  <p className="text-sm font-bold text-stone-950">{user?.full_name || 'AgriScan User'}</p>
                  <p className="mt-1 text-xs text-stone-500">{user?.email || ''}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    {t('role')}: {roleName}
                  </p>
                </div>

                <div className="mt-2 space-y-1">
                  <Link
                    to="/settings/security"
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
        </div>
        </div>
      </header>
      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4">
          <div className="surface w-full max-w-md rounded-lg bg-white p-6">
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
              <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {loggingOut ? t('loading') : t('confirmLogout')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
