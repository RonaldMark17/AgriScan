import { BellRing, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Cloud, KeyRound, Mic, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';
import {
  ensureWebPushNotificationsEnabled,
  getWebPushSubscriptionState,
  rememberNotificationIds,
  webPushNotificationsSupported,
} from '../utils/browserNotifications.js';
import { deviceNameFromUserAgent, isGenericDeviceName } from '../utils/deviceName.js';

const ACTIVITY_LOG_PAGE_SIZE = 8;

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
  const [pushServerReady, setPushServerReady] = useState(false);
  const [pushChecking, setPushChecking] = useState(true);
  const [syncStatus, setSyncStatus] = useState(() => localStorage.getItem('agriscan_last_sync') || t('notSyncedYet'));
  const [settingsStatus, setSettingsStatus] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [toggles, setToggles] = useState(() => ({
    autoSync: localStorage.getItem('agriscan_auto_sync') !== 'false',
  }));
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || 'farmer';
  const mfaEnabled = Boolean(user?.mfa_enabled);
  const mfaRequired = roleName === 'admin';
  const isAdmin = roleName === 'admin';

  const pushServerConfigStatus = useCallback(() => {
    return isAdmin ? t('pushServerNeedsAdminSetup') : t('pushServerNeedsSetup');
  }, [isAdmin, t]);

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

  const fetchActivityLogs = useCallback(async () => {
    if (!isAdmin) return;
    setActivityLoading(true);
    try {
      const { data } = await api.get('/admin/activity-logs');
      setActivityLogs(Array.isArray(data) ? data : []);
    } catch {
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  }, [isAdmin]);

  const checkPushStatus = useCallback(async () => {
    setPushChecking(true);

    if (!webPushNotificationsSupported()) {
      setPushEnabled(false);
      setPushServerReady(false);
      setPushStatus(t('pushUnsupported'));
      setPushChecking(false);
      return;
    }

    try {
      const pushState = await getWebPushSubscriptionState();
      setPushServerReady(pushState.serverEnabled);
      if (!pushState.serverEnabled) {
        setPushEnabled(false);
        setPushStatus(pushServerConfigStatus());
      } else if (pushState.subscribed) {
        setPushEnabled(true);
        setPushStatus(t('pushAlreadyEnabled'));
      } else {
        setPushEnabled(false);
        if (pushState.permission === 'granted') {
          setPushStatus(t('pushGrantedNotSubscribed'));
        } else if (pushState.permission === 'denied') {
          setPushStatus(t('pushBlocked'));
        } else {
          setPushStatus(t('pushNotEnabledYet'));
        }
      }
    } catch {
      setPushEnabled(false);
      setPushServerReady(false);
      setPushStatus(t('pushStatusFailed'));
    } finally {
      setPushChecking(false);
    }
  }, [pushServerConfigStatus, t]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    fetchActivityLogs();
  }, [fetchActivityLogs]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(activityLogs.length / ACTIVITY_LOG_PAGE_SIZE));
    setActivityPage((current) => Math.min(Math.max(current, 1), pageCount));
  }, [activityLogs.length]);

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
      const enabled = await ensureWebPushNotificationsEnabled();
      if (!enabled) {
        setPushStatus(webPushNotificationsSupported() ? t('pushDenied') : t('pushUnsupported'));
        setPushEnabled(false);
        return;
      }
      const { data } = await api.get('/notifications');
      rememberNotificationIds(Array.isArray(data) ? data : [], user?.id);
      setPushEnabled(true);
      setPushStatus(t('pushEnabled'));
    } catch (error) {
      setPushEnabled(false);
      if (error?.code === 'FIREBASE_PUSH_NOT_CONFIGURED') {
        setPushServerReady(false);
        setPushStatus(pushServerConfigStatus());
      } else {
        setPushStatus(getApiErrorMessage(error, t('pushFailed')));
      }
    } finally {
      setPushLoading(false);
    }
  }

  const mfaStatusLabel = mfaEnabled ? t('enabled') : mfaRequired ? t('required') : t('optional');
  const pushStatusLabel = pushEnabled ? t('enabled') : pushChecking ? t('checking') : t('notEnabled');
  const syncStatusLabel = toggles.autoSync ? t('active') : t('notEnabled');
  const recentDevices = devices.slice(0, 5);
  const activityPageCount = Math.max(1, Math.ceil(activityLogs.length / ACTIVITY_LOG_PAGE_SIZE));
  const activityStartIndex = (activityPage - 1) * ACTIVITY_LOG_PAGE_SIZE;
  const visibleActivityLogs = activityLogs.slice(activityStartIndex, activityStartIndex + ACTIVITY_LOG_PAGE_SIZE);
  const activityShowingStart = activityLogs.length === 0 ? 0 : activityStartIndex + 1;
  const activityShowingEnd = Math.min(activityStartIndex + ACTIVITY_LOG_PAGE_SIZE, activityLogs.length);
  const getDeviceDisplayName = useCallback(
    (device) => {
      if (device.device_name && !isGenericDeviceName(device.device_name)) {
        return device.device_name;
      }
      return deviceNameFromUserAgent(device.user_agent) || device.device_name || t('unknownDevice');
    },
    [t],
  );

  function formatActivityAction(action) {
    const labels = {
      'admin.force_mfa': 'Admin required MFA',
      'admin.user_disabled': 'Account disabled',
      'admin.user_enabled': 'Account enabled',
      'admin.user_updated': 'Account updated',
      'auth.login_failed': 'Login failed',
      'auth.login_success': 'Logged in',
      'auth.mfa_enabled': 'MFA enabled',
      'auth.mfa_failed': 'MFA failed',
      'auth.mfa_success': 'MFA verified',
      'auth.mfa_trusted_device': 'Trusted device used',
      'auth.password_reset_completed': 'Password reset completed',
      'auth.password_reset_requested': 'Password reset requested',
      'auth.password_verified': 'Password verified',
      'auth.recovery_codes_failed': 'Recovery code request failed',
      'auth.recovery_codes_rotated': 'Recovery codes generated',
      'auth.token_refreshed': 'Session refreshed',
      'farm.approved': 'Farm approved',
      'farm.created': 'Farm registered',
      'farm.rejected': 'Farm rejected',
      'marketplace.created': 'Marketplace listing created',
      'marketplace.status_updated': 'Marketplace status updated',
      'prediction.created': 'Prediction created',
      'prediction.soil_scan': 'Manual soil scan',
      'scan.created': 'Disease scan created',
      'scan.feedback.accepted': 'Flagged review accepted',
      'scan.feedback.created': 'Flagged review submitted',
      'scan.feedback.rejected': 'Flagged review rejected',
      'scan.feedback.undone': 'Flagged review undone',
      'user.registered': 'Account registered',
    };
    return labels[action] || String(action || '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatActivityResource(log) {
    if (!log.resource_type && !log.resource_id) return '-';
    if (!log.resource_id) return log.resource_type;
    return `${log.resource_type || t('resource')} #${log.resource_id}`;
  }

  return (
    <div className="page-stack w-full max-w-full overflow-hidden">
      <PageHeader
        eyebrow="Preferences"
        title={t('appSettings')}
        body={t('appSettingsBody')}
        actions={
          <span className="status-pill border border-stone-200 bg-white text-stone-700 w-full sm:w-auto text-center truncate">
            {t('role')}: {roleName}
          </span>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">
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
        <div className="success-message flex items-start gap-2 w-full bg-leaf-50 border border-leaf-100 text-leaf-800 p-3 rounded-lg">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{settingsStatus}</span>
        </div>
      ) : null}

      <div className="content-sidebar-layout flex flex-col lg:flex-row gap-6 w-full items-start">
        <div className="space-y-5 flex-1 min-w-0 w-full">
          <SettingsSection icon={ShieldCheck} title={t('systemLanguage')} body={t('languageChoiceBody')}>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 w-full">
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
            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white w-full">
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

          <div className="grid gap-5 grid-cols-1 lg:grid-cols-2 w-full">
            <SettingsSection icon={ClipboardList} title={t('manualEntryDefaults')}>
              <div className="rounded-lg border border-leaf-100 bg-leaf-50 p-4 w-full">
                <div className="flex min-w-0 items-start gap-3 w-full">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-leaf-700 ring-1 ring-leaf-100">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-stone-950 truncate">{t('soilRecommendationForm')}</p>
                      <StatusPill tone="leaf">{t('active')}</StatusPill>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-stone-600 line-clamp-2 sm:line-clamp-none">{t('soilFormBody')}</p>
                  </div>
                </div>
              </div>
              <Link className="btn-primary mt-4 w-full justify-center text-center inline-flex" to="/scan">
                {t('openManualScan')}
              </Link>
            </SettingsSection>

            <SettingsSection icon={Cloud} title={t('dataCloud')}>
              <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white w-full">
                <SettingToggle
                  title={t('autoSync')}
                  body={t('autoSyncBody')}
                  active={toggles.autoSync}
                  onToggle={toggleAutoSync}
                />
                <div className="flex flex-col gap-3 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between w-full">
                  <span className="leading-6 text-stone-500 truncate text-xs sm:text-sm">{t('lastBackup', { time: syncStatus })}</span>
                  <button
                    className="focus-ring inline-flex w-full sm:w-auto min-h-9 items-center justify-center rounded-lg px-3 py-2 sm:py-0 text-sm font-bold text-leaf-700 transition hover:bg-leaf-50 disabled:cursor-not-allowed disabled:opacity-60 bg-leaf-50 sm:bg-transparent"
                    onClick={syncNow}
                    type="button"
                    disabled={!toggles.autoSync}
                  >
                    <RefreshCw className="mr-2 h-4 w-4 shrink-0" />
                    {t('syncNow')}
                  </button>
                </div>
              </div>
            </SettingsSection>
          </div>

          {isAdmin ? (
            <ActivityLogPanel
              activityLoading={activityLoading}
              activityLogs={activityLogs}
              activityPage={activityPage}
              activityPageCount={activityPageCount}
              activityShowingEnd={activityShowingEnd}
              activityShowingStart={activityShowingStart}
              fetchActivityLogs={fetchActivityLogs}
              formatActivityAction={formatActivityAction}
              formatActivityResource={formatActivityResource}
              setActivityPage={setActivityPage}
              t={t}
              visibleActivityLogs={visibleActivityLogs}
            />
          ) : null}
        </div>

        <aside className="space-y-5 w-full lg:w-[340px] xl:w-[380px] shrink-0">
          <SettingsSection icon={KeyRound} title={t('mfaTitle')} body={t('mfaBody')}>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm w-full">
              <div className="flex flex-col gap-1 w-full">
                <p className="min-w-0 break-words font-semibold text-stone-950 truncate">{user?.full_name || user?.email || 'AgriScan User'}</p>
                <p className="text-stone-500 truncate">
                  {t('role')}: <span className="font-semibold text-stone-700">{roleName}</span>
                </p>
              </div>
            </div>

            <div className={`mt-4 rounded-lg border p-4 text-sm w-full ${mfaEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-amber-100 bg-amber-50'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between w-full">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900">{t('authenticatorStatus')}</p>
                  <p className="mt-1 text-stone-600 text-xs sm:text-sm">
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
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800 w-full">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{t('multiFactorAlreadySetup')}</span>
              </div>
            ) : (
              <Link className="btn-primary mt-4 w-full justify-center inline-flex" to="/mfa/setup">
                <KeyRound className="h-4 w-4 mr-2 shrink-0" />
                {t('setupAuthenticator')}
              </Link>
            )}
          </SettingsSection>

          <SettingsSection icon={BellRing} title={t('pushNotificationStatus')}>
            <div className={`rounded-lg border p-4 text-sm w-full ${pushEnabled ? 'border-leaf-100 bg-leaf-50' : 'border-stone-200 bg-stone-50'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between w-full">
                <div className="min-w-0 flex-1">
                  <p className="mt-1 text-stone-600 text-xs sm:text-sm">{pushChecking ? t('checkingPushStatus') : pushStatus}</p>
                </div>
                <StatusPill tone={pushEnabled ? 'leaf' : 'stone'}>
                  {pushStatusLabel}
                </StatusPill>
              </div>
            </div>

            {!pushEnabled ? (
              <div className="mt-4 w-full">
                <button className="btn-secondary w-full justify-center" onClick={enablePush} type="button" disabled={pushLoading || pushChecking || !pushServerReady}>
                  <BellRing className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{pushLoading ? t('enabling') : pushChecking ? `${t('checking')}...` : t('enablePush')}</span>
                </button>
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection
            icon={Smartphone}
            title={t('deviceLoginHistory')}
            actions={
              <button className="btn-icon p-2 hover:bg-stone-100 rounded-lg transition-colors" type="button" onClick={fetchDevices} disabled={historyLoading} aria-label={t('refreshHistory')}>
                <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />
              </button>
            }
          >
            <div className="space-y-3 w-full">
              {recentDevices.map((device) => (
                <div key={device.id} className="rounded-lg border border-stone-200 bg-white p-3 w-full">
                  <div className="flex items-start justify-between gap-3 w-full">
                    <p className="min-w-0 flex-1 break-words font-semibold text-stone-900 text-sm line-clamp-1">{getDeviceDisplayName(device)}</p>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${device.success ? 'bg-leaf-50 text-leaf-700' : 'bg-red-50 text-red-700'}`}>
                      {device.success ? t('success') : t('failed')}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-stone-500 truncate">{device.ip_address} &bull; {new Date(device.created_at).toLocaleString()}</p>
                </div>
              ))}
              {recentDevices.length === 0 ? <p className="state-message text-center p-4">{t('noDeviceHistory')}</p> : null}
            </div>
          </SettingsSection>
        </aside>
      </div>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, body, actions, children }) {
  return (
    <section className="surface rounded-lg p-4 sm:p-5 w-full">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 w-full">
        <div className="flex min-w-0 items-start gap-3 flex-1">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-950 truncate">{title}</h2>
            {body ? <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-stone-600">{body}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0 self-start sm:self-auto">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5 w-full">{children}</div> : null}
    </section>
  );
}

function ActivityLogPanel({
  activityLoading,
  activityLogs,
  activityPage,
  activityPageCount,
  activityShowingEnd,
  activityShowingStart,
  fetchActivityLogs,
  formatActivityAction,
  formatActivityResource,
  setActivityPage,
  t,
  visibleActivityLogs,
}) {
  return (
    <section className="surface rounded-lg p-4 sm:p-5 w-full overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between w-full">
        <div className="flex min-w-0 items-start gap-3 flex-1">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <Clock3 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-950 truncate">{t('userActivityLog')}</h2>
            <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-stone-600 truncate">{t('userActivityEmptyBody')}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 w-full sm:w-auto">
          <span className="status-pill border border-stone-200 bg-white text-stone-700 flex-1 sm:flex-none text-center justify-center">
            {activityLogs.length} {t('total')}
          </span>
          <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs flex-1 sm:flex-none justify-center" onClick={fetchActivityLogs} disabled={activityLoading} type="button">
            <RefreshCw className={`h-4 w-4 mr-2 shrink-0 ${activityLoading ? 'animate-spin' : ''}`} />
            {t('refresh')}
          </button>
        </div>
      </div>

      {activityLogs.length === 0 ? (
        <div className="mt-5">
          <EmptyState title={t('noUserActivity')} body={t('userActivityEmptyBody')} />
        </div>
      ) : (
        <>
          <div className="table-shell mt-5 w-full overflow-x-auto rounded-lg border border-stone-200">
            <table className="activity-table w-full text-left text-sm min-w-[800px] table-fixed">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="w-[24%] px-4 py-3 font-semibold">{t('user')}</th>
                  <th className="w-[24%] px-4 py-3 font-semibold">{t('activity')}</th>
                  <th className="w-[18%] px-4 py-3 font-semibold">{t('resource')}</th>
                  <th className="w-[14%] px-4 py-3 font-semibold">{t('ipAddress')}</th>
                  <th className="w-[20%] px-4 py-3 font-semibold">{t('time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white">
                {visibleActivityLogs.map((log) => (
                  <tr key={log.id} className="transition hover:bg-stone-50/70">
                    <td className="px-4 py-3 align-top">
                      <p className="break-words font-semibold text-stone-900">{log.user_name || t('systemActivity')}</p>
                      <p className="break-all text-xs text-stone-500 mt-0.5">{log.user_email || '-'}</p>
                      {log.user_role ? (
                        <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-stone-600">
                          {log.user_role}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="break-words font-semibold text-stone-900">{formatActivityAction(log.action)}</p>
                      <p className="mt-1 break-all text-xs text-stone-500 font-mono bg-stone-50 px-1.5 py-0.5 rounded w-fit">{log.action}</p>
                    </td>
                    <td className="break-words px-4 py-3 align-top text-stone-600">{formatActivityResource(log)}</td>
                    <td className="break-words px-4 py-3 align-top text-stone-600 font-mono text-xs">{log.ip_address || '-'}</td>
                    <td className="break-words px-4 py-3 align-top text-stone-600 text-xs">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between w-full">
            <p className="text-xs sm:text-sm font-semibold text-stone-600 text-center sm:text-left">
              {t('paginationSummary', { start: activityShowingStart, end: activityShowingEnd, total: activityLogs.length })}
            </p>
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
              <button
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs flex-1 sm:flex-none justify-center"
                type="button"
                onClick={() => setActivityPage((current) => Math.max(1, current - 1))}
                disabled={activityPage <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1 sm:mr-2" />
                {t('previous')}
              </button>
              <span className="status-pill border border-stone-200 bg-white text-stone-700 text-[10px] sm:text-xs">
                {t('pageOf', { page: activityPage, total: activityPageCount })}
              </span>
              <button
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs flex-1 sm:flex-none justify-center"
                type="button"
                onClick={() => setActivityPage((current) => Math.min(activityPageCount, current + 1))}
                disabled={activityPage >= activityPageCount}
              >
                {t('next')}
                <ChevronRight className="h-4 w-4 ml-1 sm:ml-2" />
              </button>
            </div>
          </div>
        </>
      )}
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
    <div className="surface rounded-lg p-4 w-full flex flex-col h-full">
      <div className="flex items-start gap-3 w-full">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="panel-heading truncate text-xs sm:text-sm">{label}</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-stone-950 truncate">{value}</p>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-stone-500">{body}</p>
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
    <span className={`inline-flex min-h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider leading-none ${toneClass}`}>
      {children}
    </span>
  );
}

function LanguageButton({ active, title, body, onClick }) {
  return (
    <button
      className={`focus-ring w-full min-h-20 sm:min-h-24 rounded-lg p-3 sm:p-4 text-left transition ${
        active ? 'border border-leaf-200 bg-leaf-50 ring-1 ring-leaf-200 shadow-sm' : 'border border-stone-200 bg-white hover:bg-stone-50'
      }`}
      onClick={onClick}
      type="button"
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-3 w-full">
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-sm sm:text-base truncate ${active ? 'text-leaf-900' : 'text-stone-950'}`}>{title}</p>
          <p className={`mt-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate ${active ? 'text-leaf-700' : 'text-stone-400'}`}>{body}</p>
        </div>
        {active ? <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-leaf-700 mt-0.5" /> : null}
      </div>
    </button>
  );
}

function SettingToggle({ title, body, active = false, onToggle }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4 w-full">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-stone-900 text-sm sm:text-base truncate">{title}</p>
        <p className="mt-1 text-xs sm:text-sm leading-5 sm:leading-6 text-stone-500 line-clamp-2">{body}</p>
      </div>
      <button
        className={`focus-ring relative h-6 w-11 sm:h-7 sm:w-12 shrink-0 rounded-full transition-colors mt-0.5 ${active ? 'bg-leaf-600' : 'bg-stone-300'}`}
        aria-pressed={active}
        aria-label={title}
        onClick={onToggle}
        type="button"
      >
        <span className={`absolute top-1 h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-white transition-all ${active ? 'left-[22px] sm:left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}
