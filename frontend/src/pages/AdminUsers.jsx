import { Clock3, Loader2, RefreshCw, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';
import { useI18n } from '../context/I18nContext.jsx';

export default function AdminUsers() {
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [usersResponse, logsResponse, farmsResponse] = await Promise.all([
        api.get('/users'),
        api.get('/admin/audit-logs'),
        api.get('/admin/pending-farms'),
      ]);
      setUsers(usersResponse.data);
      setLogs(logsResponse.data);
      setFarms(farmsResponse.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function approveFarm(id) {
    setApprovingId(id);
    try {
      await api.patch(`/farms/${id}/approve`);
      await load();
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={t('administration')}
        title={t('usersAndApprovals')}
        body={t('usersAndApprovalsBody')}
        actions={
          <button className="btn-secondary" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('refresh')}
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="surface rounded-lg p-4 sm:p-5">
          <h2 className="section-title flex items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-leaf-700" />
            {t('userManagement')}
          </h2>
          <div className="table-shell mt-4">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">{t('name')}</th>
                  <th className="px-4 py-3">{t('role')}</th>
                  <th className="px-4 py-3">{t('status')}</th>
                  <th className="px-4 py-3">{t('lastLogin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-stone-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-stone-900">{user.full_name}</p>
                      <p className="text-xs text-stone-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="status-pill bg-stone-100 text-stone-700">{user.role.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`status-pill ${user.is_active ? 'bg-leaf-50 text-leaf-800' : 'bg-red-50 text-red-700'}`}>
                        {user.is_active ? t('active') : t('disabled')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 ? (
              <div className="p-4">
                <EmptyState title={t('noUsersFound')} body={t('usersAppearAfterRegistration')} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-5">
          <div className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-leaf-700" />
              {t('pendingFarms')}
            </h2>
            {farms.length === 0 ? (
              <div className="mt-4">
                <EmptyState title={t('noPendingApprovals')} body={t('pendingFarmsBody')} />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {farms.map((farm) => (
                  <div key={farm.id} className="rounded-lg border border-stone-200 p-3">
                    <p className="font-semibold text-stone-900">{farm.name}</p>
                    <p className="text-sm text-stone-500">{farm.municipality}, {farm.province}</p>
                    <button className="btn-primary mt-3 w-full sm:w-auto" onClick={() => approveFarm(farm.id)} disabled={approvingId === farm.id}>
                      {approvingId === farm.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {t('approve')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-leaf-700" />
              {t('auditLogs')}
            </h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {logs.length === 0 ? (
                <EmptyState title={t('noAuditActivity')} body={t('auditActivityBody')} />
              ) : (
                logs.slice(0, 20).map((log) => (
                  <div key={log.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                    <p className="font-semibold text-stone-900">{log.action}</p>
                    <p className="text-xs text-stone-500">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
