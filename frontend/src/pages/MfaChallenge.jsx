import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function MfaChallenge() {
  const { verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mfaToken = location.state?.mfaToken;
  const rememberMe = Boolean(location.state?.rememberMe);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyMfa({ mfa_token: mfaToken, code, device_name: 'AgriScan PWA', remember_me: rememberMe });
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Invalid MFA code.'));
    } finally {
      setLoading(false);
    }
  }

  if (!mfaToken) {
    return (
      <main className="auth-page grid place-items-center">
        <div className="auth-card w-full max-w-md p-5 text-center sm:p-6">
          <div className="icon-tile mx-auto">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-xl font-bold">MFA session expired</h1>
          <Link className="btn-primary mt-5 w-full" to="/login">Return to login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page grid place-items-center">
      <form className="auth-card w-full max-w-md p-5 sm:p-6" onSubmit={submit}>
        <div className="icon-tile">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-950">Authenticator code</h1>
        <p className="mt-1 text-sm text-stone-500">Enter the 6-digit code from Google Authenticator, Microsoft Authenticator, or a recovery code.</p>
        {error && <div className="danger-message mt-4">{error}</div>}
        <input
          className="field mt-5 text-center text-xl font-bold tracking-[0.18em] sm:text-2xl sm:tracking-[0.3em]"
          autoComplete="one-time-code"
          aria-label="Authenticator or recovery code"
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          required
        />
        <button className="btn-primary mt-5 w-full" disabled={loading}>{loading ? 'Verifying...' : 'Verify and continue'}</button>
      </form>
    </main>
  );
}
