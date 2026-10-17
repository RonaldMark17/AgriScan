import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
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
import PageHeader from '../components/shared/PageHeader.jsx';
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
  const toneClasses = {
    amber: {
      icon: 'text-amber-600 bg-amber-50/80 border-amber-200/60 shadow-amber-500/10',
      pill: 'bg-amber-50 text-amber-700 border-amber-200/80',
    },
    lime: {
      icon: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60 shadow-emerald-500/10',
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    },
    green: {
      icon: 'text-emerald-600 bg-emerald-50/80 border-emerald-200/60 shadow-emerald-500/10',
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    },
  }[tone] || {
    icon: 'text-emerald-600 bg-emerald-50/80 border-emerald-200/60 shadow-emerald-500/10',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  };

  const Component = to ? Link : 'section';

  return (
    <Component
      to={to}
      className={`dashboard-metric-card surface rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-950/5 ${
        to ? 'block cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl border shadow-sm ${toneClasses.icon}`}>
          <Icon className="h-6 w-6" />
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${toneClasses.pill}`}>{status}</span>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex min-w-0 items-baseline gap-1">
        <span className="text-3xl font-black tracking-tight text-slate-900">{value}</span>
        {unit && <span className="text-sm font-bold text-slate-400">{unit}</span>}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{helper}</p>
    </Component>
  );
}

function formatTimelineTime(value) {
  if (!value) return 'Recently';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function buildActivityTimeline(summary, soilScans, t) {
  const diseaseItems = (summary.recent_scans || []).slice(0, 3).map((scan, index) => ({
    key: `disease-${scan.id || index}`,
    title: scan.disease_name || scan.result || t('diseaseDetector'),
    meta: scan.crop_label || scan.crop || t('cropDiseaseAlert'),
    time: scan.created_at,
    tone: 'leaf',
  }));
  const soilItems = soilScans.slice(0, 3).map((scan, index) => ({
    key: `soil-${scan.id || scan.created_at || index}`,
    title: t('manualScan'),
    meta: scan?.inputs?.province || scan?.province || t('soilRecommendationForm'),
    time: scan.created_at,
    tone: 'amber',
  }));

  return [...diseaseItems, ...soilItems]
    .sort((first, second) => new Date(second.time || 0).getTime() - new Date(first.time || 0).getTime())
    .slice(0, 5);
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

function formatPhTick(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toFixed(2).replace(/\.?0+$/, '');
}

function getPhChartDomain(data) {
  const values = data.map((item) => Number(item.ph)).filter(Number.isFinite);
  if (values.length === 0) return [5.5, 7.5];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? 0.35 : 0.2;
  const lower = Math.max(0, Math.floor((min - padding) * 10) / 10);
  const upper = Math.min(14, Math.ceil((max + padding) * 10) / 10);
  return [lower, upper];
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
  const phChartDomain = useMemo(() => getPhChartDomain(phChartData), [phChartData]);
  const featuredAlert = summary.featured_alert;
  const alertToneClasses = getAlertToneClasses(featuredAlert?.tone || 'green');
  const featuredAlertTitle = featuredAlert?.title === 'Crop disease alert' ? t('cropDiseaseAlert') : featuredAlert?.title;
  const featuredAlertBody = translateAlertBody(featuredAlert?.body, t);
  const featuredAlertAction =
    featuredAlert?.action_label === 'Open Disease Detector' ? t('openDiseaseDetector') : featuredAlert?.action_label;
  const activityTimeline = useMemo(() => buildActivityTimeline(summary, soilScans, t), [soilScans, summary, t]);

  return (
    <div className="page-stack space-y-6">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900 via-stone-900 to-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 h-48 w-48 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Smart Farm Operations Active
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
              {t('dashboardGreeting', { name: firstName })}
            </h1>
            <p className="mt-2 text-sm text-emerald-100/80 leading-relaxed">
              {t('dashboardSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/disease-detector"
              className="btn-primary flex h-12 items-center gap-2.5 rounded-2xl px-6 text-sm font-bold shadow-lg shadow-emerald-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/40"
            >
              <FlaskConical className="h-5 w-5" />
              <span>AI Disease Scan</span>
            </Link>
            <Link
              to="/scan"
              className="btn-secondary flex h-12 items-center gap-2.5 rounded-2xl border-white/20 bg-white/10 px-5 text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/20"
            >
              <ScanLine className="h-5 w-5" />
              <span>{t('newManualScan')}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Alert Bar */}
      <section className={`flex flex-col gap-4 rounded-2xl border p-4 shadow-sm transition-all sm:flex-row sm:items-center sm:justify-between ${alertToneClasses.wrapper}`}>
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-sm ${alertToneClasses.iconBadge}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold">
              {featuredAlertTitle || t('noActiveFieldAlerts')}
            </p>
            <p className={`text-xs sm:text-sm ${alertToneClasses.body}`}>
              {featuredAlertBody || t('liveAlertsPlaceholder')}
            </p>
          </div>
        </div>
        {featuredAlert?.action_to ? (
          <Link to={featuredAlert.action_to} className={`btn-secondary shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${alertToneClasses.button}`}>
            {featuredAlertAction || t('viewDetails')}
          </Link>
        ) : null}
      </section>

      <div className="content-sidebar-layout">
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            <MetricCard icon={Droplets} label={t('soilMoisture')} value={moistureMetric.value} unit={moistureMetric.unit} status={moistureMetric.status} tone={moistureMetric.tone} helper={moistureMetric.helper} to="/scan" />
            <MetricCard icon={Thermometer} label={t('soilTemp')} value={temperatureMetric.value} unit={temperatureMetric.unit} status={temperatureMetric.status} tone={temperatureMetric.tone} helper={temperatureMetric.helper} to="/scan" />
            <MetricCard icon={Zap} label={t('nutrientLevel')} value={nutrientMetric.value} unit={nutrientMetric.unit} status={nutrientMetric.status} tone={nutrientMetric.tone} helper={nutrientMetric.helper} to="/scan" />
          </div>

          {/* Soil pH Trend Chart */}
          <section className="surface rounded-3xl p-6 sm:p-7 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900">{t('soilPhTrend')}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {phChartData.length > 0 ? t('historicalSevenScans') : t('noPhScanHistory')}
                </p>
              </div>
              <Link to="/reports" className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition">
                {t('fullReport')} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {phChartData.length > 0 ? (
              <>
                <div className="mt-6 h-64 sm:mt-8 sm:h-80 xl:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={phChartData} margin={{ left: 8, right: 20, top: 10, bottom: 10 }}>
                      <CartesianGrid stroke="#f1f5f9" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis
                        width={44}
                        domain={phChartDomain}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickFormatter={formatPhTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          borderRadius: '1rem',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="ph"
                        stroke="#059669"
                        strokeWidth={3.5}
                        dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }}
                        activeDot={{ r: 7, fill: '#047857' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex justify-center text-xs font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t('soilPhLevel')}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-6 grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <div>
                  <p className="text-base font-bold text-slate-800">{t('noPhScanHistoryTitle')}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('noPhScanHistoryBody')}</p>
                </div>
              </div>
            )}
          </section>

          {/* Activity Timeline */}
          <section className="surface dashboard-timeline rounded-3xl p-6 sm:p-7 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="section-title flex items-center gap-2 text-lg font-extrabold text-slate-900">
                  <CalendarClock className="h-5 w-5 text-emerald-600" />
                  Field Activity Timeline
                </h2>
                <p className="mt-1 text-xs text-slate-500">Recent AI diagnostics, manual sensor inputs, and field updates.</p>
              </div>
              <Link to="/reports" className="btn-secondary h-9 rounded-xl px-3 text-xs font-bold">
                {t('reports')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {activityTimeline.length > 0 ? (
              <div className="mt-5 space-y-3">
                {activityTimeline.map((item) => (
                  <article key={item.key} className="timeline-item flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`h-3 w-3 rounded-full shrink-0 ${item.tone === 'amber' ? 'bg-amber-400 ring-4 ring-amber-100' : 'bg-emerald-500 ring-4 ring-emerald-100'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">{item.title}</p>
                        <p className="truncate text-[11px] text-slate-500">{item.meta}</p>
                      </div>
                    </div>
                    <time className="shrink-0 text-[11px] font-semibold text-slate-400">{formatTimelineTime(item.time)}</time>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <CalendarClock className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-2 text-xs font-bold text-slate-800">No field activity yet</p>
                <p className="mt-1 text-xs text-slate-500">Run a scan or register farm data to start the timeline.</p>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar Widgets */}
        <aside className="space-y-6">
          {/* Current Weather Widget */}
          <section className="rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-sky-50/60 to-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-sky-600">{t('currentWeather')}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                  <MapPin className="h-4 w-4 text-sky-500 shrink-0" />
                  <span className="truncate">{summary.location.label}</span>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{locationSourceLabel}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{formatLocationMeta(summary.location, t)}</p>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-100/80 text-sky-600 shadow-sm">
                <CloudSun className="h-7 w-7" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn-secondary h-9 rounded-xl px-3 text-xs font-bold"
                type="button"
                onClick={requestPreciseLocation}
                disabled={gpsState.locating}
              >
                {gpsState.locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                {gpsState.locating ? t('locating') : t('useCurrentGps')}
              </button>
              <Link to="/farms" className="btn-secondary h-9 rounded-xl px-3 text-xs font-bold">
                <MapPin className="h-3.5 w-3.5" />
                {t('farmMap')}
              </Link>
            </div>

            {gpsState.error && <p className="mt-2 text-xs font-medium text-amber-700">{gpsState.error}</p>}

            <div className="mt-5 flex items-baseline gap-4 rounded-2xl bg-white/80 p-4 border border-sky-100 shadow-sm">
              <span className="text-3xl font-black text-slate-900 sm:text-4xl">{weatherTemperature}°C</span>
              <div className="border-l border-slate-200 pl-4 text-xs font-medium text-slate-600 space-y-0.5">
                <p>{t('humidity')}: <span className="font-bold text-slate-800">{weatherHumidity}%</span></p>
                <p>{t('wind')}: <span className="font-bold text-slate-800">{weatherWind} km/h</span></p>
                <p>{t('feelsLike')}: <span className="font-bold text-slate-800">{feelsLike}°C</span></p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-white bg-white/70 p-3 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('rainfall')}</p>
                <p className="mt-0.5 text-base font-extrabold text-slate-900">{precipitation} mm</p>
              </div>
              <div className="rounded-2xl border border-white bg-white/70 p-3 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('status')}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 truncate">{formatObservedAt(summary.weather.observed_at, t)}</p>
              </div>
            </div>

            <TranslatedText as="p" className="mt-4 text-xs leading-relaxed text-slate-600" text={summary.weather.summary} />
          </section>

          {/* Quick Actions Deck */}
          <section className="surface rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold text-slate-900">{t('quickActions')}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                {t('fieldTools')}
              </span>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                [FlaskConical, t('diseaseDetector'), t('analyzeCropImages'), '/disease-detector', 'from-emerald-500 to-emerald-700 text-white'],
                [ScanLine, t('manualScan'), t('recordSoilReadings'), '/scan', 'from-amber-500 to-amber-600 text-white'],
                [MapPin, t('farmMap'), t('reviewFieldLocations'), '/farms', 'from-sky-500 to-sky-600 text-white'],
              ].map(([Icon, label, helper, to, gradient]) => (
                <Link
                  key={label}
                  to={to}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-sm ${gradient}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-900">{label}</span>
                      <span className="block truncate text-[11px] text-slate-400">{helper}</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
