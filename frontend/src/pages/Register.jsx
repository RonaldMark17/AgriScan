import { Leaf, Loader2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'farmer',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  useEffect(() => {
    if (!isTermsModalOpen || typeof document === 'undefined') return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsTermsModalOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTermsModalOpen]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (form.password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    if (!acceptedTerms) {
      setError(t('termsAgreementRequired'));
      return;
    }
    setLoading(true);
    try {
      await register(form);
      setMessage(t('accountCreated'));
      window.setTimeout(() => navigate('/login'), 900);
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, t('registrationFailed'), {
        title: 'Registration could not be completed.',
        action: 'Review your account details, make sure the email is not already registered, then try again.',
      }));
    } finally {
      setLoading(false);
    }
  }

  function handleTermsAccept() {
    setAcceptedTerms(true);
    setError('');
    setIsTermsModalOpen(false);
  }

  const passwordChecks = [
    { label: 'At least 12 characters', valid: form.password.length >= 12 },
    { label: 'Uppercase & lowercase letters', valid: /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) },
    { label: 'At least one number', valid: /[0-9]/.test(form.password) },
    { label: 'At least one symbol (!@#$%)', valid: /[^A-Za-z0-9]/.test(form.password) },
  ];

  return (
    <main className="auth-page grid min-h-[100dvh] place-items-center p-3 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl">
        {/* Top Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30">
              <Leaf className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xl font-extrabold tracking-tight text-slate-900">AgriScan</p>
              <p className="text-xs font-semibold text-slate-500">{t('farmerBuyerRegistration')}</p>
            </div>
          </Link>
          <LanguageToggle />
        </div>

        {/* Main Card */}
        <form className="auth-card grid overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl shadow-emerald-950/10 lg:grid-cols-[0.85fr_1.35fr]" onSubmit={handleSubmit}>
          {/* Left Hero Sidebar */}
          <div className="flex flex-col justify-between border-b border-slate-200/80 bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-900 p-6 sm:p-8 text-white lg:border-b-0 lg:border-r">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Farmer Community
              </div>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
                {t('register')}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-emerald-100/80">
                Join thousands of Filipino farmers using AI-driven early crop disease detection, soil advisory, and automated harvest tracking.
              </p>
            </div>

            {/* Feature Perks */}
            <div className="my-8 space-y-3.5">
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-md">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/30 text-emerald-300">
                  <Leaf className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Automated Crop AI</p>
                  <p className="text-[11px] text-emerald-100/70">Instant pathogen detection for rice, corn, and more.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5 backdrop-blur-md">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/30 text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Full Offline Capability</p>
                  <p className="text-[11px] text-emerald-100/70">Works in remote fields without active internet.</p>
                </div>
              </div>
            </div>

            {/* Security Note */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-emerald-200/80">
              <span className="font-semibold text-emerald-300">Enterprise Security:</span> Argon2id encryption & optional hardware MFA protection.
            </div>
          </div>

          {/* Right Form Fields */}
          <div className="p-6 sm:p-8">
            {message && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 shadow-sm">
                {message}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 shadow-sm">
                {error}
              </div>
            )}

            <div className="space-y-5">
              {/* Personal Information */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">1. Personal Information</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700">{t('fullName')}</label>
                    <input
                      className="field mt-1.5"
                      placeholder="Juan Dela Cruz"
                      required
                      value={form.full_name}
                      onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700">{t('email')}</label>
                    <input
                      className="field mt-1.5"
                      type="email"
                      placeholder="juan@agriscan.ph"
                      required
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      {t('smsPhoneLabel')} <span className="font-normal text-slate-400">({t('optional')})</span>
                    </label>
                    <input
                      className="field mt-1.5"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      placeholder="+639171234567"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>

              {/* Account Credentials */}
              <div className="border-t border-slate-100 pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">2. Security & Credentials</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">{t('password')}</label>
                    <input
                      className="field mt-1.5"
                      type="password"
                      placeholder="••••••••••••"
                      required
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700">{t('confirmPassword')}</label>
                    <input
                      className="field mt-1.5"
                      type="password"
                      placeholder="••••••••••••"
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </div>
                </div>

                {/* Password Criteria checklist */}
                {form.password && (
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    {passwordChecks.map((check, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        <span className={`h-1.5 w-1.5 rounded-full ${check.valid ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className={check.valid ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Terms and Conditions */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{t('termsAndConditions')}</h3>
                    <p className="text-xs text-slate-500">{t('termsSummary')}</p>
                  </div>
                  <button
                    className="btn-secondary h-9 shrink-0 px-3 text-xs font-bold"
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                  >
                    {t('reviewTermsAction')}
                  </button>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-white bg-white p-3 shadow-sm transition hover:bg-slate-50">
                  <input
                    id="register-terms-checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => {
                      setAcceptedTerms(event.target.checked);
                      if (event.target.checked) setError('');
                    }}
                  />
                  <span className="text-xs font-medium text-slate-700 leading-relaxed">
                    {t('termsAgreementLabelPrefix')}{' '}
                    <button
                      className="font-bold text-emerald-600 hover:underline"
                      type="button"
                      onClick={() => setIsTermsModalOpen(true)}
                    >
                      {t('termsAndConditions')}
                    </button>
                    .
                  </span>
                </label>
              </div>

              {/* Submit CTA */}
              <button
                className="btn-primary flex h-12 w-full items-center justify-center gap-2 text-base font-bold shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/35"
                disabled={loading || !acceptedTerms}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {loading ? t('creating') : t('register')}
              </button>

              <p className="text-center text-xs text-slate-500">
                {t('alreadyRegistered')}{' '}
                <Link className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline" to="/login">
                  {t('login')}
                </Link>
              </p>
            </div>
          </div>
        </form>
      </div>

      <TermsModal
        isOpen={isTermsModalOpen}
        onAccept={handleTermsAccept}
        onClose={() => setIsTermsModalOpen(false)}
        t={t}
      />
    </main>
  );
}

function TermsModal({ isOpen, onAccept, onClose, t }) {
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="crop-guide-overlay fixed inset-0 z-[140] overflow-hidden overscroll-none bg-stone-950/78 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8" onClick={onClose}>
      <div className="flex h-full items-center justify-center">
        <div
          className="crop-guide-dialog surface flex max-h-[85vh] w-[92vw] max-w-[680px] flex-col overflow-hidden rounded-lg border border-white/80 bg-white ring-1 ring-stone-950/5 sm:max-h-[82vh] sm:w-[94vw]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-modal-title"
          aria-describedby="terms-modal-summary"
        >
          <div className="crop-guide-header sticky top-0 z-20 flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-leaf-700 sm:text-sm">{t('termsAndConditions')}</p>
              <h2 id="terms-modal-title" className="mt-2 text-2xl font-bold tracking-tight text-stone-950">
                {t('termsAndConditions')}
              </h2>
              <p id="terms-modal-summary" className="mt-2 text-sm leading-6 text-stone-600">
                {t('termsSummary')}
              </p>
            </div>
            <button
              className="btn-icon h-12 w-12 bg-leaf-50 text-leaf-800 hover:border-leaf-200 hover:bg-white hover:text-leaf-900"
              type="button"
              onClick={onClose}
              aria-label={t('closeTermsModal')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="crop-guide-body min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-stone-50 via-stone-50/70 to-white px-4 py-4 sm:px-6 sm:py-6">
            <section className="rounded-lg border border-leaf-200 bg-gradient-to-br from-leaf-50 via-white to-[#ecfdf3] p-5 sm:p-6">
              <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-stone-700 sm:text-[15px]">
                <li>{t('termsPointAccurateInfo')}</li>
                <li>{t('termsPointResponsibleUse')}</li>
                <li>{t('termsPointPrivacy')}</li>
              </ul>
            </section>
          </div>

          <div className="crop-guide-footer flex shrink-0 flex-col-reverse gap-3 border-t border-stone-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            <button className="btn-secondary h-11 px-5" type="button" onClick={onClose}>
              {t('cancel')}
            </button>
            <button className="btn-primary h-11 px-5" type="button" onClick={onAccept}>
              {t('acceptTermsAndContinue')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
