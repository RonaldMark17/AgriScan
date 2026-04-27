import { ArrowRight, Bell, CloudSun, Languages, Leaf, LockKeyhole, Mail, Mic, ShieldCheck, Sprout } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginHeroImage } from '../assets/visuals/index.js';
import CaptchaChallenge from '../components/auth/CaptchaChallenge.jsx';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', device_name: 'AgriScan PWA' });
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const heroFeatures = [
    { icon: Sprout, label: t('realTimeSoilData') },
    { icon: CloudSun, label: t('aiCropRecommendations') },
    { icon: Languages, label: t('multilingualSupport') },
  ];

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login({ ...form, captcha_token: captchaToken });
      if (result.status === 'ok') {
        navigate(location.state?.from?.pathname || '/', { replace: true });
      } else if (result.status === 'mfa_required') {
        navigate('/mfa', { state: { mfaToken: result.mfa_token, user: result.user } });
      } else if (result.status === 'mfa_setup_required') {
        navigate('/mfa/setup', { state: { setupToken: result.setup_token, user: result.user } });
      } else if (result.status === 'captcha_required') {
        setCaptchaRequired(true);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Login failed. Please check your credentials.'));
      if (requestError.response?.status === 401) {
        setCaptchaRequired(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh bg-[linear-gradient(180deg,#f2faf3_0%,#fbfbf9_48%,#f7faf6_100%)] p-4 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100svh-2rem)] max-w-7xl overflow-hidden rounded-[28px] border border-stone-200/90 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,1.08fr)_460px]">
        <section className="relative hidden overflow-hidden bg-leaf-950 lg:block">
          <img src={loginHeroImage} alt="Farmer using AgriScan in a rice field" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(112deg,rgba(15,23,42,0.62)_0%,rgba(20,83,45,0.42)_42%,rgba(22,163,74,0.14)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.18),transparent_24%),radial-gradient(circle_at_84%_14%,rgba(255,255,255,0.24),transparent_20%)]" />

          <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
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
              <h1 className="text-5xl font-bold leading-[1.05] text-white xl:text-6xl">
                {t('heroHeadline')}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/88">
                {t('heroBody')}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:max-w-xl">
                {heroFeatures.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/18 bg-white/10 px-4 py-3 text-white backdrop-blur-sm">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/14">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold">{label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3 xl:max-w-2xl">
                {[
                  ['AI', t('aiCropRecommendations')],
                  ['SOIL', t('realTimeSoilData')],
                  ['EN/PH', t('multilingualSupport')],
                ].map(([value, label]) => (
                  <div key={value} className="rounded-2xl border border-white/16 bg-black/18 px-4 py-4 backdrop-blur-sm">
                    <p className="text-2xl font-bold text-white">{value}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/70">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-[#fcfcfa] px-4 py-6 sm:px-8 lg:px-10">
          <div className="w-full max-w-md">
            <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="border-b border-stone-100 px-6 pb-5 pt-6 sm:px-7">
                <div className="flex items-center justify-between gap-4">
                  <Link to="/" className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-leaf-600 text-white shadow-[0_10px_24px_rgba(22,163,74,0.28)]">
                      <Leaf className="h-6 w-6" />
                    </span>
                    <div>
                      <span className="block text-xl font-bold text-leaf-700">AgriScan</span>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-stone-400">PWA</span>
                    </div>
                  </Link>
                  <LanguageToggle />
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl lg:hidden">
                  <div className="relative h-40">
                    <img src={loginHeroImage} alt="Farmer using AgriScan in a rice field" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-[linear-gradient(130deg,rgba(15,23,42,0.62),rgba(22,163,74,0.25))]" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <p className="max-w-xs text-xl font-bold leading-tight text-white">{t('heroHeadline')}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-leaf-100 bg-leaf-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-leaf-600">
                        <Mic className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-leaf-950">{t('voiceAssistantReady')}</p>
                        <p className="text-xs font-medium text-leaf-800/70">{t('loginVoiceReadyBody')}</p>
                      </div>
                    </div>
                    <Bell className="h-5 w-5 shrink-0 text-leaf-600" />
                  </div>
                </div>
              </div>

              <form className="px-6 pb-6 pt-5 sm:px-7 sm:pb-7" onSubmit={handleSubmit}>
                <h2 className="text-3xl font-bold tracking-normal text-stone-950">{t('login')}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">{t('loginSubtitle')}</p>

                {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

                <label className="mt-6 block text-sm font-semibold text-stone-700">{t('email')}</label>
                <div className="mt-2 flex h-14 items-center rounded-xl border border-stone-300 bg-white px-4 transition focus-within:border-leaf-600 focus-within:ring-2 focus-within:ring-leaf-100">
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
                <div className="mt-2 flex h-14 items-center rounded-xl border border-stone-300 bg-white px-4 transition focus-within:border-leaf-600 focus-within:ring-2 focus-within:ring-leaf-100">
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

                {captchaRequired && (
                  <div className="mt-4">
                    <CaptchaChallenge onSolved={setCaptchaToken} />
                  </div>
                )}

                <button className="btn-primary mt-6 h-14 w-full rounded-xl text-base shadow-[0_14px_28px_rgba(22,163,74,0.24)]" disabled={loading || (captchaRequired && !captchaToken)}>
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
          </div>
        </section>
      </div>
    </main>
  );
}
