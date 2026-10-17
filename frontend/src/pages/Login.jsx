import { ArrowRight, Clock, Eye, EyeOff, Leaf, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginHeroImage } from '../assets/visuals/index.js';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getDetailedApiErrorMessage, getRetryAfterSeconds } from '../utils/apiErrors.js';
import { getCurrentDeviceName, getFallbackDeviceName } from '../utils/deviceName.js';

function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function Login() {
  const { hasRememberedSession, isAuthenticated, login, restoreRememberedSession, sessionReady } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(() => ({ email: '', password: '', device_name: getFallbackDeviceName(), remember_me: false }));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const returnTo = location.state?.from?.pathname || '/';
  const lockedOut = secondsRemaining > 0;
  const countdownLabel = formatCountdown(secondsRemaining);

  useEffect(() => {
    let cancelled = false;

    async function resolveDeviceName() {
      const deviceName = await getCurrentDeviceName();
      if (!cancelled) {
        setForm((current) => ({ ...current, device_name: deviceName }));
      }
    }

    resolveDeviceName();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lockoutUntil) {
      setSecondsRemaining(0);
      return undefined;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        setLockoutUntil(0);
      }
    }

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [lockoutUntil]);

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
    if (lockedOut) return;
    setError('');
    setLoading(true);
    try {
      const deviceName = await getCurrentDeviceName();
      const payload = { ...form, device_name: deviceName };
      const result = await login(payload);
      if (result.status === 'ok') {
        navigate(returnTo, { replace: true });
      } else if (result.status === 'mfa_required') {
        navigate('/mfa', { state: { mfaToken: result.mfa_token, user: result.user, rememberMe: payload.remember_me, deviceName } });
      } else if (result.status === 'mfa_setup_required') {
        navigate('/mfa/setup', { state: { setupToken: result.setup_token, user: result.user, rememberMe: payload.remember_me, deviceName } });
      }
    } catch (requestError) {
      const retryAfterSeconds = getRetryAfterSeconds(requestError);
      if (retryAfterSeconds) {
        setError('');
        setLockoutUntil(Date.now() + retryAfterSeconds * 1000);
        setSecondsRemaining(retryAfterSeconds);
      } else {
        setError(getDetailedApiErrorMessage(requestError, t('loginFailed'), {
          title: 'Login could not be completed.',
          action: 'Check your email, password, account status, and MFA requirement, then try again.',
        }));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page grid min-h-[100dvh] place-items-center p-3 sm:p-6 lg:p-8">
      <div className="auth-card grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl shadow-emerald-950/10 lg:min-h-[min(740px,calc(100dvh-3rem))] lg:grid-cols-[1.1fr_420px]">
        {/* Left Visual & Hero Section */}
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-950 via-stone-900 to-emerald-900 lg:block">
          <img
            src={loginHeroImage}
            alt="Farmer using AgriScan in a rice field"
            className="absolute inset-0 h-full w-full object-cover object-[20%_center] opacity-40 mix-blend-luminosity filter contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/60 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.35),transparent_60%)]" />

          <div className="relative flex h-full flex-col justify-between p-8 xl:p-12">
            {/* Top Brand Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                  <Leaf className="h-6 w-6" />
                </span>
                <div>
                  <span className="text-2xl font-extrabold tracking-tight text-white">AgriScan</span>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300/90">{t('loginHeroEyebrow')}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                AI Diagnostic v2.4
              </span>
            </div>

            {/* Middle Feature Highlights */}
            <div className="my-auto space-y-4 py-8">
              <div className="inline-block rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-md">
                Smart Agriculture Platform
              </div>
              <h1 className="max-w-lg text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
                {t('heroHeadline')}
              </h1>
              <p className="max-w-md text-base leading-relaxed text-emerald-100/80">
                {t('heroBody')}
              </p>

              {/* Telemetry Micro Cards */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-md transition-all hover:bg-white/15">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <span className="text-xl font-black">99.2%</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Accuracy</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-white/80">Validated on 10,000+ local crop disease scans</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-md transition-all hover:bg-white/15">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <span className="text-xl font-black">&lt; 1.5s</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Detection</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-white/80">Instant offline & mobile edge diagnosis</p>
                </div>
              </div>
            </div>

            {/* Bottom Footer Quote */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md">
              <p className="text-xs italic text-emerald-100/90">
                "AI-assisted field diagnosis reduces crop loss by up to 40% when detected early."
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-bold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Philippine Smart Farming Initiative
              </div>
            </div>
          </div>
        </section>

        {/* Right Form Section */}
        <section className="flex min-h-0 flex-col justify-center bg-white px-6 py-8 sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-sm">
            <div className="flex items-center justify-between gap-3">
              <Link to="/" className="flex items-center gap-2.5 lg:hidden">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/30">
                  <Leaf className="h-5 w-5" />
                </span>
                <span className="text-xl font-bold tracking-tight text-stone-900">AgriScan</span>
              </Link>
              <div className="ml-auto">
                <LanguageToggle />
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('login')}</h2>
              <p className="mt-2 text-sm text-slate-500">{t('loginSubtitle')}</p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-800 shadow-sm animate-in fade-in">
                {error}
              </div>
            )}

            {lockedOut && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-semibold text-amber-900" aria-live="polite">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <span className="min-w-0">
                  <span className="block font-bold">{t('loginLockedTitle')}</span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-amber-800">{t('loginLockedBody', { time: countdownLabel })}</span>
                </span>
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('email')}</label>
                <div className="mt-1.5 flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 transition focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/15">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    className="ml-3 w-full border-0 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                    type="email"
                    placeholder="farmer@example.com"
                    autoComplete="email"
                    required
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">{t('password')}</label>
                  <Link className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline" to="/forgot-password">
                    {t('forgotPassword')}
                  </Link>
                </div>
                <div className="mt-1.5 flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 transition focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/15">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    className="ml-3 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                  <button
                    className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    type="button"
                    aria-label={t(showPassword ? 'hidePassword' : 'showPassword')}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 transition hover:bg-slate-100/60">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
                  type="checkbox"
                  checked={form.remember_me}
                  onChange={(event) => setForm({ ...form, remember_me: event.target.checked })}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-800">{t('rememberMe30Days')}</span>
                  <span className="block text-[11px] text-slate-500">{t('rememberMeBody')}</span>
                </span>
              </label>

              <button
                className="btn-primary mt-2 flex h-12 w-full items-center justify-center gap-2 text-base font-bold shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/35"
                disabled={loading || lockedOut}
              >
                {lockedOut ? t('loginLockedButton', { time: countdownLabel }) : loading ? t('signingIn') : t('accessDashboard')}
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex items-center justify-center gap-2 pt-2 text-center text-xs font-semibold text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {t('mfaAdminRequired')}
              </div>

              <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                {t('newToAgriScan')}{' '}
                <Link className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline" to="/register">
                  {t('createAccount')}
                </Link>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
