import { Bell, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';
import { NotificationCard, SearchFilterBar } from '../components/shared/platform.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function labelize(value) {
  return String(value || 'system').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/notifications');
      setNotifications(safeArray(data));
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Notifications could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const notificationTypes = useMemo(() => {
    const values = new Set(notifications.map((notification) => notification.type || 'system'));
    return Array.from(values).sort();
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return notifications.filter((notification) => {
      if (readFilter === 'unread' && notification.is_read) return false;
      if (readFilter === 'read' && !notification.is_read) return false;
      if (typeFilter !== 'all' && (notification.type || 'system') !== typeFilter) return false;
      if (!normalizedSearch) return true;
      return [notification.title, notification.body, notification.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [notifications, readFilter, search, typeFilter]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  async function markRead(notification) {
    setError('');
    try {
      await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)));
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Notification could not be marked as read.'));
    }
  }

  async function markAllRead() {
    if (!unreadCount) return;
    setMarking(true);
    setError('');
    setSuccess('');
    try {
      await api.patch('/notifications/read-all');
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setSuccess('All notifications marked as read.');
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Notifications could not be marked as read.'));
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Alert center"
        title="Notifications"
        body="Review unread alerts, farmer updates, system announcements, crop warnings, and admin messages in one focused inbox."
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button className="btn-primary" type="button" onClick={markAllRead} disabled={marking || unreadCount === 0}>
              {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Mark all read
            </button>
          </>
        }
      />

      {error ? <div className="danger-message">{error}</div> : null}
      {success ? <div className="success-message">{success}</div> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Bell} label="All notifications" value={notifications.length} helper="Total alerts loaded for this account." />
        <StatCard icon={Bell} label="Unread" value={unreadCount} helper="Items that still need attention." tone="amber" />
        <StatCard icon={CheckCheck} label="Categories" value={notificationTypes.length} helper="System, crop, farm, and account alert groups." tone="sky" />
      </section>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search notification title, body, or category"
        filters={[
          {
            id: 'read',
            label: 'Read status',
            value: readFilter,
            onChange: setReadFilter,
            options: [
              { value: 'all', label: 'All statuses' },
              { value: 'unread', label: 'Unread' },
              { value: 'read', label: 'Read' },
            ],
          },
          {
            id: 'type',
            label: 'Category',
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { value: 'all', label: 'All categories' },
              ...notificationTypes.map((type) => ({ value: type, label: labelize(type) })),
            ],
          },
        ]}
      />

      <section className="surface rounded-lg p-4 sm:p-5">
        {loading ? (
          <div className="grid min-h-36 place-items-center text-sm font-semibold text-stone-500">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-leaf-700" />
              Loading notifications...
            </span>
          </div>
        ) : filteredNotifications.length ? (
          <div className="grid gap-3">
            {filteredNotifications.map((notification) => (
              <NotificationCard key={notification.id} notification={notification} onMarkRead={markRead} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Bell className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-2 text-sm font-bold text-stone-950">No notifications found</p>
            <p className="mt-1 text-sm text-stone-500">Try a different search, status, or category filter.</p>
          </div>
        )}
      </section>
    </div>
  );
}
