import { AlertTriangle, ArrowRight, Clock3, FileText, Leaf, LogOut, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

const SUSPENSION_NOTICE =
  'Your account has been temporarily suspended due to suspicious activity. Please contact the administrator or submit an appeal request.';

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : 'Not set';
}

export default function AccountSuspended() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [statusInfo, setStatusInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    explanation: '',
    supporting_message: '',
    updated_information: '',
  });

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      setLoading(true);
      try {
        const { data } = await api.get('/account/status');
        if (!active) return;
        setStatusInfo(data);
        if (data.account_status === 'active') {
          navigate('/', { replace: true });
        }
      } catch (requestError) {
        if (!active) return;
        setError(getDetailedApiErrorMessage(requestError, 'Could not load account status.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStatus();

    return () => {
      active = false;
    };
  }, [navigate]);

  async function submitAppeal(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/account/appeals', form);
      setSuccess(data.message || 'Your appeal request has been submitted.');
      const statusResponse = await api.get('/account/status');
      setStatusInfo(statusResponse.data);
      setForm({ explanation: '', supporting_message: '', updated_information: '' });
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Could not submit appeal request.', {
        title: 'Appeal could not be submitted.',
        action: 'Confirm you have no pending request and provide a clear explanation before trying again.',
      }));
    } finally {
      setSubmitting(false);
    }
  }

  const suspension = statusInfo?.suspension;
  const pendingAppeal = statusInfo?.pending_appeal;
  const statusLabel = (statusInfo?.account_status || user?.account_status || 'suspended').replace(/_/g, ' ');

  return (
    <main className="auth-page min-h-svh px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100svh-2.5rem)] w-full max-w-5xl content-center gap-5">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="brand-mark">
              <Leaf className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-leaf-700">AgriScan</p>
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Account security review</p>
            </div>
          </div>
          <button className="btn-secondary shrink-0" type="button" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </header>

        <section className="surface overflow-hidden rounded-lg">
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-amber-700 ring-1 ring-amber-100">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="eyebrow">Temporary access restriction</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-normal text-stone-950 sm:text-3xl">
                    Account suspended
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700">
                    {SUSPENSION_NOTICE}
                  </p>
                </div>
              </div>
              <span className="status-pill border border-amber-200 bg-white text-amber-800 capitalize">
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.78fr)]">
            <div className="space-y-4">
              {loading ? <div className="state-message">Loading account status...</div> : null}
              {error ? <div className="danger-message">{error}</div> : null}
              {success ? <div className="success-message">{success}</div> : null}

              <div className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-1 h-5 w-5 shrink-0 text-leaf-700" />
                  <div className="min-w-0">
                    <h2 className="section-title">Suspension details</h2>
                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-bold text-stone-500">Reason</dt>
                        <dd className="mt-1 break-words text-stone-900">{suspension?.reason || 'Security review'}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-stone-500">Logged at</dt>
                        <dd className="mt-1 text-stone-900">{formatDateTime(suspension?.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-stone-500">Review until</dt>
                        <dd className="mt-1 text-stone-900">{formatDateTime(statusInfo?.account_status_until || suspension?.ends_at)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-stone-500">Account</dt>
                        <dd className="mt-1 break-all text-stone-900">{user?.email || 'Current user'}</dd>
                      </div>
                    </dl>
                    {suspension?.description ? (
                      <p className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
                        {suspension.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-1 h-5 w-5 shrink-0 text-leaf-700" />
                  <div>
                    <h2 className="section-title">Next steps</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      Submit one review request with a clear explanation and updated account information. An administrator will review your appeal and reactivate access if the restriction is resolved.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <h2 className="section-title">Appeal Suspension</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Explain what happened and include any corrected information for administrator review.
                  </p>
                </div>
              </div>

              {pendingAppeal ? (
                <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-bold">Review request pending</p>
                  <p className="mt-1 leading-6">Submitted {formatDateTime(pendingAppeal.created_at)}. You will be notified when an administrator decides.</p>
                </div>
              ) : (
                <form className="mt-4 space-y-3" onSubmit={submitAppeal}>
                  <label className="block text-sm font-bold text-stone-700">
                    Explanation
                    <textarea
                      className="field mt-2 min-h-28 resize-y"
                      required
                      minLength={10}
                      maxLength={2000}
                      value={form.explanation}
                      onChange={(event) => setForm((current) => ({ ...current, explanation: event.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-bold text-stone-700">
                    Supporting message
                    <textarea
                      className="field mt-2 min-h-24 resize-y"
                      maxLength={2000}
                      value={form.supporting_message}
                      onChange={(event) => setForm((current) => ({ ...current, supporting_message: event.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-bold text-stone-700">
                    Updated information
                    <textarea
                      className="field mt-2 min-h-24 resize-y"
                      maxLength={2000}
                      value={form.updated_information}
                      onChange={(event) => setForm((current) => ({ ...current, updated_information: event.target.value }))}
                    />
                  </label>
                  <button className="btn-primary w-full" type="submit" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Request Review'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
