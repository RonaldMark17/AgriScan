import { CheckCircle2, ChevronLeft, ChevronRight, Flag, Loader2, RefreshCw, RotateCcw, ShieldCheck, UserRoundCheck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

const FLAGGED_REVIEWS_PAGE_SIZE = 4;
const REVIEW_STATUS_ORDER = {
  pending: 0,
  verified: 1,
  rejected: 1,
};

function sortFlaggedReviews(reviews) {
  return [...reviews].sort((first, second) => {
    const firstOrder = REVIEW_STATUS_ORDER[first.verification_status] ?? 2;
    const secondOrder = REVIEW_STATUS_ORDER[second.verification_status] ?? 2;
    if (firstOrder !== secondOrder) return firstOrder - secondOrder;
    return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
  });
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [farms, setFarms] = useState([]);
  const [flaggedReviews, setFlaggedReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [userActionError, setUserActionError] = useState('');
  const [reviewDecision, setReviewDecision] = useState(null);
  const [reviewActionError, setReviewActionError] = useState('');
  const [flaggedPage, setFlaggedPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const [usersResponse, farmsResponse, flaggedReviewsResponse] = await Promise.all([
        api.get('/users'),
        api.get('/admin/pending-farms'),
        api.get('/admin/flagged-reviews'),
      ]);
      setUsers(usersResponse.data);
      setFarms(farmsResponse.data);
      setFlaggedReviews(sortFlaggedReviews(flaggedReviewsResponse.data));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(flaggedReviews.length / FLAGGED_REVIEWS_PAGE_SIZE));
    setFlaggedPage((current) => Math.min(Math.max(current, 1), pageCount));
  }, [flaggedReviews.length]);

  async function approveFarm(id) {
    setApprovingId(id);
    try {
      await api.patch(`/farms/${id}/approve`);
      await load();
    } finally {
      setApprovingId(null);
    }
  }

  async function toggleUserActive(targetUser) {
    setTogglingUserId(targetUser.id);
    setUserActionError('');
    try {
      const { data } = await api.patch(`/users/${targetUser.id}`, { is_active: !targetUser.is_active });
      setUsers((current) => current.map((item) => (item.id === targetUser.id ? data : item)));
    } catch (error) {
      setUserActionError(getApiErrorMessage(error, t('accountActionFailed')));
    } finally {
      setTogglingUserId(null);
    }
  }

  async function decideFlaggedReview(id, decision) {
    const decisionKey = `${decision}-${id}`;
    setReviewDecision(decisionKey);
    setReviewActionError('');
    try {
      const { data } = await api.patch(`/admin/flagged-reviews/${id}/${decision}`);
      setFlaggedReviews((current) => sortFlaggedReviews(current.map((review) => (review.id === id ? data : review))));
    } catch (error) {
      setReviewActionError(getApiErrorMessage(error, t('reviewActionFailed')));
    } finally {
      setReviewDecision(null);
    }
  }

  function reviewStatusClass(status) {
    if (status === 'verified') return 'bg-leaf-50 text-leaf-800';
    if (status === 'pending') return 'bg-amber-50 text-amber-800';
    if (status === 'rejected') return 'bg-red-50 text-red-700';
    return 'bg-stone-100 text-stone-700';
  }

  function reviewStatusLabel(status) {
    if (status === 'pending') return t('pending');
    if (status === 'verified') return t('accepted');
    if (status === 'rejected') return t('rejected');
    return status || t('status');
  }

  const flaggedPageCount = Math.max(1, Math.ceil(flaggedReviews.length / FLAGGED_REVIEWS_PAGE_SIZE));
  const flaggedStartIndex = (flaggedPage - 1) * FLAGGED_REVIEWS_PAGE_SIZE;
  const orderedFlaggedReviews = sortFlaggedReviews(flaggedReviews);
  const visibleFlaggedReviews = orderedFlaggedReviews.slice(flaggedStartIndex, flaggedStartIndex + FLAGGED_REVIEWS_PAGE_SIZE);
  const flaggedShowingStart = flaggedReviews.length === 0 ? 0 : flaggedStartIndex + 1;
  const flaggedShowingEnd = Math.min(flaggedStartIndex + FLAGGED_REVIEWS_PAGE_SIZE, flaggedReviews.length);

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
      <div className="content-sidebar-layout">
        <div className="space-y-5">
          <section className="surface rounded-lg p-4 sm:p-5">
            <h2 className="section-title flex items-center gap-2">
              <UserRoundCheck className="h-5 w-5 text-leaf-700" />
              {t('userManagement')}
            </h2>
            {userActionError ? <div className="danger-message mt-4">{userActionError}</div> : null}
            <div className="table-shell mt-4">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="w-[30%] px-4 py-3">{t('name')}</th>
                    <th className="w-[14%] px-4 py-3">{t('role')}</th>
                    <th className="w-[14%] px-4 py-3">{t('status')}</th>
                    <th className="w-[24%] px-4 py-3">{t('lastLogin')}</th>
                    <th className="w-[18%] px-4 py-3 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.map((user) => {
                    const isCurrentUser = user.id === currentUser?.id;
                    const toggleLabel = user.is_active ? t('disableAccount') : t('enableAccount');
                    return (
                      <tr key={user.id} className="transition hover:bg-stone-50/70">
                        <td className="px-4 py-3 align-top">
                          <p className="break-words font-semibold text-stone-900">{user.full_name}</p>
                          <p className="break-all text-xs text-stone-500">{user.email}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="status-pill bg-stone-100 text-stone-700">{user.role.name}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`status-pill ${user.is_active ? 'bg-leaf-50 text-leaf-800' : 'bg-red-50 text-red-700'}`}>
                            {user.is_active ? t('active') : t('disabled')}
                          </span>
                        </td>
                        <td className="break-words px-4 py-3 align-top text-stone-600">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}</td>
                        <td className="px-4 py-3 text-right align-top">
                          <button
                            className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                              user.is_active
                                ? 'border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50'
                                : 'border-leaf-200 bg-leaf-50 text-leaf-800 hover:border-leaf-300 hover:bg-leaf-100'
                            }`}
                            type="button"
                            onClick={() => toggleUserActive(user)}
                            disabled={togglingUserId !== null || isCurrentUser}
                            title={isCurrentUser ? t('cannotDisableOwnAccount') : toggleLabel}
                          >
                            {togglingUserId === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : user.is_active ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            {toggleLabel}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {users.length === 0 ? (
                <div className="p-4">
                  <EmptyState title={t('noUsersFound')} body={t('usersAppearAfterRegistration')} />
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface rounded-lg p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h2 className="section-title flex items-center gap-2">
                <Flag className="h-5 w-5 text-leaf-700" />
                {t('flaggedReviews')}
              </h2>
              <span className="status-pill border border-stone-200 bg-white text-stone-700">
                {flaggedReviews.length} {t('total')}
              </span>
            </div>
            {reviewActionError ? <div className="danger-message mt-4">{reviewActionError}</div> : null}
            {flaggedReviews.length === 0 ? (
              <div className="mt-4">
                <EmptyState title={t('noFlaggedReviews')} body={t('flaggedReviewsBody')} />
              </div>
            ) : (
              <>
                <div className="flagged-review-board mt-4">
                  <div className="flagged-review-header">
                    <span>{t('review')}</span>
                    <span>{t('originalResult')}</span>
                    <span>{t('correctedResult')}</span>
                    <span className="text-right">{t('decision')}</span>
                  </div>
                  <div>
                    {visibleFlaggedReviews.map((review) => {
                      const isPending = review.verification_status === 'pending';
                      const isDecided = !isPending;
                      return (
                        <article key={review.id} className="flagged-review-row">
                          <div className="flagged-review-person">
                            <div className="flagged-review-image">
                              {review.image_url ? (
                                <img
                                  src={review.image_url}
                                  alt={t('scanImage')}
                                  className="h-full w-full object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-stone-900" title={review.user_name}>{review.user_name}</p>
                              <p className="truncate text-xs text-stone-500" title={review.user_email}>{review.user_email}</p>
                              <p className="mt-1 text-[11px] font-medium leading-4 text-stone-400">{new Date(review.created_at).toLocaleString()}</p>
                              {review.duplicate_count > 1 ? (
                                <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                                  {t('mergedDuplicates', { count: review.duplicate_count })}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flagged-review-block">
                            <p className="flagged-review-mobile-label">{t('originalResult')}</p>
                            <p className="text-wrap-anywhere text-xs font-bold uppercase tracking-wide text-stone-400">
                              {review.original_crop_label || '-'}
                            </p>
                            <p className="mt-1 text-wrap-anywhere font-semibold text-stone-900">{review.original_disease_name}</p>
                          </div>

                          <div className="flagged-review-block">
                            <p className="flagged-review-mobile-label">{t('correctedResult')}</p>
                            <p className="text-wrap-anywhere text-xs font-bold uppercase tracking-wide text-stone-400">
                              {review.corrected_crop_label}
                            </p>
                            <p className="mt-1 text-wrap-anywhere font-semibold text-stone-900">{review.corrected_disease_name}</p>
                            {review.user_note ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                                {t('note')}: {review.user_note}
                              </p>
                            ) : null}
                            {review.verification_reason ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                                {t('verificationReason')}: {review.verification_reason}
                              </p>
                            ) : null}
                          </div>

                          <div className="flagged-review-actions">
                            <span className={`status-pill ${reviewStatusClass(review.verification_status)}`}>
                              {reviewStatusLabel(review.verification_status)}
                            </span>
                            {isPending ? (
                              <div className="flagged-review-action-buttons">
                                <button
                                  className="btn-primary min-h-9 px-3 py-1.5 text-xs"
                                  type="button"
                                  onClick={() => decideFlaggedReview(review.id, 'accept')}
                                  disabled={reviewDecision !== null}
                                >
                                  {reviewDecision === `accept-${review.id}` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                  {t('acceptReview')}
                                </button>
                                <button
                                  className="btn-secondary min-h-9 border-red-200 px-3 py-1.5 text-xs text-red-700 hover:border-red-300 hover:bg-red-50"
                                  type="button"
                                  onClick={() => decideFlaggedReview(review.id, 'reject')}
                                  disabled={reviewDecision !== null}
                                >
                                  {reviewDecision === `reject-${review.id}` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <XCircle className="h-4 w-4" />
                                  )}
                                  {t('rejectReview')}
                                </button>
                              </div>
                            ) : null}
                            {isDecided ? (
                              <button
                                className="btn-secondary min-h-9 w-full px-3 py-1.5 text-xs"
                                type="button"
                                onClick={() => decideFlaggedReview(review.id, 'undo')}
                                disabled={reviewDecision !== null}
                              >
                                {reviewDecision === `undo-${review.id}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                                {t('undoDecision')}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-stone-600">
                    {t('paginationSummary', { start: flaggedShowingStart, end: flaggedShowingEnd, total: flaggedReviews.length })}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                      type="button"
                      onClick={() => setFlaggedPage((current) => Math.max(1, current - 1))}
                      disabled={flaggedPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t('previous')}
                    </button>
                    <span className="status-pill border border-stone-200 bg-white text-stone-700">
                      {t('pageOf', { page: flaggedPage, total: flaggedPageCount })}
                    </span>
                    <button
                      className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                      type="button"
                      onClick={() => setFlaggedPage((current) => Math.min(flaggedPageCount, current + 1))}
                      disabled={flaggedPage >= flaggedPageCount}
                    >
                      {t('next')}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

        </div>

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
                    <p className="mt-1 text-xs font-semibold text-stone-600">
                      {t('owner')}: {farm.owner_name || farm.owner_email || `User #${farm.user_id}`}
                    </p>
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

        </section>
      </div>
    </div>
  );
}
