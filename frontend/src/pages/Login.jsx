import { ArrowRight, Leaf, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginHeroImage } from '../assets/visuals/index.js';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function Login() {
  const { hasRememberedSession, isAuthenticated, login, restoreRememberedSession, sessionReady } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', device_name: 'AgriScan PWA', remember_me: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const returnTo = location.state?.from?.pathname || '/';

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!sessionReady) return;
      if (isAuthenticated) {
        navigate(returnTo, { replace: true });
        return;
      }
      if (!hasRememberedSession()) return;

      setLoading(true);
      const restored = await restoreRememberedSession();
      if (!cancelled && restored) {
        navigate(returnTo, { replace: true });
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [hasRememberedSession, isAuthenticated, navigate, restoreRememberedSession, returnTo, sessionReady]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(form);
      if (result.status === 'ok') {
        navigate(returnTo, { replace: true });
      } else if (result.status === 'mfa_required') {
        navigate('/mfa', { state: { mfaToken: result.mfa_token, user: result.user, rememberMe: form.remember_me } });
      } else if (result.status === 'mfa_setup_required') {
        navigate('/mfa/setup', { state: { setupToken: result.setup_token, user: result.user, rememberMe: form.remember_me } });
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page grid place-items-center">
      <div className="auth-card grid min-h-[calc(100svh-3rem)] w-full max-w-6xl overflow-hidden lg:min-h-[680px] lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="relative hidden overflow-hidden bg-leaf-950 lg:block">
          <img src={loginHeroImage} alt="Farmer using AgriScan in a rice field" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(112deg,rgba(15,23,42,0.72)_0%,rgba(20,83,45,0.48)_52%,rgba(15,23,42,0.18)_100%)]" />

          <div className="relative flex h-full flex-col justify-between p-8 xl:p-10">
            <div className="flex items-center gap-3 text-white">
              <span className="grid h-12 w-12 place-items-center rounded-lg border border-white/20 bg-white/10 text-white backdrop-blur">
                <Leaf className="h-7 w-7" />
              </span>
              <div>
                <span className="text-2xl font-bold tracking-normal">AgriScan</span>
                <p className="text-sm font-medium text-white/80">{t('loginHeroEyebrow')}</p>
              </div>
            </div>

            <div className="max-w-2xl pb-2">
              <p className="text-xs font-bold uppercase tracking-wide text-white/70">Farm intelligence</p>
              <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight text-white xl:text-5xl">
                {t('heroHeadline')}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/88">
                {t('heroBody')}
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 items-center justify-center overflow-y-auto bg-white px-5 py-6 sm:px-8 lg:px-10">
          <div className="w-full max-w-[420px]">
            <div className="flex items-center justify-between gap-4">
              <Link to="/" className="flex min-w-0 items-center gap-3">
                <span className="brand-mark">
                  <Leaf className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-xl font-bold text-leaf-700">AgriScan</span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-stone-400">Account access</span>
                </div>
              </Link>
              <LanguageToggle />
            </div>

            <form className="mt-8" onSubmit={handleSubmit}>
              <h2 className="text-2xl font-bold tracking-normal text-stone-950">{t('login')}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">{t('loginSubtitle')}</p>

              {error && <div className="danger-message mt-4">{error}</div>}

              <label className="mt-6 block text-sm font-semibold text-stone-700">{t('email')}</label>
              <div className="mt-2 flex h-14 items-center rounded-lg border border-stone-300 bg-white px-4 transition focus-within:border-leaf-600 focus-within:ring-2 focus-within:ring-leaf-100">
                <Mail className="h-5 w-5 shrink-0 text-stone-400" />
                <input
                  className="ml-3 w-full border-0 bg-transparent p-0 text-[15px] text-stone-900 outline-none placeholder:text-stone-400"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>

              <label className="mt-5 block text-sm font-semibold text-stone-700">{t('password')}</label>
              <div className="mt-2 flex h-14 items-center rounded-lg border border-stone-300 bg-white px-4 transition focus-within:border-leaf-600 focus-within:ring-2 focus-within:ring-leaf-100">
                <LockKeyhole className="h-5 w-5 shrink-0 text-stone-400" />
                <input
                  className="ml-3 w-full border-0 bg-transparent p-0 text-[15px] text-stone-900 outline-none placeholder:text-stone-400"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Link className="text-sm font-semibold text-leaf-700 hover:text-leaf-900" to="/forgot-password">
                  {t('forgotPassword')}
                </Link>
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 transition hover:bg-stone-50">
                <input
                  className="mt-1 h-4 w-4 shrink-0 accent-leaf-700"
                  type="checkbox"
                  checked={form.remember_me}
                  onChange={(event) => setForm({ ...form, remember_me: event.target.checked })}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-stone-800">{t('rememberMe30Days')}</span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">{t('rememberMeBody')}</span>
                </span>
              </label>

              <button className="btn-primary mt-6 h-12 w-full text-base" disabled={loading}>
                {loading ? t('signingIn') : t('accessDashboard')}
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-stone-500">
                <ShieldCheck className="h-4 w-4 text-leaf-600" />
                {t('mfaAdminRequired')}
              </div>

              <p className="mt-5 text-center text-sm text-stone-500">
                {t('newToAgriScan')}{' '}
                <Link className="font-semibold text-leaf-700 hover:text-leaf-900" to="/register">
                  {t('createAccount')}
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
