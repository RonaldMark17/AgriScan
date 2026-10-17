import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';
import { getCurrentDeviceName } from '../utils/deviceName.js';

export default function MfaChallenge() {
  const { verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mfaToken = location.state?.mfaToken;
  const rememberMe = Boolean(location.state?.rememberMe);
  const deviceNameFromLogin = location.state?.deviceName;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const deviceName = deviceNameFromLogin || (await getCurrentDeviceName());
      await verifyMfa({ mfa_token: mfaToken, code, device_name: deviceName, remember_me: rememberMe });
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getDetailedApiErrorMessage(requestError, 'Invalid MFA code.', {
        title: 'MFA verification failed.',
        action: 'Enter the latest authenticator code or a valid recovery code, then try again.',
      }));
    } finally {
      setLoading(false);
    }
  }

  if (!mfaToken) {
    return (
      <main className="auth-page grid min-h-[100dvh] place-items-center p-4">
        <div className="auth-card w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/95 p-6 text-center shadow-2xl shadow-emerald-950/10 sm:p-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 shadow-inner">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">MFA session expired</h1>
          <p className="mt-1 text-xs text-slate-500">Your verification token has expired. Please sign in again.</p>
          <Link className="btn-primary mt-6 w-full shadow-lg shadow-emerald-600/25" to="/login">
            Return to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page grid min-h-[100dvh] place-items-center p-4">
      <form className="auth-card w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-2xl shadow-emerald-950/10 sm:p-8" onSubmit={submit}>
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Security Verification</h1>
            <p className="text-xs text-slate-500">Two-Factor Authentication required</p>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Enter the 6-digit code from Google Authenticator, Microsoft Authenticator, or a saved recovery code.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 shadow-sm animate-in fade-in">
            {error}
          </div>
        )}

        <div className="mt-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">6-Digit Code</label>
          <input
            className="field mt-1.5 text-center text-3xl font-black tracking-[0.3em] text-emerald-800"
            autoComplete="one-time-code"
            aria-label="Authenticator or recovery code"
            placeholder="000000"
            maxLength={10}
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
            required
            autoFocus
          />
        </div>

        <button
          className="btn-primary mt-6 flex h-12 w-full items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/35"
          disabled={loading}
        >
          {loading ? 'Verifying security code...' : 'Verify & Access Account'}
        </button>

        <div className="mt-4 text-center">
          <Link to="/login" className="text-xs font-bold text-slate-500 hover:text-emerald-700 hover:underline">
            Cancel and return to login
          </Link>
        </div>
      </form>
    </main>
  );
}
