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

function buildGpsErrorMessage(error) {
  if (!error) return 'Could not access your current location.';
  if (error.code === error.PERMISSION_DENIED) return 'Location access was blocked. Showing your registered farm weather instead.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Your current location is unavailable right now.';
  if (error.code === error.TIMEOUT) return 'Location lookup timed out. Please try again.';
  return 'Could not access your current location.';
}

function formatLocationMeta(location) {
  if (location?.latitude == null || location?.longitude == null) {
    return 'Allow GPS access or register a farm with coordinates for precise weather.';
  }

  const coords = `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
  if (location.accuracy_m) {
    return `${coords} | +/-${Math.round(location.accuracy_m)}m`;
  }
  return coords;
}

function formatObservedAt(observedAt) {
  if (!observedAt) return 'Updated with the latest available weather data.';
  const parsed = new Date(observedAt);
  if (Number.isNaN(parsed.getTime())) return 'Updated with the latest available weather data.';
  return `Updated ${parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
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

function formatScanTimestamp(createdAt) {
  if (!createdAt) return 'No scan time recorded.';
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return 'No scan time recorded.';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function buildMoistureMetric(scan) {
  const moisture = getNumericScanValue(scan, 'moisture_percent');
  if (moisture == null) {
    return {
      value: '--',
      unit: '%',
      status: 'No Scan',
      tone: 'green',
      helper: 'Run a manual soil scan to capture real field moisture.',
    };
  }

  if (moisture < 35) {
    return {
      value: roundMetric(moisture),
      unit: '%',
      status: 'Low',
      tone: 'amber',
      helper: `Latest soil scan recorded dry field conditions on ${formatScanTimestamp(scan?.created_at)}.`,
    };
  }

  if (moisture > 65) {
    return {
      value: roundMetric(moisture),
      unit: '%',
      status: 'High',
      tone: 'lime',
      helper: `Latest soil scan recorded high moisture on ${formatScanTimestamp(scan?.created_at)}.`,
    };
  }

  return {
    value: roundMetric(moisture),
    unit: '%',
    status: 'Optimal',
    tone: 'green',
    helper: `Measured from your latest field scan on ${formatScanTimestamp(scan?.created_at)}.`,
  };
}

function buildTemperatureMetric(scan, weatherTemperature) {
  const soilTemperature = getNumericScanValue(scan, 'soil_temperature_c');
  if (soilTemperature == null) {
    if (Number.isFinite(weatherTemperature)) {
      return {
        value: roundMetric(weatherTemperature),
        unit: 'C',
        status: 'Estimated',
        tone: 'amber',
        helper: 'Using current weather as a temporary field estimate. Add soil temperature in Manual Scan for a direct reading.',
      };
    }

    return {
      value: '--',
      unit: 'C',
      status: 'No Scan',
      tone: 'amber',
      helper: 'Add soil temperature in Manual Scan to replace this placeholder with a direct field reading.',
    };
  }

  if (soilTemperature < 22) {
    return {
      value: roundMetric(soilTemperature),
      unit: 'C',
      status: 'Cool',
      tone: 'amber',
      helper: `Measured from your latest soil scan on ${formatScanTimestamp(scan?.created_at)}.`,
    };
  }

  if (soilTemperature > 32) {
    return {
      value: roundMetric(soilTemperature),
      unit: 'C',
      status: 'Hot',
      tone: 'amber',
      helper: `Measured from your latest soil scan on ${formatScanTimestamp(scan?.created_at)}.`,
    };
  }

  return {
    value: roundMetric(soilTemperature),
    unit: 'C',
    status: 'Optimal',
    tone: 'amber',
    helper: `Measured from your latest soil scan on ${formatScanTimestamp(scan?.created_at)}.`,
  };
}

function nutrientShortLabel(level) {
  if (!level) return '-';
  return level.charAt(0).toUpperCase();
}

function nutrientFullLabel(level) {
  if (!level) return 'not set';
  return level;
}

function buildNutrientMetric(scan) {
  const nitrogen = getTextScanValue(scan, 'nitrogen_level');
  const phosphorus = getTextScanValue(scan, 'phosphorus_level');
  const potassium = getTextScanValue(scan, 'potassium_level');
  const levels = [nitrogen, phosphorus, potassium].filter(Boolean);

  if (levels.length === 0) {
    return {
      value: '--',
      unit: 'NPK',
      status: 'No Scan',
      tone: 'lime',
      helper: 'Run a manual soil scan to record real nutrient levels.',
    };
  }

  const lowCount = levels.filter((level) => level === 'low').length;
  const highCount = levels.filter((level) => level === 'high').length;
  let status = 'Balanced';
  if (lowCount >= 2) status = 'Low';
  else if (lowCount >= 1) status = 'Requires Mix';
  else if (highCount >= 2) status = 'Rich';

  return {
    value: `${nutrientShortLabel(nitrogen)}/${nutrientShortLabel(phosphorus)}/${nutrientShortLabel(potassium)}`,
    unit: 'NPK',
    status,
    tone: 'lime',
    helper: `Latest NPK reading: N ${nutrientFullLabel(nitrogen)}, P ${nutrientFullLabel(phosphorus)}, K ${nutrientFullLabel(potassium)}.`,
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
      setGpsState({ locating: false, error: 'Geolocation is not supported on this device.', attempted: true });
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
            location_label: 'Current device location',
          });
          setGpsState({ locating: false, error: '', attempted: true });
        } catch {
          setGpsState({ locating: false, error: 'Could not update live weather right now.', attempted: true });
        }
      },
      (error) => {
        setGpsState({ locating: false, error: buildGpsErrorMessage(error), attempted: true });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [loadSummary]);

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
      ? 'Using device GPS'
      : summary.location.source === 'farm'
        ? 'Using registered farm GPS'
        : 'Location not set';
  const latestSoilScan = soilScans[0] || null;
  const moistureMetric = useMemo(() => buildMoistureMetric(latestSoilScan), [latestSoilScan]);
  const temperatureMetric = useMemo(
    () => buildTemperatureMetric(latestSoilScan, Number(summary.weather.temperature_c)),
    [latestSoilScan, summary.weather.temperature_c]
  );
  const nutrientMetric = useMemo(() => buildNutrientMetric(latestSoilScan), [latestSoilScan]);
  const phChartData = useMemo(() => buildPhChartData(soilScans), [soilScans]);
  const featuredAlert = summary.featured_alert;
  const alertToneClasses = getAlertToneClasses(featuredAlert?.tone || 'green');

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Overview</p>
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
              {featuredAlert?.title || 'No active field alerts'}
            </p>
            <p className={`text-sm ${alertToneClasses.body}`}>
              {featuredAlert?.body || 'Live scan, weather, and notification alerts will appear here when available.'}
            </p>
          </div>
        </div>
        {featuredAlert?.action_to ? (
          <Link to={featuredAlert.action_to} className={`btn-secondary ${alertToneClasses.button}`}>
            {featuredAlert.action_label || 'View details'}
          </Link>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={Droplets} label="Soil Moisture" value={moistureMetric.value} unit={moistureMetric.unit} status={moistureMetric.status} tone={moistureMetric.tone} helper={moistureMetric.helper} to="/scan" />
            <MetricCard icon={Thermometer} label="Soil Temp" value={temperatureMetric.value} unit={temperatureMetric.unit} status={temperatureMetric.status} tone={temperatureMetric.tone} helper={temperatureMetric.helper} to="/scan" />
            <MetricCard icon={Zap} label="Nutrient Level" value={nutrientMetric.value} unit={nutrientMetric.unit} status={nutrientMetric.status} tone={nutrientMetric.tone} helper={nutrientMetric.helper} to="/scan" />
          </div>

          <section className="surface rounded-lg p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-stone-950">Soil pH Trend</h2>
                <p className="mt-1 text-sm text-stone-500">
                  {phChartData.length > 0 ? 'Historical data from your last 7 soil scans' : 'No real pH scan history yet'}
                </p>
              </div>
              <Link to="/reports" className="inline-flex items-center gap-2 text-sm font-bold text-leaf-700">
                Full Report <ArrowRight className="h-4 w-4" />
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
                  <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-leaf-500" /> Soil pH Level</span>
                </div>
              </>
            ) : (
              <div className="mt-8 grid min-h-56 place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
                <div>
                  <p className="text-lg font-bold text-stone-900">No pH scan history yet</p>
                  <p className="mt-2 text-sm text-stone-500">Complete a manual soil scan and enter pH data to build this chart from real field readings.</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-sky-100 bg-sky-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sky-500">Current Weather</p>
                <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <MapPin className="h-4 w-4 text-sky-500" />
                  <span>{summary.location.label}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-stone-500">{locationSourceLabel}</p>
                <p className="mt-1 text-xs text-stone-500">{formatLocationMeta(summary.location)}</p>
              </div>
              <CloudSun className="h-7 w-7 text-sky-400" />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-secondary h-10 px-4 text-sm" type="button" onClick={requestPreciseLocation} disabled={gpsState.locating}>
                {gpsState.locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                {gpsState.locating ? 'Locating...' : 'Use Current GPS'}
              </button>
              <Link to="/farms" className="btn-secondary h-10 px-4 text-sm">
                <MapPin className="h-4 w-4" />
                Farm Map
              </Link>
            </div>

            {gpsState.error && <p className="mt-3 text-sm font-medium text-amber-700">{gpsState.error}</p>}

            <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-5">
              <span className="text-3xl font-bold text-stone-950 sm:text-4xl">{weatherTemperature}C</span>
              <div className="border-t border-sky-200 pt-3 text-sm text-stone-700 min-[420px]:border-l min-[420px]:border-t-0 min-[420px]:pl-5 min-[420px]:pt-0">
                <p>Humidity: {weatherHumidity}%</p>
                <p>Wind: {weatherWind} km/h</p>
                <p>Feels like: {feelsLike}C</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Rainfall</p>
                <p className="mt-1 text-lg font-bold text-stone-950">{precipitation} mm</p>
              </div>
              <div className="rounded-lg bg-white/70 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Status</p>
                <p className="mt-1 text-sm font-semibold text-stone-900">{formatObservedAt(summary.weather.observed_at)}</p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-stone-600">{summary.weather.summary}</p>
          </section>

          <section className="surface rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Quick actions</h2>
              <span className="status-pill border border-stone-200 bg-stone-50 text-stone-600">Field tools</span>
            </div>
            <div className="mt-4 space-y-2">
              {[
                [ScanLine, 'Manual scan', 'Record soil readings', '/scan'],
                [FlaskConical, 'Disease detector', 'Analyze crop images', '/disease-detector'],
                [MapPin, 'Farm map', 'Review field locations', '/farms'],
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
