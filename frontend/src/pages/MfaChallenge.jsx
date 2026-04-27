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
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyMfa({ mfa_token: mfaToken, code, device_name: 'AgriScan PWA' });
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Invalid MFA code.'));
    } finally {
      setLoading(false);
    }
  }

  if (!mfaToken) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="surface max-w-md rounded-lg p-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-leaf-700" />
          <h1 className="mt-3 text-xl font-bold">MFA session expired</h1>
          <Link className="btn-primary mt-5" to="/login">Return to login</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form className="surface w-full max-w-md rounded-lg p-6" onSubmit={submit}>
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-leaf-100 text-leaf-800">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-stone-950">Authenticator code</h1>
        <p className="mt-1 text-sm text-stone-500">Enter the 6-digit code from Google Authenticator, Microsoft Authenticator, or a recovery code.</p>
        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
        <input
          className="field mt-5 text-center text-2xl font-bold tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          required
        />
        <button className="btn-primary mt-5 w-full" disabled={loading}>{loading ? 'Verifying...' : 'Verify and continue'}</button>
      </form>
    </main>
  );
}
