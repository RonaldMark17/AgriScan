import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  ShieldAlert,
  Sprout,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';
import { ChartCard, StatusBadge, formatDateTime, labelize } from '../components/shared/platform.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function monthLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleDateString([], { month: 'short' });
}

function buildScanTrend(scans) {
  const buckets = new Map();
  safeArray(scans).forEach((scan) => {
    const label = monthLabel(scan.created_at);
    buckets.set(label, (buckets.get(label) || 0) + 1);
  });
  return Array.from(buckets.entries()).slice(0, 6).reverse().map(([month, scansCount]) => ({
    month,
    scans: scansCount,
  }));
}

function activityTone(action) {
  const normalized = String(action || '').toLowerCase();
  if (normalized.includes('suspended') || normalized.includes('disabled') || normalized.includes('failed')) return 'suspended';
  if (normalized.includes('approved') || normalized.includes('enabled') || normalized.includes('success')) return 'active';
  if (normalized.includes('pending') || normalized.includes('review')) return 'pending';
  return 'draft';
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState({
    loading: true,
    summary: null,
    users: [],
    scans: [],
    notifications: [],
    activityLogs: [],
    farms: [],
    appeals: [],
    security: null,
    report: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [
      summaryResult,
      usersResult,
      scansResult,
      notificationsResult,
      activityResult,
      farmsResult,
      appealsResult,
      securityResult,
      reportResult,
    ] = await Promise.allSettled([
      api.get('/dashboard/summary'),
      api.get('/users'),
      api.get('/scans'),
      api.get('/notifications'),
      api.get('/admin/activity-logs'),
      api.get('/admin/farm-approvals'),
      api.get('/admin/appeals'),
      api.get('/admin/account-security-summary'),
      api.get('/reports/monthly'),
    ]);

    setState({
      loading: false,
      summary: summaryResult.status === 'fulfilled' ? summaryResult.value.data : null,
      users: usersResult.status === 'fulfilled' ? safeArray(usersResult.value.data) : [],
      scans: scansResult.status === 'fulfilled' ? safeArray(scansResult.value.data) : [],
      notifications: notificationsResult.status === 'fulfilled' ? safeArray(notificationsResult.value.data) : [],
      activityLogs: activityResult.status === 'fulfilled' ? safeArray(activityResult.value.data) : [],
      farms: farmsResult.status === 'fulfilled' ? safeArray(farmsResult.value.data) : [],
      appeals: appealsResult.status === 'fulfilled' ? safeArray(appealsResult.value.data) : [],
      security: securityResult.status === 'fulfilled' ? securityResult.value.data : null,
      report: reportResult.status === 'fulfilled' ? reportResult.value.data : null,
    });
  }, []);

  useEffect(() => {
    load().catch(() => setState((current) => ({ ...current, loading: false })));
  }, [load]);

  const stats = useMemo(() => {
    const farmers = state.users.filter((item) => (item.role?.name || item.role || '').toLowerCase() === 'farmer');
    const activeUsers = state.users.filter((item) => (item.account_status || (item.is_active ? 'active' : 'disabled')) === 'active' && item.is_active !== false);
    const suspendedUsers = state.users.filter((item) => ['suspended', 'disabled', 'pending_review'].includes(item.account_status || (item.is_active ? 'active' : 'disabled')));
    return {
      totalFarmers: farmers.length,
      activeUsers: activeUsers.length,
      suspendedUsers: state.security?.suspended_users ?? suspendedUsers.length,
      cropsMonitored: state.scans.length || state.summary?.stats?.scans || 0,
      reportsGenerated: state.report ? 1 : 0,
    };
  }, [state.report, state.scans.length, state.security?.suspended_users, state.summary?.stats?.scans, state.users]);

  const scanTrend = useMemo(() => buildScanTrend(state.scans), [state.scans]);
  const pendingFarmCount = state.farms.filter((farm) => farm.status === 'pending').length;
  const pendingAppealCount = state.appeals.filter((appeal) => appeal.status === 'pending').length;
  const firstName = user?.full_name?.split(' ')?.[0] || 'Admin';

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Admin overview"
        title={`Welcome back, ${firstName}`}
        body="Monitor account health, farm review queues, crop activity, and operational alerts from a summary-first console."
        actions={
          <>
            <Link className="btn-secondary" to="/audit-logs">
              <ShieldAlert className="h-4 w-4" />
              Audit Logs
            </Link>
            <Link className="btn-primary" to="/admin/users">
              <UsersRound className="h-4 w-4" />
              User Management
            </Link>
          </>
        }
      />

      {state.loading ? (
        <div className="state-message flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-leaf-700" />
          Loading admin dashboard...
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={UsersRound} label="Total farmers" value={stats.totalFarmers} helper="Registered farmer accounts." />
        <StatCard icon={UserRoundCheck} label="Active users" value={stats.activeUsers} helper="Accounts currently allowed in." tone="sky" />
        <StatCard icon={ShieldAlert} label="Suspended accounts" value={stats.suspendedUsers} helper="Suspended or pending review." tone="amber" />
        <StatCard icon={Sprout} label="Crops monitored" value={stats.cropsMonitored} helper="Disease scans in scope." tone="leaf" />
        <StatCard icon={FileText} label="Reports generated" value={stats.reportsGenerated} helper="Latest monthly report state." tone="soil" />
      </section>

      <div className="content-sidebar-layout">
        <div className="space-y-5">
          <ChartCard
            title="Crop trend summary"
            body="Recent crop scan volume, grouped by month for quick operational visibility."
            actions={<Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" to="/analytics">Open Analytics</Link>}
          >
            {scanTrend.length ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scanTrend} margin={{ left: 4, right: 16, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#e7e5e4" strokeDasharray="5 7" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#78716c', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78716c', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="scans" fill="#2E7D32" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state">
                <BarChart3 className="mx-auto h-8 w-8 text-stone-400" />
                <p className="mt-2 text-sm font-bold text-stone-950">No scan trend yet</p>
                <p className="mt-1 text-sm text-stone-500">Crop activity appears here after scans are submitted.</p>
              </div>
            )}
          </ChartCard>

          <section className="surface rounded-lg p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="section-title flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-leaf-700" />
                  Recent system activities
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">A compact view of admin actions, account events, and farm changes.</p>
              </div>
              <Link className="text-sm font-bold text-leaf-700" to="/audit-logs">View all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {state.activityLogs.slice(0, 6).map((log) => (
                <article key={log.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-stone-950">{labelize(log.action)}</p>
                      <p className="mt-1 text-xs text-stone-500">{log.user_name || log.user_email || 'System activity'}</p>
                    </div>
                    <StatusBadge status={activityTone(log.action)}>{formatDateTime(log.created_at)}</StatusBadge>
                  </div>
                </article>
              ))}
              {!state.activityLogs.length ? (
                <div className="empty-state">
                  <Clock3 className="mx-auto h-8 w-8 text-stone-400" />
                  <p className="mt-2 text-sm font-bold text-stone-950">No recent activity</p>
                  <p className="mt-1 text-sm text-stone-500">Audit activity appears after users interact with the system.</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-5 min-[1440px]:sticky sticky-panel min-[1440px]:self-start">
          <section className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Pending requests
            </h2>
            <div className="mt-4 grid gap-3">
              <Link className="rounded-lg border border-amber-100 bg-amber-50 p-4 transition hover:bg-amber-100/70" to="/farms">
                <p className="text-sm font-bold text-amber-900">{pendingFarmCount} farm reviews</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">Farm registrations waiting for admin review.</p>
              </Link>
              <Link className="rounded-lg border border-sky-100 bg-sky-50 p-4 transition hover:bg-sky-100/70" to="/admin/users">
                <p className="text-sm font-bold text-sky-900">{pendingAppealCount} appeal requests</p>
                <p className="mt-1 text-xs leading-5 text-sky-800">Suspended farmers requesting account review.</p>
              </Link>
            </div>
          </section>

          <section className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title flex items-center gap-2">
              <Bell className="h-5 w-5 text-leaf-700" />
              Latest notifications
            </h2>
            <div className="mt-4 space-y-3">
              {state.notifications.slice(0, 5).map((notification) => (
                <article key={notification.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-stone-950">{notification.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{notification.body}</p>
                    </div>
                    <StatusBadge status={notification.is_read ? 'read' : 'unread'}>{notification.is_read ? 'Read' : 'Unread'}</StatusBadge>
                  </div>
                </article>
              ))}
              {!state.notifications.length ? (
                <div className="empty-state">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-stone-400" />
                  <p className="mt-2 text-sm font-bold text-stone-950">All clear</p>
                  <p className="mt-1 text-sm text-stone-500">System alerts will appear here.</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title">Recent farmer registrations</h2>
            <div className="mt-4 space-y-3">
              {state.users
                .filter((item) => (item.role?.name || item.role || '').toLowerCase() === 'farmer')
                .slice(0, 5)
                .map((farmer) => (
                  <article key={farmer.id} className="rounded-lg border border-stone-200 bg-white p-3">
                    <p className="break-words text-sm font-bold text-stone-950">{farmer.full_name}</p>
                    <p className="mt-1 break-all text-xs text-stone-500">{farmer.email}</p>
                    <p className="mt-2 text-xs font-semibold text-stone-400">{formatDateTime(farmer.created_at)}</p>
                  </article>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
