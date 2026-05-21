import { Leaf, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import LanguageToggle from '../components/shared/LanguageToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

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
      setError(getApiErrorMessage(requestError, t('registrationFailed')));
    } finally {
      setLoading(false);
    }
  }

  function handleTermsAccept() {
    setAcceptedTerms(true);
    setError('');
    setIsTermsModalOpen(false);
  }

  return (
    <main className="auth-page flex items-center justify-center">
      <div className="w-full max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark">
              <Leaf className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-leaf-900">AgriScan</p>
              <p className="text-sm text-stone-500">{t('farmerBuyerRegistration')}</p>
            </div>
          </div>
          <LanguageToggle />
        </div>

        <form className="auth-card grid overflow-hidden lg:grid-cols-[0.72fr_1.28fr]" onSubmit={handleSubmit}>
          <div className="border-b border-stone-200 bg-stone-50 p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-stone-200 bg-white text-leaf-800">
              <Leaf className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold leading-tight text-stone-950">{t('register')}</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">{t('strongPasswordRequired')}</p>
          </div>

          <div className="p-4 sm:p-6">
            {message && <div className="success-message">{message}</div>}
            {error && <div className="danger-message">{error}</div>}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-stone-700">{t('fullName')}</span>
                <input className="field mt-2" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">{t('email')}</span>
                <input className="field mt-2" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">{t('phone')}</span>
                <input className="field mt-2" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">{t('password')}</span>
                <input
                  className="field mt-2"
                  type="password"
                  required
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">{t('confirmPassword')}</span>
                <input
                  className="field mt-2"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            </div>

            <section className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700">{t('termsAndConditions')}</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{t('termsSummary')}</p>
                </div>
                <button
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-leaf-700 transition hover:border-leaf-200 hover:bg-leaf-50 hover:text-leaf-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300"
                  type="button"
                  onClick={() => setIsTermsModalOpen(true)}
                >
                  {t('reviewTermsAction')}
                </button>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3">
                <input
                  id="register-terms-checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-leaf-700 focus:ring-leaf-600"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => {
                    setAcceptedTerms(event.target.checked);
                    if (event.target.checked) {
                      setError('');
                    }
                  }}
                />
                <div className="pt-0.5 text-sm font-semibold leading-6 text-stone-700">
                  <label className="cursor-pointer" htmlFor="register-terms-checkbox">
                    {t('termsAgreementLabelPrefix')}{' '}
                  </label>
                  <button
                    className="font-bold text-leaf-700 underline decoration-2 underline-offset-4 transition hover:text-leaf-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300"
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                  >
                    {t('termsAndConditions')}
                  </button>
                  <label className="cursor-pointer" htmlFor="register-terms-checkbox">
                    .
                  </label>
                </div>
              </div>
            </section>

            <button className="btn-primary mt-6 h-12 w-full" disabled={loading || !acceptedTerms}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? t('creating') : t('register')}
            </button>
            <p className="mt-4 text-center text-sm text-stone-500">
              {t('alreadyRegistered')}{' '}
              <Link className="font-semibold text-leaf-700 hover:text-leaf-900" to="/login">
                {t('login')}
              </Link>
            </p>
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
          className="crop-guide-dialog surface flex max-h-[85vh] w-[92vw] max-w-[680px] flex-col overflow-hidden rounded-[1.5rem] border border-white/80 bg-white ring-1 ring-stone-950/5 sm:max-h-[82vh] sm:w-[94vw]"
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
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-leaf-50 text-leaf-800 transition hover:border-leaf-200 hover:bg-white hover:text-leaf-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 active:scale-[0.98]"
              type="button"
              onClick={onClose}
              aria-label={t('closeTermsModal')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="crop-guide-body min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-stone-50 via-stone-50/70 to-white px-4 py-4 sm:px-6 sm:py-6">
            <section className="rounded-[1.35rem] border border-leaf-200 bg-gradient-to-br from-leaf-50 via-white to-[#ecfdf3] p-5 sm:p-6">
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
