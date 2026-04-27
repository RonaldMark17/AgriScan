import { Copy, QrCode, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function MfaSetup() {
  const location = useLocation();
  const { saveTokensFromMfaSetup, accessToken, user: currentUser } = useAuth();
  const setupToken = location.state?.setupToken || null;
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .post('/auth/mfa/setup', { setup_token: setupToken })
      .then(({ data }) => {
        if (active) setSetup(data);
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, 'Could not start MFA setup.')));
    return () => {
      active = false;
    };
  }, [setupToken]);

  async function verify(event) {
    event.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/mfa/verify-setup', { setup_token: setupToken, code });
      setRecoveryCodes(data.recovery_codes || []);
      if (data.access_token) {
        saveTokensFromMfaSetup({
          ...data,
          user: {
            ...(location.state?.user || currentUser || {}),
            mfa_enabled: true,
          },
        });
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Invalid setup code.'));
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="surface w-full max-w-2xl rounded-lg p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-leaf-100 text-leaf-800">
            <QrCode className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-950">Set up MFA</h1>
            <p className="text-sm text-stone-500">Scan the QR code with Google Authenticator or Microsoft Authenticator.</p>
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

        {!setup && !error && <p className="mt-6 text-sm text-stone-500">Generating secure authenticator secret...</p>}

        {setup && !recoveryCodes.length && (
          <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <img src={setup.qr_code_data_url} alt="MFA QR code" className="h-52 w-52" />
            </div>
            <form onSubmit={verify}>
              <label className="text-sm font-semibold text-stone-700">Manual secret</label>
              <div className="mt-2 flex gap-2">
                <input className="field font-mono text-xs" value={setup.secret} readOnly />
                <button type="button" className="btn-icon" onClick={() => navigator.clipboard?.writeText(setup.secret)} aria-label="Copy secret">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <label className="mt-5 block text-sm font-semibold text-stone-700">6-digit code</label>
              <input className="field mt-2 text-center text-2xl font-bold tracking-[0.3em]" value={code} onChange={(event) => setCode(event.target.value.trim())} required />
              <button className="btn-primary mt-5 w-full">Enable MFA</button>
            </form>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div className="mt-6">
            <div className="rounded-lg bg-leaf-50 p-4 text-leaf-900">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="h-5 w-5" />
                MFA is enabled
              </div>
              <p className="mt-1 text-sm">Save these recovery codes. Each code can be used once if your authenticator device is unavailable.</p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((item) => (
                <code key={item} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">{item}</code>
              ))}
            </div>
            <Link className="btn-primary mt-6" to={accessToken || setupToken ? '/' : '/login'} replace>
              Continue
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
