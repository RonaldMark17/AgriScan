import { ArrowRight, CloudSun, Languages, Leaf, LockKeyhole, Mail, ShieldCheck, Sprout } from 'lucide-react';
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
  const heroFeatures = [
    { icon: Sprout, label: t('realTimeSoilData') },
    { icon: CloudSun, label: t('aiCropRecommendations') },
    { icon: Languages, label: t('multilingualSupport') },
  ];
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
    <main className="min-h-svh overflow-hidden bg-[#f1f6ef] p-0 sm:p-4">
      <div className="mx-auto grid min-h-svh max-w-7xl overflow-hidden bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:min-h-[calc(100svh-2rem)] sm:rounded-lg sm:border sm:border-stone-200/90 lg:h-[calc(100svh-2rem)] lg:grid-cols-[minmax(0,1.12fr)_440px]">
        <section className="relative hidden overflow-hidden bg-leaf-950 lg:block">
          <img src={loginHeroImage} alt="Farmer using AgriScan in a rice field" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(112deg,rgba(15,23,42,0.66)_0%,rgba(20,83,45,0.45)_46%,rgba(22,163,74,0.16)_100%)]" />

          <div className="relative flex h-full flex-col justify-between p-8 xl:p-10">
            <div className="flex items-center gap-3 text-white">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur">
                <Leaf className="h-7 w-7" />
              </span>
              <div>
                <span className="text-2xl font-bold tracking-normal">AgriScan</span>
                <p className="text-sm font-medium text-white/80">{t('loginHeroEyebrow')}</p>
              </div>
            </div>

            <div className="max-w-2xl pb-2">
              <h1 className="max-w-xl text-5xl font-bold leading-[1.05] text-white xl:text-6xl">
                {t('heroHeadline')}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/90">
                {t('heroBody')}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {heroFeatures.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex min-h-20 items-center gap-3 rounded-lg border border-white/18 bg-white/10 px-4 py-3 text-white backdrop-blur-sm">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/14">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 items-center justify-center overflow-y-auto bg-[#fcfcfa] px-5 py-6 sm:px-8 lg:px-10">
          <div className="w-full max-w-[420px]">
            <div className="flex items-center justify-between gap-4">
              <Link to="/" className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-leaf-600 text-white shadow-[0_10px_24px_rgba(22,163,74,0.28)]">
                  <Leaf className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-xl font-bold text-leaf-700">AgriScan</span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-stone-400">PWA</span>
                </div>
              </Link>
              <LanguageToggle />
            </div>

            <div className="mt-6 overflow-hidden rounded-lg lg:hidden">
              <div className="relative h-36">
                <img src={loginHeroImage} alt="Farmer using AgriScan in a rice field" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(15,23,42,0.66),rgba(22,163,74,0.24))]" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="max-w-xs text-xl font-bold leading-tight text-white">{t('heroHeadline')}</p>
                </div>
              </div>
            </div>

            <form className="mt-8" onSubmit={handleSubmit}>
              <h2 className="text-3xl font-bold tracking-normal text-stone-950">{t('login')}</h2>
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

              <button className="btn-primary mt-6 h-14 w-full text-base shadow-[0_14px_28px_rgba(22,163,74,0.24)]" disabled={loading}>
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
