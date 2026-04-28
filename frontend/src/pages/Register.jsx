import { Leaf, Loader2 } from 'lucide-react';
import { useState } from 'react';
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
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

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f7faf6] px-3 py-6 sm:px-4 sm:py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-leaf-800 text-white">
              <Leaf className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-leaf-900">AgriScan</p>
              <p className="text-sm text-stone-500">{t('farmerBuyerRegistration')}</p>
            </div>
          </div>
          <LanguageToggle />
        </div>

        <form className="surface grid rounded-lg lg:grid-cols-[0.85fr_1.15fr]" onSubmit={handleSubmit}>
          <div className="border-b border-stone-200 bg-leaf-50 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-white text-leaf-800 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
              <Leaf className="h-7 w-7" />
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
              <span className="text-sm font-semibold text-stone-700">{t('role')}</span>
              <select className="field mt-2" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="farmer">{t('farmer')}</option>
                <option value="buyer">{t('buyer')}</option>
                <option value="inspector">{t('inspector')}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">{t('password')}</span>
              <input className="field mt-2" type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
          </div>

          <button className="btn-primary mt-6 w-full" disabled={loading}>
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
    </main>
  );
}
