import { ArrowLeft, CheckCircle2, KeyRound, Leaf, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';
import {
  confirmFirebasePhoneVerificationCode,
  firebasePhoneAuthTroubleshootingAction,
  firebasePhoneRecaptchaContainerId,
  sendFirebasePhoneVerificationCode,
} from '../utils/firebasePhoneAuth.js';

export default function ForgotPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [resetMethod, setResetMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [form, setForm] = useState({ otp: '', new_password: '', confirm_password: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchResetMethod(nextMethod) {
    setResetMethod(nextMethod);
    setCodeSent(false);
    setStatus('');
    setError('');
    setForm({ otp: '', new_password: '', confirm_password: '' });
  }

  async function requestCode(event) {
    event.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      if (resetMethod === 'phone') {
        await sendFirebasePhoneVerificationCode(phone);
        setCodeSent(true);
        setStatus(t('firebaseSmsCodeSent'));
        return;
      }

      const { data } = await api.post('/auth/forgot-password', { email });
      setCodeSent(true);
      setStatus(data?.message || t('passwordResetCodeSent'));
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, t('passwordResetRequestFailed'), {
        title: 'Password reset code could not be sent.',
        action: resetMethod === 'phone'
          ? firebasePhoneAuthTroubleshootingAction(requestError)
          : 'Check the email address and try again. If the account exists, use the latest reset code sent to that email.',
      }));
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
      if (resetMethod === 'phone') {
        const idToken = await confirmFirebasePhoneVerificationCode(form.otp);
        const { data } = await api.post('/auth/reset-password/phone', {
          id_token: idToken,
          new_password: form.new_password,
        });
        setStatus(data?.message || t('passwordResetComplete'));
        window.setTimeout(() => navigate('/login', { replace: true }), 1200);
        return;
      }

      const { data } = await api.post('/auth/reset-password', {
        email,
        otp: form.otp,
        new_password: form.new_password,
      });
      setStatus(data?.message || t('passwordResetComplete'));
      window.setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, t('passwordResetFailed'), {
        title: 'Password could not be reset.',
        action: resetMethod === 'phone'
          ? 'Use the latest Firebase SMS code, confirm the new passwords match, then try again.'
          : 'Use the latest valid reset code, confirm the new passwords match, then try again.',
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page grid min-h-[100dvh] place-items-center p-3 sm:p-6 lg:p-8">
      <section className="auth-card w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/95 p-6 sm:p-8 shadow-2xl shadow-emerald-950/10">
        <div className="flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition hover:-translate-x-0.5">
            <ArrowLeft className="h-4 w-4" />
            {t('backToLogin')}
          </Link>
          <LanguageToggle />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30">
            {codeSent ? <KeyRound className="h-6 w-6" /> : resetMethod === 'phone' ? <Smartphone className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{t('forgotPasswordTitle')}</h1>
            <p className="text-xs text-slate-500">{t('forgotPasswordBody')}</p>
          </div>
        </div>

        {status && (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 shadow-sm animate-in fade-in">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{status}</span>
          </div>
        )}
        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800 shadow-sm animate-in fade-in">
            {error}
          </div>
        )}

        {!codeSent ? (
          <form className="mt-6 space-y-4" onSubmit={requestCode}>
            {/* Method switcher tabs */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1">
              <button
                className={`rounded-xl py-2 text-xs font-bold transition-all ${
                  resetMethod === 'email'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                type="button"
                onClick={() => switchResetMethod('email')}
              >
                {t('resetWithEmail')}
              </button>
              <button
                className={`rounded-xl py-2 text-xs font-bold transition-all ${
                  resetMethod === 'phone'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                type="button"
                onClick={() => switchResetMethod('phone')}
              >
                {t('resetWithPhone')}
              </button>
            </div>

            {resetMethod === 'phone' ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('accountPhone')}</label>
                <input
                  className="field mt-1.5"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+639171234567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('accountEmail')}</label>
                <input
                  className="field mt-1.5"
                  type="email"
                  placeholder="farmer@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            )}
            <button
              className="btn-primary mt-2 flex h-12 w-full items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/35"
              disabled={loading}
            >
              {loading ? t('sendingResetCode') : t('sendResetCode')}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={resetPassword}>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('resetCode')}</label>
              <input
                className="field mt-1.5 text-center text-2xl font-black tracking-[0.25em] text-emerald-800"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={form.otp}
                onChange={(event) => setForm({ ...form, otp: event.target.value.replace(/\D/g, '').slice(0, 6) })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('newPassword')}</label>
              <input
                className="field mt-1.5"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                value={form.new_password}
                onChange={(event) => setForm({ ...form, new_password: event.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('confirmNewPassword')}</label>
              <input
                className="field mt-1.5"
                type="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
                required
              />
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{t('strongPasswordRequired')}</span>
            </div>

            <button
              className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/35"
              disabled={loading}
            >
              {loading ? t('resettingPassword') : t('resetPassword')}
            </button>
            <button
              className="mt-2 inline-flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-700"
              type="button"
              onClick={() => {
                setCodeSent(false);
                setStatus('');
                setError('');
              }}
            >
              <Leaf className="h-3.5 w-3.5" />
              {t('useDifferentResetMethod')}
            </button>
          </form>
        )}
        <div id={firebasePhoneRecaptchaContainerId()} />
      </section>
    </main>
  );
}
