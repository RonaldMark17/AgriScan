import {
  AlertTriangle,
  ArrowRight,
  CloudSun,
  Crosshair,
  Droplets,
  FlaskConical,
  Loader2,
  MapPin,
  ScanLine,
  Thermometer,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client.js';
import TranslatedText from '../components/shared/TranslatedText.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';

const fallback = {
  stats: { farms: 0, scans: 0, available_harvests: 0, unread_alerts: 0 },
  weather: {
    summary: 'Waiting for current conditions.',
    temperature_c: 31,
    humidity: 65,
    wind_speed_kph: 12,
    apparent_temperature_c: 33,
    precipitation_mm: 0,
    observed_at: null,
  },
  location: {
    source: 'unavailable',
    label: 'No current location selected',
    latitude: null,
    longitude: null,
    accuracy_m: null,
  },
  recent_scans: [],
  featured_alert: null,
};

function MetricCard({ icon: Icon, label, value, unit, status, tone = 'green', helper, to }) {
  const toneClass = tone === 'amber' ? 'text-amber-500' : tone === 'lime' ? 'text-lime-500' : 'text-leaf-600';
  const Component = to ? Link : 'section';

  return (
    <Component
      to={to}
      className={`surface rounded-lg p-5 ${to ? 'block transition hover:-translate-y-0.5 hover:border-leaf-200 hover:bg-leaf-50/40' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <Icon className={`h-6 w-6 ${toneClass}`} />
        <span className="rounded-full border border-stone-200 px-3 py-1 text-xs font-bold text-stone-600">{status}</span>
      </div>
      <p className="mt-6 text-sm font-semibold text-stone-500 sm:mt-8">{label}</p>
      <div className="mt-1 flex min-w-0 items-end gap-1">
        <span className="min-w-0 break-words text-3xl font-bold tracking-normal text-stone-950 sm:text-4xl">{value}</span>
        {unit && <span className="mb-1 text-base font-semibold text-stone-500">{unit}</span>}
      </div>
      <p className="mt-4 text-sm text-stone-500">{helper}</p>
    </Component>
  );
}

function mergeSummary(data) {
  return {
    ...fallback,
    ...data,
    weather: { ...fallback.weather, ...(data?.weather || {}) },
    location: { ...fallback.location, ...(data?.location || {}) },
    recent_scans: data?.recent_scans || [],
    featured_alert: data?.featured_alert || null,
  };
}

function getAlertToneClasses(tone) {
  if (tone === 'amber') {
    return {
      wrapper: 'border-amber-100 bg-amber-50 text-amber-800',
      iconBadge: 'bg-amber-100 text-amber-600',
      body: 'text-amber-700',
      button: 'border-amber-200 text-amber-700 hover:bg-amber-100',
    };
  }

  if (tone === 'sky') {
    return {
      wrapper: 'border-sky-100 bg-sky-50 text-sky-800',
      iconBadge: 'bg-sky-100 text-sky-600',
      body: 'text-sky-700',
      button: 'border-sky-200 text-sky-700 hover:bg-sky-100',
    };
  }

  if (tone === 'green') {
    return {
      wrapper: 'border-leaf-100 bg-leaf-50 text-leaf-800',
      iconBadge: 'bg-leaf-100 text-leaf-600',
      body: 'text-leaf-700',
      button: 'border-leaf-200 text-leaf-700 hover:bg-leaf-100',
    };
  }

  return {
    wrapper: 'border-red-100 bg-red-50 text-red-700',
    iconBadge: 'bg-red-100 text-red-600',
    body: 'text-red-600',
    button: 'border-red-200 text-red-600 hover:bg-red-100',
  };
}

function buildGpsErrorMessage(error, t) {
  if (!error) return t('couldNotAccessLocation');
  if (error.code === error.PERMISSION_DENIED) return t('locationAccessBlocked');
  if (error.code === error.POSITION_UNAVAILABLE) return t('locationUnavailable');
  if (error.code === error.TIMEOUT) return t('locationTimedOut');
  return t('couldNotAccessLocation');
}

function formatLocationMeta(location, t) {
  if (location?.latitude == null || location?.longitude == null) {
    return t('allowGpsOrRegisterFarm');
  }

  const coords = `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
  if (location.accuracy_m) {
    return `${coords} | +/-${Math.round(location.accuracy_m)}m`;
  }
  return coords;
}

function formatObservedAt(observedAt, t) {
  if (!observedAt) return t('updatedLatestWeather');
  const parsed = new Date(observedAt);
  if (Number.isNaN(parsed.getTime())) return t('updatedLatestWeather');
  return t('updatedAt', { time: parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) });
}

function roundMetric(value, fallbackValue = '--') {
  return Number.isFinite(value) ? Math.round(value) : fallbackValue;
}

function readSoilScanHistory() {
  try {
    const scans = JSON.parse(localStorage.getItem('agriscan_soil_scans') || '[]');
    return Array.isArray(scans) ? scans : [];
  } catch {
    return [];
  }
}

function getScanInputs(scan) {
  return scan?.inputs || scan || {};
}

function getNumericScanValue(scan, key) {
  const value = getScanInputs(scan)?.[key] ?? scan?.[key];
  if (value === '' || value === null || value === undefined) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function getTextScanValue(scan, key) {
  const value = getScanInputs(scan)?.[key] ?? scan?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatScanTimestamp(createdAt, t) {
  if (!createdAt) return t('noScanTimeRecorded');
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return t('noScanTimeRecorded');
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function buildMoistureMetric(scan, t) {
  const moisture = getNumericScanValue(scan, 'moisture_percent');
  if (moisture == null) {
    return {
      value: '--',
      unit: '%',
      status: t('noScan'),
      tone: 'green',
      helper: t('runManualSoilScanMoisture'),
    };
  }

  if (moisture < 35) {
    return {
      value: roundMetric(moisture),
      unit: '%',
      status: t('low'),
      tone: 'amber',
      helper: t('latestDryMoisture', { time: formatScanTimestamp(scan?.created_at, t) }),
    };
  }

  if (moisture > 65) {
    return {
      value: roundMetric(moisture),
      unit: '%',
      status: t('high'),
      tone: 'lime',
      helper: t('latestHighMoisture', { time: formatScanTimestamp(scan?.created_at, t) }),
    };
  }

  return {
    value: roundMetric(moisture),
    unit: '%',
    status: t('optimal'),
    tone: 'green',
    helper: t('measuredLatestFieldScan', { time: formatScanTimestamp(scan?.created_at, t) }),
  };
}

function buildTemperatureMetric(scan, weatherTemperature, t) {
  const soilTemperature = getNumericScanValue(scan, 'soil_temperature_c');
  if (soilTemperature == null) {
    if (Number.isFinite(weatherTemperature)) {
      return {
        value: roundMetric(weatherTemperature),
        unit: 'C',
        status: t('estimated'),
        tone: 'amber',
        helper: t('weatherTempEstimate'),
      };
    }

    return {
      value: '--',
      unit: 'C',
      status: t('noScan'),
      tone: 'amber',
      helper: t('addSoilTemperature'),
    };
  }

  if (soilTemperature < 22) {
    return {
      value: roundMetric(soilTemperature),
      unit: 'C',
      status: t('cool'),
      tone: 'amber',
      helper: t('measuredLatestSoilScan', { time: formatScanTimestamp(scan?.created_at, t) }),
    };
  }

  if (soilTemperature > 32) {
    return {
      value: roundMetric(soilTemperature),
      unit: 'C',
      status: t('hot'),
      tone: 'amber',
      helper: t('measuredLatestSoilScan', { time: formatScanTimestamp(scan?.created_at, t) }),
    };
  }

  return {
    value: roundMetric(soilTemperature),
    unit: 'C',
    status: t('optimal'),
    tone: 'amber',
    helper: t('measuredLatestSoilScan', { time: formatScanTimestamp(scan?.created_at, t) }),
  };
}

function nutrientShortLabel(level) {
  if (!level) return '-';
  return level.charAt(0).toUpperCase();
}

function nutrientFullLabel(level, t) {
  if (!level) return t('notSet');
  return t(level);
}

function buildNutrientMetric(scan, t) {
  const nitrogen = getTextScanValue(scan, 'nitrogen_level');
  const phosphorus = getTextScanValue(scan, 'phosphorus_level');
  const potassium = getTextScanValue(scan, 'potassium_level');
  const levels = [nitrogen, phosphorus, potassium].filter(Boolean);

  if (levels.length === 0) {
    return {
      value: '--',
      unit: 'NPK',
      status: t('noScan'),
      tone: 'lime',
      helper: t('runManualSoilScanNutrients'),
    };
  }

  const lowCount = levels.filter((level) => level === 'low').length;
  const highCount = levels.filter((level) => level === 'high').length;
  let status = t('balanced');
  if (lowCount >= 2) status = t('low');
  else if (lowCount >= 1) status = t('requiresMix');
  else if (highCount >= 2) status = t('rich');

  return {
    value: `${nutrientShortLabel(nitrogen)}/${nutrientShortLabel(phosphorus)}/${nutrientShortLabel(potassium)}`,
    unit: 'NPK',
    status,
    tone: 'lime',
    helper: t('latestNpkReading', {
      nitrogen: nutrientFullLabel(nitrogen, t),
      phosphorus: nutrientFullLabel(phosphorus, t),
      potassium: nutrientFullLabel(potassium, t),
    }),
  };
}

function buildPhChartData(scans) {
  return scans
    .filter((scan) => getNumericScanValue(scan, 'ph_level') != null)
    .slice(0, 7)
    .reverse()
    .map((scan) => {
      const parsed = new Date(scan.created_at);
      const label = Number.isNaN(parsed.getTime())
        ? `Scan ${scan.id || ''}`.trim()
        : parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return {
        day: label,
        ph: getNumericScanValue(scan, 'ph_level'),
      };
    });
}

function translateDiseaseLabel(value, t) {
  const key = String(value || '').trim().toLowerCase();
  const labels = {
    'healthy crop': 'healthyCrop',
    'leaf spot or blight symptoms': 'leafSpotOrBlightSymptoms',
    'pest-related leaf damage': 'pestRelatedLeafDamage',
    'pest or physical leaf damage': 'pestOrPhysicalLeafDamage',
    'crop scan needs review': 'cropScanNeedsReview',
  };
  return labels[key] ? t(labels[key]) : value;
}

function translateAlertBody(body, t) {
  const match = String(body || '').match(/^(.+?):\s(.+?) detected with (\d+)% confidence\./i);
  if (!match) return body;
  return t('scanAlertBody', {
    crop: match[1],
    disease: translateDiseaseLabel(match[2], t),
    confidence: match[3],
  });
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [summary, setSummary] = useState(fallback);
  const [soilScans, setSoilScans] = useState([]);
  const [gpsState, setGpsState] = useState({ locating: false, error: '', attempted: false });
  const initialLoadRef = useRef(false);

  const loadSoilScans = useCallback(() => {
    setSoilScans(readSoilScanHistory());
  }, []);

  const loadSummary = useCallback(async (params = {}) => {
    const { data } = await api.get('/dashboard/summary', { params });
    const nextSummary = mergeSummary(data);
    setSummary(nextSummary);
    return nextSummary;
  }, []);

  const requestPreciseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState({ locating: false, error: t('geolocationUnsupported'), attempted: true });
      return;
    }

    setGpsState({ locating: true, error: '', attempted: true });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await loadSummary({
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy_m: Math.round(position.coords.accuracy),
            location_label: t('currentDeviceLocation'),
          });
          setGpsState({ locating: false, error: '', attempted: true });
        } catch {
          setGpsState({ locating: false, error: t('couldNotUpdateLiveWeather'), attempted: true });
        }
      },
      (error) => {
        setGpsState({ locating: false, error: buildGpsErrorMessage(error, t), attempted: true });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [loadSummary, t]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;

    loadSoilScans();
    loadSummary().catch(() => setSummary(fallback));
    requestPreciseLocation();
  }, [loadSoilScans, loadSummary, requestPreciseLocation]);

  useEffect(() => {
    window.addEventListener('focus', loadSoilScans);
    return () => window.removeEventListener('focus', loadSoilScans);
  }, [loadSoilScans]);

  const firstName = useMemo(() => user?.full_name?.split(' ')?.[0] || 'Juan', [user]);
  const weatherTemperature = roundMetric(summary.weather.temperature_c, 31);
  const weatherHumidity = roundMetric(summary.weather.humidity, 65);
  const weatherWind = roundMetric(summary.weather.wind_speed_kph, 12);
  const feelsLike = roundMetric(summary.weather.apparent_temperature_c, weatherTemperature);
  const precipitation = Number.isFinite(summary.weather.precipitation_mm) ? summary.weather.precipitation_mm.toFixed(1) : '0.0';
  const locationSourceLabel =
    summary.location.source === 'device'
      ? t('usingDeviceGps')
      : summary.location.source === 'farm'
        ? t('usingFarmGps')
        : t('locationNotSet');
  const latestSoilScan = soilScans[0] || null;
  const moistureMetric = useMemo(() => buildMoistureMetric(latestSoilScan, t), [latestSoilScan, t]);
  const temperatureMetric = useMemo(
    () => buildTemperatureMetric(latestSoilScan, Number(summary.weather.temperature_c), t),
    [latestSoilScan, summary.weather.temperature_c, t]
  );
  const nutrientMetric = useMemo(() => buildNutrientMetric(latestSoilScan, t), [latestSoilScan, t]);
  const phChartData = useMemo(() => buildPhChartData(soilScans), [soilScans]);
  const featuredAlert = summary.featured_alert;
  const alertToneClasses = getAlertToneClasses(featuredAlert?.tone || 'green');
  const featuredAlertTitle = featuredAlert?.title === 'Crop disease alert' ? t('cropDiseaseAlert') : featuredAlert?.title;
  const featuredAlertBody = translateAlertBody(featuredAlert?.body, t);
  const featuredAlertAction =
    featuredAlert?.action_label === 'Open Disease Detector' ? t('openDiseaseDetector') : featuredAlert?.action_label;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{t('overview')}</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-normal text-stone-950 sm:text-3xl">{t('dashboardGreeting', { name: firstName })}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{t('dashboardSubtitle')}</p>
        </div>
        <Link to="/scan" className="btn-primary h-11 w-full px-5 text-sm sm:w-auto">
          <ScanLine className="h-5 w-5" />
          {t('newManualScan')}
        </Link>
      </div>

      <section className={`mb-6 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${alertToneClasses.wrapper}`}>
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${alertToneClasses.iconBadge}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold">
              {featuredAlertTitle || t('noActiveFieldAlerts')}
            </p>
            <p className={`text-sm ${alertToneClasses.body}`}>
              {featuredAlertBody || t('liveAlertsPlaceholder')}
            </p>
          </div>
        </div>
        {featuredAlert?.action_to ? (
          <Link to={featuredAlert.action_to} className={`btn-secondary ${alertToneClasses.button}`}>
            {featuredAlertAction || t('viewDetails')}
          </Link>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={Droplets} label={t('soilMoisture')} value={moistureMetric.value} unit={moistureMetric.unit} status={moistureMetric.status} tone={moistureMetric.tone} helper={moistureMetric.helper} to="/scan" />
            <MetricCard icon={Thermometer} label={t('soilTemp')} value={temperatureMetric.value} unit={temperatureMetric.unit} status={temperatureMetric.status} tone={temperatureMetric.tone} helper={temperatureMetric.helper} to="/scan" />
            <MetricCard icon={Zap} label={t('nutrientLevel')} value={nutrientMetric.value} unit={nutrientMetric.unit} status={nutrientMetric.status} tone={nutrientMetric.tone} helper={nutrientMetric.helper} to="/scan" />
          </div>

          <section className="surface rounded-lg p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-stone-950">{t('soilPhTrend')}</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {phChartData.length > 0 ? t('historicalSevenScans') : t('noPhScanHistory')}
                </p>
              </div>
              <Link to="/reports" className="inline-flex items-center gap-2 text-sm font-bold text-leaf-700">
                {t('fullReport')} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {phChartData.length > 0 ? (
              <>
                <div className="mt-6 h-72 sm:mt-8 sm:h-[360px] xl:h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={phChartData} margin={{ left: 0, right: 20, top: 10, bottom: 10 }}>
                      <CartesianGrid stroke="#e7e5e4" strokeDasharray="6 8" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 13, fill: '#78716c' }} axisLine={false} tickLine={false} />
                      <YAxis domain={['dataMin - 0.4', 'dataMax + 0.4']} tick={{ fontSize: 13, fill: '#78716c' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="ph" stroke="#22c55e" strokeWidth={3} dot={{ r: 5, fill: '#22c55e' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex justify-center text-sm font-semibold text-stone-500">
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-leaf-500" /> {t('soilPhLevel')}</span>
                </div>
              </>
            ) : (
              <div className="mt-8 grid min-h-56 place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
                <div>
                  <p className="text-lg font-bold text-stone-900">{t('noPhScanHistoryTitle')}</p>
                  <p className="mt-2 text-sm text-stone-500">{t('noPhScanHistoryBody')}</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-sky-100 bg-sky-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sky-500">{t('currentWeather')}</p>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <MapPin className="h-4 w-4 text-sky-500" />
                  <span>{summary.location.label}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-stone-500">{locationSourceLabel}</p>
                <p className="mt-1 text-xs text-stone-500">{formatLocationMeta(summary.location, t)}</p>
              </div>
              <CloudSun className="h-7 w-7 text-sky-400" />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-secondary h-10 px-4 text-sm" type="button" onClick={requestPreciseLocation} disabled={gpsState.locating}>
                {gpsState.locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                {gpsState.locating ? t('locating') : t('useCurrentGps')}
              </button>
              <Link to="/farms" className="btn-secondary h-10 px-4 text-sm">
                <MapPin className="h-4 w-4" />
                {t('farmMap')}
              </Link>
            </div>

            {gpsState.error && <p className="mt-3 text-sm font-medium text-amber-700">{gpsState.error}</p>}

            <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-5">
              <span className="text-3xl font-bold text-stone-950 sm:text-4xl">{weatherTemperature}C</span>
              <div className="border-t border-sky-200 pt-3 text-sm text-stone-700 min-[420px]:border-l min-[420px]:border-t-0 min-[420px]:pl-5 min-[420px]:pt-0">
                <p>{t('humidity')}: {weatherHumidity}%</p>
                <p>{t('wind')}: {weatherWind} km/h</p>
                <p>{t('feelsLike')}: {feelsLike}C</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('rainfall')}</p>
                <p className="mt-1 text-lg font-bold text-stone-950">{precipitation} mm</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('status')}</p>
                <p className="mt-1 text-sm font-semibold text-stone-900">{formatObservedAt(summary.weather.observed_at, t)}</p>
              </div>
            </div>

            <TranslatedText as="p" className="mt-5 text-sm leading-6 text-stone-600" text={summary.weather.summary} />
          </section>

          <section className="surface rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">{t('quickActions')}</h2>
              <span className="status-pill border border-stone-200 bg-stone-50 text-stone-600">{t('fieldTools')}</span>
            </div>
            <div className="mt-4 space-y-2">
              {[
                [ScanLine, t('manualScan'), t('recordSoilReadings'), '/scan'],
                [FlaskConical, t('diseaseDetector'), t('analyzeCropImages'), '/disease-detector'],
                [MapPin, t('farmMap'), t('reviewFieldLocations'), '/farms'],
              ].map(([Icon, label, helper, to]) => (
                <Link
                  key={label}
                  to={to}
                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3 transition hover:border-leaf-200 hover:bg-leaf-50"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-50 text-leaf-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-stone-950">{label}</span>
                      <span className="block truncate text-xs text-stone-500">{helper}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
