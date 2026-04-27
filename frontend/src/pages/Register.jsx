import { Leaf } from 'lucide-react';
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
      setMessage('Account created. You can now log in.');
      window.setTimeout(() => navigate('/login'), 900);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-leaf-800 text-white">
              <Leaf className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-bold text-leaf-900">AgriScan</p>
              <p className="text-sm text-stone-500">Farmer and buyer registration</p>
            </div>
          </div>
          <LanguageToggle />
        </div>

        <form className="surface rounded-lg p-6" onSubmit={handleSubmit}>
          <h1 className="text-2xl font-bold text-stone-950">{t('register')}</h1>
          <p className="mt-1 text-sm text-stone-500">Strong passwords are required for account protection.</p>

          {message && <div className="mt-4 rounded-lg bg-leaf-50 p-3 text-sm font-medium text-leaf-800">{message}</div>}
          {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

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
              <span className="text-sm font-semibold text-stone-700">Phone</span>
              <input className="field mt-2" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">{t('role')}</span>
              <select className="field mt-2" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="farmer">Farmer</option>
                <option value="buyer">Buyer</option>
                <option value="inspector">Inspector / Agriculture Staff</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">{t('password')}</span>
              <input className="field mt-2" type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
          </div>

          <button className="btn-primary mt-6 w-full" disabled={loading}>{loading ? 'Creating...' : t('register')}</button>
          <p className="mt-4 text-center text-sm text-stone-500">
            Already registered?{' '}
            <Link className="font-semibold text-leaf-700 hover:text-leaf-900" to="/login">
              Login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
