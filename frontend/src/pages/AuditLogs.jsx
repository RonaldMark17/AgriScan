import { AlertTriangle, Clock3, Download, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import StatCard from '../components/shared/StatCard.jsx';
import {
  DataTable,
  SearchFilterBar,
  SeverityBadge,
  StatusBadge,
  formatDateTime,
  labelize,
} from '../components/shared/platform.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

function inferSeverity(record) {
  const action = String(record.action || record.event_type || '').toLowerCase();
  const severity = String(record.severity || '').toLowerCase();
  if (severity) return severity;
  if (action.includes('suspended') || action.includes('disabled') || action.includes('failed') || action.includes('rejected')) return 'high';
  if (action.includes('appeal') || action.includes('review') || action.includes('password') || action.includes('mfa')) return 'warning';
  if (action.includes('approved') || action.includes('enabled') || action.includes('success')) return 'low';
  return 'info';
}

function normalizeSecurityEvent(event) {
  return {
    id: `security-${event.id}`,
    source: 'Security event',
    user_name: event.email || 'Unknown user',
    user_email: event.email || '-',
    user_role: 'security',
    action: event.event_type,
    resource_type: 'account',
    resource_id: event.user_id,
    ip_address: event.ip_address,
    user_agent: event.user_agent,
    metadata_json: event.metadata_json,
    created_at: event.created_at,
    severity: event.severity || inferSeverity(event),
  };
}

function matchesDate(createdAt, filter) {
  if (filter === 'all') return true;
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = Date.now();
  const ageMs = now - parsed.getTime();
  if (filter === '24h') return ageMs <= 24 * 60 * 60 * 1000;
  if (filter === '7d') return ageMs <= 7 * 24 * 60 * 60 * 1000;
  if (filter === '30d') return ageMs <= 30 * 24 * 60 * 60 * 1000;
  return true;
}

export default function AuditLogs() {
  const [activityLogs, setActivityLogs] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [securitySummary, setSecuritySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activityResponse, securityResponse] = await Promise.all([
        api.get('/admin/activity-logs'),
        api.get('/admin/account-security-summary'),
      ]);
      setActivityLogs(Array.isArray(activityResponse.data) ? activityResponse.data : []);
      setSecuritySummary(securityResponse.data);
      setSecurityEvents(Array.isArray(securityResponse.data?.recent_suspicious_activities) ? securityResponse.data.recent_suspicious_activities : []);
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Audit logs could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const combined = [
      ...securityEvents.map(normalizeSecurityEvent),
      ...activityLogs.map((log) => ({ ...log, id: `audit-${log.id}`, source: 'Audit log', severity: inferSeverity(log) })),
    ].sort((first, second) => new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime());

    return combined.filter((record) => {
      const severity = inferSeverity(record);
      if (severityFilter !== 'all' && severity !== severityFilter) return false;
      const role = String(record.user_role || '').toLowerCase() || 'system';
      if (roleFilter !== 'all' && role !== roleFilter) return false;
      if (!matchesDate(record.created_at, dateFilter)) return false;
      if (!normalizedSearch) return true;
      return [
        record.user_name,
        record.user_email,
        record.user_role,
        record.action,
        record.resource_type,
        record.resource_id,
        record.ip_address,
        record.source,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [activityLogs, dateFilter, roleFilter, search, securityEvents, severityFilter]);

  function exportCsv() {
    const header = ['time', 'severity', 'source', 'user', 'role', 'action', 'resource', 'ip'];
    const csvRows = rows.map((row) => [
      formatDateTime(row.created_at),
      inferSeverity(row),
      row.source,
      row.user_email || row.user_name || 'System',
      row.user_role || 'system',
      row.action,
      [row.resource_type, row.resource_id].filter(Boolean).join(' #'),
      row.ip_address || '',
    ]);
    const csv = [header, ...csvRows]
      .map((items) => items.map((item) => `"${String(item ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new window.Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agriscan-audit-logs.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Security monitoring"
        title="Audit Logs"
        body="Review admin actions, login activity, account status changes, suspicious events, and timestamps in one dedicated monitoring surface."
        actions={
          <>
            <button className="btn-secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button className="btn-primary" type="button" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </>
        }
      />

      {error ? <div className="danger-message">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldAlert} label="Suspended users" value={securitySummary?.suspended_users ?? 0} helper="Suspended or pending review accounts." tone="amber" />
        <StatCard icon={AlertTriangle} label="Disabled users" value={securitySummary?.disabled_users ?? 0} helper="Disabled account records." tone="soil" />
        <StatCard icon={Clock3} label="Pending appeals" value={securitySummary?.pending_appeals ?? 0} helper="Appeal review queue." tone="sky" />
        <StatCard icon={ShieldCheck} label="Events loaded" value={rows.length} helper="Filtered audit and security records." />
      </section>

      <SearchFilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search user, action, resource, IP, or source"
        filters={[
          {
            id: 'severity',
            label: 'Severity',
            value: severityFilter,
            onChange: (value) => {
              setSeverityFilter(value);
              setPage(1);
            },
            options: [
              { value: 'all', label: 'All severities' },
              { value: 'high', label: 'High' },
              { value: 'warning', label: 'Warning' },
              { value: 'info', label: 'Info' },
              { value: 'low', label: 'Low' },
            ],
          },
          {
            id: 'role',
            label: 'Role',
            value: roleFilter,
            onChange: (value) => {
              setRoleFilter(value);
              setPage(1);
            },
            options: [
              { value: 'all', label: 'All roles' },
              { value: 'admin', label: 'Admin' },
              { value: 'farmer', label: 'Farmer' },
              { value: 'security', label: 'Security' },
              { value: 'system', label: 'System' },
            ],
          },
          {
            id: 'date',
            label: 'Date',
            value: dateFilter,
            onChange: (value) => {
              setDateFilter(value);
              setPage(1);
            },
            options: [
              { value: 'all', label: 'All dates' },
              { value: '24h', label: 'Last 24 hours' },
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
            ],
          },
        ]}
      />

      <DataTable
        columns={[
          {
            key: 'time',
            header: 'Timestamp',
            render: (record) => formatDateTime(record.created_at),
          },
          {
            key: 'severity',
            header: 'Severity',
            render: (record) => <SeverityBadge severity={inferSeverity(record)} />,
          },
          {
            key: 'actor',
            header: 'User',
            render: (record) => (
              <div>
                <p className="break-words font-semibold text-stone-950">{record.user_name || record.user_email || 'System'}</p>
                <p className="break-all text-xs text-stone-500">{record.user_email || '-'}</p>
                <div className="mt-2">
                  <StatusBadge status="draft">{labelize(record.user_role || 'system')}</StatusBadge>
                </div>
              </div>
            ),
          },
          {
            key: 'action',
            header: 'Action history',
            render: (record) => (
              <div>
                <p className="break-words font-semibold text-stone-950">{labelize(record.action)}</p>
                <p className="mt-1 break-all rounded bg-stone-50 px-1.5 py-0.5 font-mono text-xs text-stone-500">{record.action}</p>
              </div>
            ),
          },
          {
            key: 'resource',
            header: 'Resource',
            render: (record) => [record.resource_type, record.resource_id].filter(Boolean).join(' #') || record.source || '-',
          },
          {
            key: 'ip_address',
            header: 'IP address',
            render: (record) => record.ip_address || '-',
          },
        ]}
        rows={rows}
        getRowKey={(record) => record.id}
        loading={loading}
        page={page}
        pageSize={12}
        onPageChange={setPage}
        emptyTitle="No audit activity"
        emptyBody="No audit or security records match the current filters."
      />
    </div>
  );
}
