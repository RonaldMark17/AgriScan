import { ArrowLeft, CheckCircle2, KeyRound, Leaf, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function ForgotPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ otp: '', new_password: '', confirm_password: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function requestCode(event) {
    event.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setCodeSent(true);
      setStatus(data?.message || t('passwordResetCodeSent'));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('passwordResetRequestFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError('');
    setStatus('');
    if (form.new_password !== form.confirm_password) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', {
        email,
        otp: form.otp,
        new_password: form.new_password,
      });
      setStatus(data?.message || t('passwordResetComplete'));
      window.setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('passwordResetFailed')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-[#f1f6ef] px-4 py-6">
      <section className="surface w-full max-w-md rounded-lg p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-leaf-700 hover:text-leaf-900">
            <ArrowLeft className="h-4 w-4" />
            {t('backToLogin')}
          </Link>
          <LanguageToggle />
        </div>

        <div className="mt-6 grid h-12 w-12 place-items-center rounded-lg bg-leaf-100 text-leaf-800">
          {codeSent ? <KeyRound className="h-7 w-7" /> : <Mail className="h-7 w-7" />}
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-950">{t('forgotPasswordTitle')}</h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">{t('forgotPasswordBody')}</p>

        {status && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{status}</span>
          </div>
        )}
        {error && <div className="danger-message mt-4">{error}</div>}

        {!codeSent ? (
          <form className="mt-6" onSubmit={requestCode}>
            <label className="block text-sm font-semibold text-stone-700">{t('email')}</label>
            <input
              className="field mt-2"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button className="btn-primary mt-5 h-12 w-full" disabled={loading}>
              {loading ? t('sendingResetCode') : t('sendResetCode')}
            </button>
          </form>
        ) : (
          <form className="mt-6" onSubmit={resetPassword}>
            <label className="block text-sm font-semibold text-stone-700">{t('resetCode')}</label>
            <input
              className="field mt-2 text-center text-xl font-bold tracking-[0.18em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={form.otp}
              onChange={(event) => setForm({ ...form, otp: event.target.value.replace(/\D/g, '').slice(0, 6) })}
              required
            />

            <label className="mt-5 block text-sm font-semibold text-stone-700">{t('newPassword')}</label>
            <input
              className="field mt-2"
              type="password"
              autoComplete="new-password"
              value={form.new_password}
              onChange={(event) => setForm({ ...form, new_password: event.target.value })}
              required
            />

            <label className="mt-5 block text-sm font-semibold text-stone-700">{t('confirmNewPassword')}</label>
            <input
              className="field mt-2"
              type="password"
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
              required
            />

            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-stone-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
              {t('strongPasswordRequired')}
            </p>

            <button className="btn-primary mt-5 h-12 w-full" disabled={loading}>
              {loading ? t('resettingPassword') : t('resetPassword')}
            </button>
            <button
              className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm font-bold text-leaf-700 hover:text-leaf-900"
              type="button"
              onClick={() => {
                setCodeSent(false);
                setStatus('');
                setError('');
              }}
            >
              <Leaf className="h-4 w-4" />
              {t('useDifferentEmail')}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
