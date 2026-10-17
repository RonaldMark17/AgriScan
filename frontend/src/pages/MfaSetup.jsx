import { Copy, Loader2, QrCode, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getDetailedApiErrorMessage } from '../utils/apiErrors.js';

export default function MfaSetup() {
  const location = useLocation();
  const { saveTokensFromMfaSetup, accessToken, user: currentUser } = useAuth();
  const setupToken = location.state?.setupToken || null;
  const rememberMe = Boolean(location.state?.rememberMe);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .post('/auth/mfa/setup', { setup_token: setupToken })
      .then(({ data }) => {
        if (active) setSetup(data);
      })
      .catch((requestError) => setError(getDetailedApiErrorMessage(requestError, 'Could not start MFA setup.', {
        title: 'MFA setup could not start.',
        action: 'Return to login and start MFA setup again with a fresh session.',
      })));
    return () => {
      active = false;
    };
  }, [setupToken]);

  async function verify(event) {
    event.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const { data } = await api.post('/auth/mfa/verify-setup', { setup_token: setupToken, code, remember_me: rememberMe });
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
      setError(getDetailedApiErrorMessage(requestError, 'Invalid setup code.', {
        title: 'MFA setup verification failed.',
        action: 'Enter the current authenticator code from the QR setup, then try again.',
      }));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="auth-page grid min-h-[100dvh] place-items-center p-3 sm:p-6 lg:p-8">
      <div className="auth-card w-full max-w-2xl rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-2xl shadow-emerald-950/10 sm:p-8">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30">
            <QrCode className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Set up Two-Factor Authentication</h1>
            <p className="text-xs text-slate-500">Scan the QR code with Google Authenticator or Microsoft Authenticator.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 shadow-sm animate-in fade-in">
            {error}
          </div>
        )}

        {!setup && !error && (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-slate-50 p-8 text-xs font-semibold text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            Generating secure authenticator credentials...
          </div>
        )}

        {setup && !recoveryCodes.length && (
          <div className="mt-6 grid gap-6 md:grid-cols-[230px_1fr]">
            <div className="grid place-items-center rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-white p-4 shadow-inner">
              <img src={setup.qr_code_data_url} alt="MFA QR code" className="mx-auto aspect-square w-full max-w-48 rounded-xl shadow-sm" />
            </div>
            <form className="flex flex-col justify-center space-y-4" onSubmit={verify}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Manual secret key</label>
                <div className="mt-1.5 flex gap-2">
                  <input className="field font-mono text-xs text-slate-700 tracking-wider" value={setup.secret} readOnly />
                  <button
                    type="button"
                    className="btn-secondary h-11 shrink-0 px-3 text-xs"
                    onClick={() => navigator.clipboard?.writeText(setup.secret)}
                    aria-label="Copy secret"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Enter 6-Digit Code to Confirm</label>
                <input
                  className="field mt-1.5 text-center text-2xl font-black tracking-[0.25em] text-emerald-800"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.trim())}
                  required
                />
              </div>

              <button
                className="btn-primary mt-2 flex h-12 w-full items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/35"
                disabled={verifying}
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify & Activate MFA
              </button>
            </form>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div className="mt-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                MFA successfully activated!
              </div>
              <p className="mt-1 text-xs text-emerald-800/90 leading-relaxed">
                Save these emergency recovery codes in a safe place. Each one-time code can unlock your account if you ever lose your phone.
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((item) => (
                <code key={item} className="rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-2 text-center font-mono text-xs font-bold text-slate-800 tracking-wider">
                  {item}
                </code>
              ))}
            </div>
            <Link
              className="btn-primary mt-6 flex h-12 w-full items-center justify-center text-sm font-bold shadow-lg shadow-emerald-600/25"
              to={accessToken || setupToken ? '/' : '/login'}
              replace
            >
              Continue to Dashboard
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
