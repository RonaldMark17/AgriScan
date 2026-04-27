import { BellRing, CheckCircle2, ClipboardList, Cloud, KeyRound, Mic, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function SecuritySettings() {
  const { user } = useAuth();
  const { language, setLanguage } = useI18n();
  const [devices, setDevices] = useState([]);
  const [pushStatus, setPushStatus] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushChecking, setPushChecking] = useState(true);
  const [syncStatus, setSyncStatus] = useState(() => localStorage.getItem('agriscan_last_sync') || 'Not synced yet');
  const [settingsStatus, setSettingsStatus] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toggles, setToggles] = useState(() => ({
    voiceAssistant: localStorage.getItem('agriscan_voice_assistant') !== 'false',
    voiceTutorials: localStorage.getItem('agriscan_voice_tutorials') === 'true',
    autoSync: localStorage.getItem('agriscan_auto_sync') !== 'false',
  }));
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const mfaEnabled = Boolean(user?.mfa_enabled);
  const mfaRequired = roleName === 'admin' || roleName === 'inspector';

  const fetchDevices = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/users/devices');
      setDevices(data);
    } catch {
      setDevices([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const checkPushStatus = useCallback(async () => {
    setPushChecking(true);

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushEnabled(false);
      setPushStatus('Push notifications are not supported on this browser.');
      setPushChecking(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;

      if (subscription) {
        setPushEnabled(true);
        setPushStatus('Push notifications are already enabled on this device.');
      } else {
        setPushEnabled(false);
        if (Notification.permission === 'granted') {
          setPushStatus('Notification permission is granted, but this device is not subscribed yet.');
        } else if (Notification.permission === 'denied') {
          setPushStatus('Notifications are blocked in this browser settings.');
        } else {
          setPushStatus('Push notifications are not enabled yet.');
        }
      }
    } catch {
      setPushEnabled(false);
      setPushStatus('Could not check push notification status.');
    } finally {
      setPushChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    checkPushStatus();
  }, [checkPushStatus]);

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    setSettingsStatus(nextLanguage === 'fil' ? 'Filipino language selected.' : 'English language selected.');
  }

  function toggleSetting(key) {
    setToggles((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem(`agriscan_${toSnakeCase(key)}`, String(next[key]));
      return next;
    });
    const label = key === 'voiceAssistant' ? 'Voice Assistant' : key === 'voiceTutorials' ? 'Voice Tutorials' : 'Auto-Sync';
    setSettingsStatus(`${label} updated.`);
  }

  async function syncNow() {
    setSettingsStatus('Syncing latest app data...');
    try {
      await Promise.allSettled([api.get('/scans'), api.get('/notifications')]);
      const stamp = new Date().toLocaleString();
      localStorage.setItem('agriscan_last_sync', stamp);
      setSyncStatus(stamp);
      setSettingsStatus('Manual sync completed.');
    } catch (error) {
      setSettingsStatus(getApiErrorMessage(error, 'Sync failed.'));
    }
  }

  function checkVersion() {
    setSettingsStatus(`AgriScan v1.2.0 is ready. Checked ${new Date().toLocaleTimeString()}.`);
  }

  async function enablePush() {
    setPushLoading(true);
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('Push notifications are not supported on this browser.');
      setPushEnabled(false);
      setPushLoading(false);
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushStatus('Notification permission was not granted.');
      setPushEnabled(false);
      setPushLoading(false);
      return;
    }
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setPushStatus('Set VITE_VAPID_PUBLIC_KEY to enable production push subscriptions.');
      setPushEnabled(false);
      setPushLoading(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || (
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      );
      await api.post('/notifications/push/subscribe', subscription.toJSON());
      setPushEnabled(true);
      setPushStatus('Push notifications are already enabled on this device.');
    } catch (error) {
      setPushEnabled(false);
      setPushStatus(getApiErrorMessage(error, 'Could not enable push notifications.'));
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-950 sm:text-4xl">App Settings</h1>
        <p className="mt-2 text-lg text-stone-500">Configure your AgriScan experience for the field.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="surface rounded-lg p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <ShieldCheck className="h-5 w-5 text-leaf-600" />
              System Language
            </h2>
            <p className="mt-1 text-sm text-stone-500">Choose your preferred language for the interface.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <LanguageButton active={language === 'en'} title="English" body="International" onClick={() => changeLanguage('en')} />
              <LanguageButton active={language === 'fil'} title="Filipino" body="Tagalog" onClick={() => changeLanguage('fil')} />
            </div>
            {settingsStatus && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-leaf-700">
                <CheckCircle2 className="h-4 w-4" />
                {settingsStatus}
              </p>
            )}
          </section>

          <section className="surface rounded-lg p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <Mic className="h-5 w-5 text-leaf-600" />
              Accessibility
            </h2>
            <div className="mt-5 divide-y divide-stone-100">
              <SettingToggle
                title="Voice Assistant"
                body="Dictate soil readings or hear crop recommendations."
                active={toggles.voiceAssistant}
                onToggle={() => toggleSetting('voiceAssistant')}
              />
              <SettingToggle
                title="Voice Tutorials"
                body="Play audio guides for new features."
                active={toggles.voiceTutorials}
                onToggle={() => toggleSetting('voiceTutorials')}
              />
            </div>
          </section>

          <section className="surface rounded-lg p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <ClipboardList className="h-5 w-5 text-leaf-600" />
              Manual Entry Defaults
            </h2>
            <div className="mt-5 rounded-lg border border-leaf-100 bg-leaf-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-leaf-600">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-stone-950">Soil Recommendation Form</p>
                    <p className="text-xs text-stone-500">Soil type, pH, moisture, NPK levels</p>
                  </div>
                </div>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700">Active</span>
              </div>
            </div>
            <Link className="btn-primary mt-4 w-full" to="/scan">Open Manual Scan</Link>
          </section>

          <section className="surface rounded-lg p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <Cloud className="h-5 w-5 text-leaf-600" />
              Data & Cloud
            </h2>
            <div className="mt-5 divide-y divide-stone-100">
              <SettingToggle
                title="Auto-Sync"
                body="Upload scans automatically when online."
                active={toggles.autoSync}
                onToggle={() => toggleSetting('autoSync')}
              />
              <div className="flex items-center justify-between py-4 text-sm">
                <span className="text-stone-500">Last backup: {syncStatus}</span>
                <button className="font-bold text-leaf-700 disabled:opacity-60" onClick={syncNow} type="button" disabled={!toggles.autoSync}>
                  Sync Now
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface rounded-lg p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <KeyRound className="h-5 w-5 text-leaf-600" />
              Multi-factor authentication
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Admin and inspector accounts require authenticator app MFA. Farmers can enable it for stronger protection.
            </p>
            <div className="mt-5 rounded-lg bg-stone-50 p-4 text-sm">
              <p><span className="font-semibold">Signed in as:</span> {user?.full_name}</p>
              <p><span className="font-semibold">Role:</span> {roleName}</p>
            </div>
            <div className={`mt-4 rounded-lg border p-4 text-sm ${mfaEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-900">Authenticator status</p>
                  <p className="mt-1 text-stone-600">
                    {mfaEnabled
                      ? 'Authenticator app is already set up for this account.'
                      : mfaRequired
                        ? 'This role requires MFA before normal admin access.'
                        : 'MFA is optional for this account, but strongly recommended.'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${mfaEnabled ? 'bg-white text-leaf-700' : 'bg-white text-amber-700'}`}>
                  {mfaEnabled ? 'Enabled' : mfaRequired ? 'Required' : 'Optional'}
                </span>
              </div>
            </div>
            {mfaEnabled ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800">
                <CheckCircle2 className="h-4 w-4" />
                Multi-factor authentication is already set up.
              </div>
            ) : (
              <Link className="btn-primary mt-4 w-full" to="/mfa/setup">
                <KeyRound className="h-4 w-4" />
                Set up authenticator
              </Link>
            )}

            <div className={`mt-4 rounded-lg border p-4 text-sm ${pushEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-stone-200 bg-stone-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-900">Push notification status</p>
                  <p className="mt-1 text-stone-600">{pushChecking ? 'Checking notification status for this device...' : pushStatus}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${pushEnabled ? 'bg-white text-leaf-700' : 'bg-white text-stone-700'}`}>
                  {pushEnabled ? 'Enabled' : pushChecking ? 'Checking' : 'Not enabled'}
                </span>
              </div>
            </div>

            <button className="btn-secondary mt-3 w-full" onClick={enablePush} type="button" disabled={pushLoading || pushChecking || pushEnabled}>
              <BellRing className="h-4 w-4" />
              {pushLoading ? 'Enabling...' : pushChecking ? 'Checking...' : pushEnabled ? 'Push notifications enabled' : 'Enable push notifications'}
            </button>
          </section>

          <section className="surface rounded-lg p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Smartphone className="h-5 w-5 text-leaf-600" />
              Device login history
            </h2>
            <button className="btn-secondary mt-4 w-full" type="button" onClick={fetchDevices} disabled={historyLoading}>
              <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
              {historyLoading ? 'Refreshing...' : 'Refresh history'}
            </button>
            <div className="mt-4 space-y-3">
              {devices.slice(0, 5).map((device) => (
                <div key={device.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-stone-900">{device.device_name || 'Unknown device'}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${device.success ? 'bg-leaf-50 text-leaf-700' : 'bg-red-50 text-red-700'}`}>
                      {device.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{device.ip_address} - {new Date(device.created_at).toLocaleString()}</p>
                </div>
              ))}
              {devices.length === 0 && <p className="text-sm text-stone-500">No device history yet.</p>}
            </div>
          </section>

          <section className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center">
            <RefreshCw className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 font-bold text-stone-950">AgriScan v1.2.0</p>
            <p className="text-sm text-stone-500">Build 842</p>
            <button className="btn-secondary mt-4 w-full" type="button" onClick={checkVersion}>
              Check app version
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function LanguageButton({ active, title, body, onClick }) {
  return (
    <button
      className={`rounded-lg p-5 text-left transition ${
        active ? 'border-2 border-leaf-500 bg-leaf-50' : 'border border-stone-200 bg-white hover:bg-stone-50'
      }`}
      onClick={onClick}
      type="button"
      aria-pressed={active}
    >
      <p className={`font-bold ${active ? 'text-leaf-900' : 'text-stone-950'}`}>{title}</p>
      <p className={`text-xs font-semibold uppercase ${active ? 'text-leaf-600' : 'text-stone-400'}`}>{body}</p>
    </button>
  );
}

function SettingToggle({ title, body, active = false, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="font-semibold text-stone-900">{title}</p>
        <p className="mt-1 text-sm text-stone-500">{body}</p>
      </div>
      <button
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${active ? 'bg-leaf-600' : 'bg-stone-300'}`}
        aria-pressed={active}
        onClick={onToggle}
        type="button"
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${active ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

function toSnakeCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
