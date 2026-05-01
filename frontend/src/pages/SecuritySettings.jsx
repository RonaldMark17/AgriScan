import { BellRing, CheckCircle2, ClipboardList, Cloud, Copy, KeyRound, Mic, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import PageHeader from '../components/shared/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';
import {
  browserNotificationsSupported,
  ensureManualNotificationsEnabled,
  manualNotificationsEnabled,
  rememberNotificationIds,
  showBrowserNotification,
} from '../utils/browserNotifications.js';

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
  const [testNotificationPreview, setTestNotificationPreview] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState('');
  const [toggles, setToggles] = useState(() => ({
    autoSync: localStorage.getItem('agriscan_auto_sync') !== 'false',
  }));
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const mfaEnabled = Boolean(user?.mfa_enabled);
  const mfaRequired = roleName === 'admin' || roleName === 'inspector';
  const isAdmin = roleName === 'admin';

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

    if (!browserNotificationsSupported()) {
      setPushEnabled(false);
      setPushStatus(t('pushUnsupported'));
      setPushChecking(false);
      return;
    }

    try {
      if (manualNotificationsEnabled()) {
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

  async function enablePush() {
    setPushLoading(true);
    try {
      const enabled = await ensureManualNotificationsEnabled();
      if (!enabled) {
        setPushStatus(browserNotificationsSupported() ? t('pushDenied') : t('pushUnsupported'));
        setPushEnabled(false);
        return;
      }
      const { data } = await api.get('/notifications');
      rememberNotificationIds(Array.isArray(data) ? data : [], user?.id);
      setPushEnabled(true);
      setPushStatus(t('pushEnabled'));
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
      const enabled = await ensureManualNotificationsEnabled();
      await api.post('/notifications/test');
      const timestamp = Date.now();
      const testNotification = {
        id: `test-${timestamp}`,
        title: 'AgriScan notifications ready',
        body: 'You will receive alerts while AgriScan is open on this device.',
        type: 'system',
        tag: `agriscan-test-notification-${timestamp}`,
        created_at: new Date(timestamp).toISOString(),
        payload: { url: '/settings/security' },
      };
      const shown = enabled ? await showBrowserNotification(testNotification, user?.id) : false;
      const notificationsResponse = await api.get('/notifications');
      rememberNotificationIds(Array.isArray(notificationsResponse.data) ? notificationsResponse.data : [], user?.id);
      setTestNotificationPreview(testNotification);
      setPushStatus(shown ? t('testNotificationSent') : t('testNotificationFallback'));
      setPushEnabled(enabled);
    } catch (error) {
      setPushStatus(getApiErrorMessage(error, t('testNotificationFailed')));
    } finally {
      setTestPushLoading(false);
    }
  }

  async function generateRecoveryCodes(event) {
    event.preventDefault();
    setRecoveryLoading(true);
    setRecoveryStatus('');
    setRecoveryCodes([]);
    try {
      const { data } = await api.post('/auth/mfa/recovery-codes', { password: recoveryPassword });
      setRecoveryCodes(data?.recovery_codes || []);
      setRecoveryPassword('');
      setRecoveryStatus(data?.message || t('recoveryCodesGenerated'));
    } catch (error) {
      setRecoveryStatus(getApiErrorMessage(error, t('recoveryCodesFailed')));
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function copyRecoveryCodes() {
    if (!recoveryCodes.length) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setRecoveryStatus(t('recoveryCodesCopied'));
    } catch {
      setRecoveryStatus(t('recoveryCodesCopyFailed'));
    }
  }

  const mfaStatusLabel = mfaEnabled ? t('enabled') : mfaRequired ? t('required') : t('optional');
  const pushStatusLabel = pushEnabled ? t('enabled') : pushChecking ? t('checking') : t('notEnabled');
  const syncStatusLabel = toggles.autoSync ? t('active') : t('notEnabled');
  const recentDevices = devices.slice(0, 5);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Preferences"
        title={t('appSettings')}
        body={t('appSettingsBody')}
        actions={
          <span className="status-pill border border-stone-200 bg-white text-stone-700">
            {t('role')}: {roleName}
          </span>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatusCard
          icon={ShieldCheck}
          label={t('security')}
          value={mfaStatusLabel}
          body={mfaEnabled ? t('mfaAlreadySetupBody') : mfaRequired ? t('mfaRoleRequiresBody') : t('mfaOptionalBody')}
          tone={mfaEnabled ? 'leaf' : mfaRequired ? 'amber' : 'stone'}
        />
        <StatusCard
          icon={BellRing}
          label={t('notifications')}
          value={pushStatusLabel}
          body={pushChecking ? t('checkingPushStatus') : pushStatus || t('pushNotEnabledYet')}
          tone={pushEnabled ? 'leaf' : 'stone'}
        />
        <StatusCard
          icon={Cloud}
          label={t('dataCloud')}
          value={syncStatusLabel}
          body={t('lastBackup', { time: syncStatus })}
          tone={toggles.autoSync ? 'leaf' : 'stone'}
        />
      </div>

      {settingsStatus ? (
        <div className="success-message flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{settingsStatus}</span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <SettingsSection icon={ShieldCheck} title={t('systemLanguage')} body={t('languageChoiceBody')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <LanguageButton
                active={language === 'en'}
                title={t('english')}
                body={t('international')}
                onClick={() => changeLanguage('en')}
              />
              <LanguageButton
                active={language === 'fil'}
                title={t('filipino')}
                body={t('tagalog')}
                onClick={() => changeLanguage('fil')}
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={Mic} title={t('accessibility')}>
            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
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
          </SettingsSection>

          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsSection icon={ClipboardList} title={t('manualEntryDefaults')}>
              <div className="rounded-lg border border-leaf-100 bg-leaf-50 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-leaf-700 ring-1 ring-leaf-100">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-stone-950">{t('soilRecommendationForm')}</p>
                      <StatusPill tone="leaf">{t('active')}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{t('soilFormBody')}</p>
                  </div>
                </div>
              </div>
              <Link className="btn-primary mt-4 w-full" to="/scan">
                {t('openManualScan')}
              </Link>
            </SettingsSection>

            <SettingsSection icon={Cloud} title={t('dataCloud')}>
              <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
                <SettingToggle
                  title={t('autoSync')}
                  body={t('autoSyncBody')}
                  active={toggles.autoSync}
                  onToggle={toggleAutoSync}
                />
                <div className="flex flex-col gap-3 px-4 py-4 text-sm min-[460px]:flex-row min-[460px]:items-center min-[460px]:justify-between">
                  <span className="leading-6 text-stone-500">{t('lastBackup', { time: syncStatus })}</span>
                  <button
                    className="focus-ring inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-bold text-leaf-700 transition hover:bg-leaf-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={syncNow}
                    type="button"
                    disabled={!toggles.autoSync}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('syncNow')}
                  </button>
                </div>
              </div>
            </SettingsSection>
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <SettingsSection icon={KeyRound} title={t('mfaTitle')} body={t('mfaBody')}>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
              <div className="flex flex-col gap-1">
                <p className="min-w-0 break-words font-semibold text-stone-950">{user?.full_name || user?.email || 'AgriScan User'}</p>
                <p className="text-stone-500">
                  {t('role')}: <span className="font-semibold text-stone-700">{roleName}</span>
                </p>
              </div>
            </div>

            <div className={`mt-3 rounded-lg border p-4 text-sm ${mfaEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
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
                <StatusPill tone={mfaEnabled ? 'leaf' : 'amber'}>
                  {mfaStatusLabel}
                </StatusPill>
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
          </SettingsSection>

          {isAdmin ? (
            <SettingsSection icon={KeyRound} title={t('adminRecoveryCodes')} body={t('adminRecoveryCodesBody')}>
              <form className="space-y-3" onSubmit={generateRecoveryCodes}>
                <input
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  aria-label={t('password')}
                  placeholder={t('confirmPassword')}
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  required
                  disabled={!mfaEnabled || recoveryLoading}
                />
                <button className="btn-secondary w-full" type="submit" disabled={!mfaEnabled || recoveryLoading}>
                  <RefreshCw className={`h-4 w-4 ${recoveryLoading ? 'animate-spin' : ''}`} />
                  {recoveryLoading ? t('generatingRecoveryCodes') : t('generateRecoveryCodes')}
                </button>
              </form>
              {!mfaEnabled ? <p className="mt-3 text-xs font-semibold text-amber-700">{t('recoveryCodesSetupRequired')}</p> : null}
              {recoveryStatus ? <p className="mt-3 text-xs font-semibold text-amber-800">{recoveryStatus}</p> : null}
              {recoveryCodes.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
                  <div className="grid gap-2 min-[380px]:grid-cols-2">
                    {recoveryCodes.map((code) => (
                      <code key={code} className="rounded border border-stone-200 bg-stone-50 px-2 py-2 text-center text-xs font-bold text-stone-900">
                        {code}
                      </code>
                    ))}
                  </div>
                  <button className="btn-secondary mt-3 w-full" type="button" onClick={copyRecoveryCodes}>
                    <Copy className="h-4 w-4" />
                    {t('copyRecoveryCodes')}
                  </button>
                </div>
              ) : null}
            </SettingsSection>
          ) : null}

          <SettingsSection icon={BellRing} title={t('pushNotificationStatus')}>
            <div className={`rounded-lg border p-4 text-sm ${pushEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-stone-200 bg-stone-50'}`}>
              <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
                <div className="min-w-0">
                  <p className="mt-1 text-stone-600">{pushChecking ? t('checkingPushStatus') : pushStatus}</p>
                </div>
                <StatusPill tone={pushEnabled ? 'leaf' : 'stone'}>
                  {pushStatusLabel}
                </StatusPill>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {!pushEnabled ? (
                <button className="btn-secondary w-full" onClick={enablePush} type="button" disabled={pushLoading || pushChecking}>
                  <BellRing className="h-4 w-4" />
                  {pushLoading ? t('enabling') : pushChecking ? `${t('checking')}...` : t('enablePush')}
                </button>
              ) : null}
              <button className="btn-secondary w-full" onClick={sendTestPush} type="button" disabled={testPushLoading || pushChecking || !pushEnabled}>
                <BellRing className="h-4 w-4" />
                {testPushLoading ? t('sendingTestNotification') : t('sendTestNotification')}
              </button>
            </div>
            {testNotificationPreview ? (
              <div className="mt-3 rounded-lg border border-leaf-100 bg-white p-4 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-stone-950">{testNotificationPreview.title}</p>
                    <p className="mt-1 text-stone-600">{testNotificationPreview.body}</p>
                    <p className="mt-2 text-xs font-semibold text-leaf-700">{t('testNotificationPreview')}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection
            icon={Smartphone}
            title={t('deviceLoginHistory')}
            actions={
              <button className="btn-icon" type="button" onClick={fetchDevices} disabled={historyLoading} aria-label={t('refreshHistory')}>
                <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
              </button>
            }
          >
            <div className="space-y-3">
              {recentDevices.map((device) => (
                <div key={device.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words font-semibold text-stone-900">{device.device_name || t('unknownDevice')}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${device.success ? 'bg-leaf-50 text-leaf-700' : 'bg-red-50 text-red-700'}`}>
                      {device.success ? t('success') : t('failed')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{device.ip_address} - {new Date(device.created_at).toLocaleString()}</p>
                </div>
              ))}
              {recentDevices.length === 0 ? <p className="state-message">{t('noDeviceHistory')}</p> : null}
            </div>
          </SettingsSection>
        </aside>
      </div>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, body, actions, children }) {
  return (
    <section className="surface rounded-lg p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-950">{title}</h2>
            {body ? <p className="mt-1 text-sm leading-6 text-stone-600">{body}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function StatusCard({ icon: Icon, label, value, body, tone = 'stone' }) {
  const toneClass =
    tone === 'leaf'
      ? 'bg-leaf-50 text-leaf-800 ring-leaf-100'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 ring-amber-100'
        : 'bg-stone-50 text-stone-700 ring-stone-200';

  return (
    <div className="surface rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="panel-heading">{label}</p>
          <p className="mt-1 text-lg font-bold text-stone-950">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{body}</p>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ children, tone = 'stone' }) {
  const toneClass =
    tone === 'leaf'
      ? 'border-leaf-100 bg-white text-leaf-700'
      : tone === 'amber'
        ? 'border-amber-100 bg-white text-amber-700'
        : 'border-stone-200 bg-white text-stone-700';

  return (
    <span className={`inline-flex min-h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold leading-none ${toneClass}`}>
      {children}
    </span>
  );
}

function LanguageButton({ active, title, body, onClick }) {
  return (
    <button
      className={`focus-ring min-h-24 rounded-lg p-4 text-left transition ${
        active ? 'border border-leaf-200 bg-leaf-50 ring-1 ring-leaf-200' : 'border border-stone-200 bg-white hover:bg-stone-50'
      }`}
      onClick={onClick}
      type="button"
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`font-bold ${active ? 'text-leaf-900' : 'text-stone-950'}`}>{title}</p>
          <p className={`mt-1 text-xs font-semibold uppercase ${active ? 'text-leaf-700' : 'text-stone-400'}`}>{body}</p>
        </div>
        {active ? <CheckCircle2 className="h-5 w-5 shrink-0 text-leaf-700" /> : null}
      </div>
    </button>
  );
}

function SettingToggle({ title, body, active = false, onToggle }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-stone-900">{title}</p>
        <p className="mt-1 text-sm leading-6 text-stone-500">{body}</p>
      </div>
      <button
        className={`focus-ring relative h-7 w-12 shrink-0 rounded-full transition ${active ? 'bg-leaf-600' : 'bg-stone-300'}`}
        aria-pressed={active}
        aria-label={title}
        onClick={onToggle}
        type="button"
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${active ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}
