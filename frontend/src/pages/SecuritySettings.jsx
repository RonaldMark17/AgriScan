import { BellRing, CheckCircle2, ClipboardList, Cloud, KeyRound, Mic, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

export default function SecuritySettings() {
  const { user } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const {
    voiceAssistantEnabled,
    voiceTutorialsEnabled,
    setVoiceAssistantEnabled,
    setVoiceTutorialsEnabled,
  } = useVoice();
  const [devices, setDevices] = useState([]);
  const [pushStatus, setPushStatus] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushChecking, setPushChecking] = useState(true);
  const [syncStatus, setSyncStatus] = useState(() => localStorage.getItem('agriscan_last_sync') || t('notSyncedYet'));
  const [settingsStatus, setSettingsStatus] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toggles, setToggles] = useState(() => ({
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
      setPushStatus(t('pushUnsupported'));
      setPushChecking(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;

      if (subscription) {
        setPushEnabled(true);
        setPushStatus(t('pushAlreadyEnabled'));
      } else {
        setPushEnabled(false);
        if (Notification.permission === 'granted') {
          setPushStatus(t('pushGrantedNotSubscribed'));
        } else if (Notification.permission === 'denied') {
          setPushStatus(t('pushBlocked'));
        } else {
          setPushStatus(t('pushNotEnabledYet'));
        }
      }
    } catch {
      setPushEnabled(false);
      setPushStatus(t('pushStatusFailed'));
    } finally {
      setPushChecking(false);
    }
  }, [t]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    checkPushStatus();
  }, [checkPushStatus]);

  useEffect(() => {
    if (!localStorage.getItem('agriscan_last_sync')) {
      setSyncStatus(t('notSyncedYet'));
    }
  }, [t]);

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    setSettingsStatus(nextLanguage === 'fil' ? t('filipinoSelected') : t('englishSelected'));
  }

  function toggleAutoSync() {
    setToggles((current) => {
      const next = { ...current, autoSync: !current.autoSync };
      localStorage.setItem('agriscan_auto_sync', String(next.autoSync));
      return next;
    });
    setSettingsStatus(t('settingUpdated', { label: t('autoSync') }));
  }

  function toggleVoiceAssistant() {
    const next = !voiceAssistantEnabled;
    setVoiceAssistantEnabled(next);
    setSettingsStatus(next ? t('voiceAssistantEnabledStatus') : t('voiceAssistantDisabledStatus'));
  }

  function toggleVoiceTutorials() {
    const next = !voiceTutorialsEnabled;
    setVoiceTutorialsEnabled(next);
    setSettingsStatus(next ? t('voiceTutorialsEnabledStatus') : t('voiceTutorialsDisabledStatus'));
  }

  async function syncNow() {
    setSettingsStatus(t('syncingData'));
    try {
      await Promise.allSettled([api.get('/scans'), api.get('/notifications')]);
      const stamp = new Date().toLocaleString();
      localStorage.setItem('agriscan_last_sync', stamp);
      setSyncStatus(stamp);
      setSettingsStatus(t('manualSyncComplete'));
    } catch (error) {
      setSettingsStatus(getApiErrorMessage(error, 'Sync failed.'));
    }
  }

  function checkVersion() {
    setSettingsStatus(t('appReadyChecked', { time: new Date().toLocaleTimeString() }));
  }

  async function enablePush() {
    setPushLoading(true);
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus(t('pushUnsupported'));
      setPushEnabled(false);
      setPushLoading(false);
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushStatus(t('pushDenied'));
      setPushEnabled(false);
      setPushLoading(false);
      return;
    }
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setPushStatus(t('pushMissingKey'));
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
      setPushStatus(t('pushAlreadyEnabled'));
    } catch (error) {
      setPushEnabled(false);
      setPushStatus(getApiErrorMessage(error, t('pushFailed')));
    } finally {
      setPushLoading(false);
    }
  }

  async function sendTestPush() {
    setTestPushLoading(true);
    try {
      const { data } = await api.post('/notifications/push/test');
      setPushStatus(data?.message || t('testNotificationSent'));
      setPushEnabled(true);
    } catch (error) {
      setPushStatus(getApiErrorMessage(error, t('testNotificationFailed')));
    } finally {
      setTestPushLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="break-words text-2xl font-bold text-stone-950 sm:text-4xl">{t('appSettings')}</h1>
        <p className="mt-2 text-lg text-stone-500">{t('appSettingsBody')}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="surface rounded-lg p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <ShieldCheck className="h-5 w-5 text-leaf-600" />
              {t('systemLanguage')}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{t('languageChoiceBody')}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <LanguageButton active={language === 'en'} title={t('english')} body={t('international')} onClick={() => changeLanguage('en')} />
              <LanguageButton active={language === 'fil'} title={t('filipino')} body={t('tagalog')} onClick={() => changeLanguage('fil')} />
            </div>
            {settingsStatus && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-leaf-700">
                <CheckCircle2 className="h-4 w-4" />
                {settingsStatus}
              </p>
            )}
          </section>

          <section className="surface rounded-lg p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <Mic className="h-5 w-5 text-leaf-600" />
              {t('accessibility')}
            </h2>
            <div className="mt-5 divide-y divide-stone-100">
              <SettingToggle
                title={t('voiceAssistant')}
                body={t('voiceAssistantBody')}
                active={voiceAssistantEnabled}
                onToggle={toggleVoiceAssistant}
              />
              <SettingToggle
                title={t('voiceTutorials')}
                body={t('voiceTutorialsBody')}
                active={voiceTutorialsEnabled}
                onToggle={toggleVoiceTutorials}
              />
            </div>
          </section>

          <section className="surface rounded-lg p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <ClipboardList className="h-5 w-5 text-leaf-600" />
              {t('manualEntryDefaults')}
            </h2>
            <div className="mt-5 rounded-lg border border-leaf-100 bg-leaf-50 p-4">
              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-leaf-600">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-stone-950">{t('soilRecommendationForm')}</p>
                    <p className="text-xs text-stone-500">{t('soilFormBody')}</p>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-700">{t('active')}</span>
              </div>
            </div>
            <Link className="btn-primary mt-4 w-full" to="/scan">{t('openManualScan')}</Link>
          </section>

          <section className="surface rounded-lg p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <Cloud className="h-5 w-5 text-leaf-600" />
              {t('dataCloud')}
            </h2>
            <div className="mt-5 divide-y divide-stone-100">
              <SettingToggle
                title={t('autoSync')}
                body={t('autoSyncBody')}
                active={toggles.autoSync}
                onToggle={toggleAutoSync}
              />
              <div className="flex items-center justify-between py-4 text-sm">
                <span className="text-stone-500">{t('lastBackup', { time: syncStatus })}</span>
                <button className="font-bold text-leaf-700 disabled:opacity-60" onClick={syncNow} type="button" disabled={!toggles.autoSync}>
                  {t('syncNow')}
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface rounded-lg p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-950">
              <KeyRound className="h-5 w-5 text-leaf-600" />
              {t('mfaTitle')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {t('mfaBody')}
            </p>
            <div className="mt-5 rounded-lg bg-stone-50 p-4 text-sm">
              <p><span className="font-semibold">{t('signedInAs')}</span> {user?.full_name}</p>
              <p><span className="font-semibold">{t('role')}:</span> {roleName}</p>
            </div>
            <div className={`mt-4 rounded-lg border p-4 text-sm ${mfaEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900">{t('authenticatorStatus')}</p>
                  <p className="mt-1 text-stone-600">
                    {mfaEnabled
                      ? t('mfaAlreadySetupBody')
                      : mfaRequired
                        ? t('mfaRoleRequiresBody')
                        : t('mfaOptionalBody')}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${mfaEnabled ? 'bg-white text-leaf-700' : 'bg-white text-amber-700'}`}>
                  {mfaEnabled ? t('enabled') : mfaRequired ? t('required') : t('optional')}
                </span>
              </div>
            </div>
            {mfaEnabled ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800">
                <CheckCircle2 className="h-4 w-4" />
                {t('multiFactorAlreadySetup')}
              </div>
            ) : (
              <Link className="btn-primary mt-4 w-full" to="/mfa/setup">
                <KeyRound className="h-4 w-4" />
                {t('setupAuthenticator')}
              </Link>
            )}

            <div className={`mt-4 rounded-lg border p-4 text-sm ${pushEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-stone-200 bg-stone-50'}`}>
              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900">{t('pushNotificationStatus')}</p>
                  <p className="mt-1 text-stone-600">{pushChecking ? t('checkingPushStatus') : pushStatus}</p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${pushEnabled ? 'bg-white text-leaf-700' : 'bg-white text-stone-700'}`}>
                  {pushEnabled ? t('enabled') : pushChecking ? t('checking') : t('notEnabled')}
                </span>
              </div>
            </div>

            <button className="btn-secondary mt-3 w-full" onClick={enablePush} type="button" disabled={pushLoading || pushChecking || pushEnabled}>
              <BellRing className="h-4 w-4" />
              {pushLoading ? t('enabling') : pushChecking ? `${t('checking')}...` : pushEnabled ? t('pushEnabled') : t('enablePush')}
            </button>
            <button className="btn-secondary mt-3 w-full" onClick={sendTestPush} type="button" disabled={testPushLoading || pushChecking || !pushEnabled}>
              <BellRing className="h-4 w-4" />
              {testPushLoading ? t('sendingTestNotification') : t('sendTestNotification')}
            </button>
          </section>

          <section className="surface rounded-lg p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Smartphone className="h-5 w-5 text-leaf-600" />
              {t('deviceLoginHistory')}
            </h2>
            <button className="btn-secondary mt-4 w-full" type="button" onClick={fetchDevices} disabled={historyLoading}>
              <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
              {historyLoading ? t('refreshing') : t('refreshHistory')}
            </button>
            <div className="mt-4 space-y-3">
              {devices.slice(0, 5).map((device) => (
                <div key={device.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-semibold text-stone-900">{device.device_name || t('unknownDevice')}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${device.success ? 'bg-leaf-50 text-leaf-700' : 'bg-red-50 text-red-700'}`}>
                      {device.success ? t('success') : t('failed')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{device.ip_address} - {new Date(device.created_at).toLocaleString()}</p>
                </div>
              ))}
              {devices.length === 0 && <p className="text-sm text-stone-500">{t('noDeviceHistory')}</p>}
            </div>
          </section>

          <section className="rounded-lg border border-dashed border-stone-300 bg-white p-4 text-center sm:p-6">
            <RefreshCw className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 font-bold text-stone-950">AgriScan v1.2.0</p>
            <p className="text-sm text-stone-500">{t('buildNumber', { number: 842 })}</p>
            <button className="btn-secondary mt-4 w-full" type="button" onClick={checkVersion}>
              {t('checkAppVersion')}
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
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
