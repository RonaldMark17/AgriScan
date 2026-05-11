import { Clock3, Flag, Loader2, RefreshCw, ShieldCheck, UserRoundCheck } from 'lucide-react';
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
  const [flaggedReviews, setFlaggedReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [usersResponse, logsResponse, farmsResponse, flaggedReviewsResponse] = await Promise.all([
        api.get('/users'),
        api.get('/admin/audit-logs'),
        api.get('/admin/pending-farms'),
        api.get('/admin/flagged-reviews'),
      ]);
      setUsers(usersResponse.data);
      setLogs(logsResponse.data);
      setFarms(farmsResponse.data);
      setFlaggedReviews(flaggedReviewsResponse.data);
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

  function reviewStatusClass(status) {
    if (status === 'verified') return 'bg-leaf-50 text-leaf-800';
    if (status === 'pending') return 'bg-amber-50 text-amber-800';
    return 'bg-stone-100 text-stone-700';
  }

  function reviewStatusLabel(status) {
    if (status === 'pending') return t('pending');
    if (status === 'verified') return t('success');
    return status || t('status');
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
              <Flag className="h-5 w-5 text-leaf-700" />
              {t('flaggedReviews')}
            </h2>
            {flaggedReviews.length === 0 ? (
              <div className="mt-4">
                <EmptyState title={t('noFlaggedReviews')} body={t('flaggedReviewsBody')} />
              </div>
            ) : (
              <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                {flaggedReviews.map((review) => (
                  <article key={review.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-stone-950">{review.corrected_crop_label}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {t('submittedBy')}: {review.user_name}
                        </p>
                      </div>
                      <span className={`status-pill shrink-0 ${reviewStatusClass(review.verification_status)}`}>
                        {reviewStatusLabel(review.verification_status)}
                      </span>
                    </div>

                    <div className={`mt-3 grid gap-3 ${review.image_url ? 'min-[420px]:grid-cols-[88px_minmax(0,1fr)]' : ''}`}>
                      {review.image_url ? (
                        <img
                          src={review.image_url}
                          alt={t('scanImage')}
                          className="h-20 w-full rounded-lg border border-stone-200 object-cover min-[420px]:w-[88px]"
                        />
                      ) : null}
                      <div className="space-y-2 text-xs leading-5 text-stone-600">
                        <p>
                          <span className="font-bold text-stone-800">{t('originalResult')}:</span> {review.original_disease_name}
                        </p>
                        <p>
                          <span className="font-bold text-stone-800">{t('correctedResult')}:</span> {review.corrected_disease_name}
                        </p>
                        {review.user_note ? (
                          <p>
                            <span className="font-bold text-stone-800">{t('note')}:</span> {review.user_note}
                          </p>
                        ) : null}
                        {review.verification_reason ? (
                          <p>
                            <span className="font-bold text-stone-800">{t('verificationReason')}:</span> {review.verification_reason}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-3 text-[11px] font-medium text-stone-400">
                      {new Date(review.created_at).toLocaleString()}
                    </p>
                  </article>
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
