import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Droplets,
  Filter,
  FlaskConical,
  Gauge,
  Info,
  Leaf,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Sprout,
  Sun,
  Thermometer,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { recommendationsImage, soilScanImage } from '../assets/visuals/index.js';
import { useI18n } from '../context/I18nContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { reverseGeocodeLocation } from '../utils/openStreetMap.js';
import { getApiErrorMessage } from '../utils/apiErrors.js';

const initialForm = {
  soil_type: 'Loam',
  ph_level: '',
  moisture_percent: '',
  soil_temperature_c: '',
  nitrogen_level: 'medium',
  phosphorus_level: 'medium',
  potassium_level: 'medium',
  drainage: 'moderate',
  sunlight: 'full sun',
  season: 'regular season',
  province: '',
};

const soilOptions = ['Loam', 'Sandy Loam', 'Clay Loam', 'Clay', 'Sandy', 'Alluvial'];
const drainageOptions = [
  ['good', 'Good'],
  ['moderate', 'Moderate'],
  ['poor', 'Poor'],
  ['waterlogged', 'Waterlogged'],
];
const sunlightOptions = [
  ['full sun', 'Full Sun'],
  ['partial shade', 'Partial Shade'],
];
const seasonOptions = [
  ['regular season', 'Regular'],
  ['wet season', 'Wet Season'],
  ['dry season', 'Dry Season'],
];
const nutrientLevels = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];
const categories = ['All Crops', 'Vegetables', 'Grains', 'Fruits', 'Root Crops'];
const sortModes = ['Suitability', 'Crop Name', 'Planting Window'];

const inputGuides = [
  {
    title: 'Soil Type',
    body: 'Touch moist soil by hand: gritty means sandy, sticky means clay, and soft crumbly soil means loam.',
  },
  {
    title: 'pH Level',
    body: 'Use a pH strip, soil meter, or local agriculture office test. Most common crops prefer around 6.0 to 7.0.',
  },
  {
    title: 'Moisture %',
    body: 'Use a moisture meter if available. Dry and powdery soil is low, cool damp soil is medium, and soggy soil is high.',
  },
  {
    title: 'Soil Temperature',
    body: 'Use a soil thermometer or soil meter if available. Warm soil usually speeds up heat-tolerant crops, while cooler soil slows early growth.',
  },
  {
    title: 'NPK Levels',
    body: 'If you have no soil kit, use crop signs: pale leaves often mean low nitrogen, weak roots can mean low phosphorus, and brown leaf edges can mean low potassium.',
  },
  {
    title: 'Drainage and Sunlight',
    body: 'Good drainage means water disappears quickly. Full sun means at least 6 hours of direct sunlight per day.',
  },
  {
    title: 'Season and Province',
    body: 'Choose the current season in your area. Add your province when GPS is unavailable or when you want to record the location manually.',
  },
];

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function makeHistoryId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildGpsErrorMessage(error) {
  if (!error) return 'Could not access your current location.';
  if (error.code === error.PERMISSION_DENIED) return 'Location access was blocked. AgriScan will fall back to your saved farm location if available.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Your current location is unavailable right now.';
  if (error.code === error.TIMEOUT) return 'Location lookup timed out. Please try again.';
  return 'Could not access your current location.';
}

function formatLocationMeta(location) {
  if (location?.latitude == null || location?.longitude == null) return 'Allow GPS access to use live location-aware recommendations.';
  const coords = `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
  if (location.accuracy_m) {
    return `${coords} | +/-${Math.round(location.accuracy_m)}m`;
  }
  return coords;
}

function getCropCategory(cropName) {
  const crop = cropName.toLowerCase();
  if (crop.includes('rice') || crop.includes('corn')) return 'Grains';
  if (crop.includes('cassava') || crop.includes('sweet potato') || crop.includes('taro') || crop.includes('gabi')) return 'Root Crops';
  if (crop.includes('calamansi') || crop.includes('banana') || crop.includes('mango')) return 'Fruits';
  return 'Vegetables';
}

function buildCropCard(item, result) {
  const category = getCropCategory(item.crop);
  const locationTag = result?.location?.label ? 'Location Aware' : 'Soil Match';
  const weatherTag = result?.weather_summary ? 'Live Weather' : 'Manual Soil';

  return {
    id: `${item.crop}-${item.suitability}`,
    name: item.crop,
    variety: category,
    category,
    score: item.suitability,
    tags: [locationTag, weatherTag, item.crop === result?.best_crop ? 'Top Match' : 'Alternative'],
    window: item.planting_window,
    guide: item.reason,
    watering: item.watering,
    fertilizer: item.fertilizer,
  };
}

function buildAudioGuide(selectedCrop, result, t) {
  if (selectedCrop) {
    return t('audioSelectedCropGuide', {
      crop: selectedCrop.name,
      guide: selectedCrop.guide,
      watering: selectedCrop.watering,
      fertilizer: selectedCrop.fertilizer,
    });
  }

  if (result?.best_crop) {
    const weather = result.weather_summary ? t('audioCurrentWeather', { weather: result.weather_summary }) : '';
    return t('audioBestCropGuide', {
      crop: result.best_crop,
      weather,
      window: result.recommendations?.[0]?.planting_window || '',
    }).trim();
  }

  return t('audioRecommendationReady');
}

function readStoredScans() {
  try {
    const scans = JSON.parse(localStorage.getItem('agriscan_soil_scans') || '[]');
    return Array.isArray(scans) ? scans : [];
  } catch {
    return [];
  }
}

function buildFormFromInputs(inputs) {
  if (!inputs) return initialForm;

  return {
    soil_type: inputs.soil_type || initialForm.soil_type,
    ph_level: inputs.ph_level ?? '',
    moisture_percent: inputs.moisture_percent ?? '',
    soil_temperature_c: inputs.soil_temperature_c ?? '',
    nitrogen_level: inputs.nitrogen_level || initialForm.nitrogen_level,
    phosphorus_level: inputs.phosphorus_level || initialForm.phosphorus_level,
    potassium_level: inputs.potassium_level || initialForm.potassium_level,
    drainage: inputs.drainage || initialForm.drainage,
    sunlight: inputs.sunlight || initialForm.sunlight,
    season: inputs.season || initialForm.season,
    province: inputs.province || '',
  };
}

function buildLocationStateFromScan(scan) {
  if (!scan?.location) {
    return {
      locating: false,
      error: '',
      attempted: false,
      label: '',
      coords: null,
    };
  }

  return {
    locating: false,
    error: '',
    attempted: true,
    label: scan.location.label || '',
    coords:
      scan.location.latitude != null && scan.location.longitude != null
        ? {
            latitude: scan.location.latitude,
            longitude: scan.location.longitude,
            accuracy_m: null,
          }
        : null,
  };
}

function ResultPanel({ result }) {
  const confidence = result ? Math.round(result.confidence * 100) : 0;
  const topRecommendations = result?.recommendations || [];

  return (
    <section className="surface overflow-hidden rounded-lg">
      <div className="flex flex-col gap-5 border-b border-stone-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
            {result ? <CheckCircle2 className="h-6 w-6" /> : <Sprout className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Best Crop For This Soil</p>
            <h2 className="mt-1 text-2xl font-bold text-stone-950 sm:text-3xl">
              {result?.best_crop || 'Ready to recommend'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              {result?.soil_summary || 'Enter manual soil readings to recommend the most suitable crop.'}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-leaf-100 bg-leaf-50 px-5 py-3 text-center">
          <p className="text-3xl font-bold text-leaf-800">{confidence || '--'}%</p>
          <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">Suitability</p>
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Top Matches</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {topRecommendations.length > 0 ? (
            topRecommendations.slice(0, 3).map((item) => (
              <article key={item.crop} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-stone-950">{item.crop}</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{item.planting_window}</p>
                  </div>
                  <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
                    {item.suitability}%
                  </span>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm font-semibold text-stone-500 md:col-span-3">
              Soil crop suggestions will appear here after scanning.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SoilActions({ result }) {
  const actions = result?.soil_actions || ['Run a manual soil scan to get soil preparation actions.'];

  return (
    <section className="rounded-lg border border-leaf-100 bg-leaf-50 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-leaf-700">
          <CalendarClock className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-leaf-950">Next Soil Actions</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-leaf-900">
            {actions.map((action) => (
              <li key={action} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-700" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function HistoryList({ history, onSelect }) {
  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-950">Recent Soil Scans</h2>
          <p className="text-sm text-stone-500">Saved on this device for quick comparison</p>
        </div>
        <span className="w-fit rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700">
          {history.length} Total
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {history.slice(0, 6).map((scan) => (
          <button
            key={scan.id}
            className="surface rounded-lg p-4 text-left transition hover:border-leaf-200 hover:bg-leaf-50"
            onClick={() => onSelect(scan)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{scan.soil_type}</p>
                <h3 className="mt-2 text-lg font-bold text-stone-950">{scan.best_crop}</h3>
                <p className="mt-1 text-sm text-stone-500">{new Date(scan.created_at).toLocaleString()}</p>
                {(scan.location?.label || scan.province) && (
                  <p className="mt-1 text-xs font-semibold text-stone-500">{scan.location?.label || scan.province}</p>
                )}
              </div>
              <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
                {Math.round(scan.confidence * 100)}%
              </span>
            </div>
          </button>
        ))}

        {history.length === 0 && (
          <div className="surface rounded-lg border-dashed p-6 text-center md:col-span-2">
            <ClipboardList className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-sm font-semibold text-stone-500">No soil scans yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function NutrientControl({ label, value, onChange }) {
  return (
    <div>
      <p className="text-sm font-bold text-stone-700">{label}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
        {nutrientLevels.map(([level, text]) => (
          <button
            key={level}
            className={`h-10 rounded-lg border text-sm font-bold transition ${
              value === level ? 'border-leaf-600 bg-leaf-600 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            }`}
            onClick={() => onChange(level)}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldHelp({ children }) {
  return <p className="mt-1 text-xs leading-5 text-stone-500">{children}</p>;
}

function InputGuideModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4" onClick={onClose}>
      <div
        className="surface max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="soil-guide-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h2 id="soil-guide-title" className="text-xl font-bold text-stone-950">
                How farmers can fill this in
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Replace the sample choices with your actual farm readings. Use a soil kit when available, or choose the closest match from these quick field checks.
              </p>
            </div>
          </div>
          <button className="btn-icon shrink-0" type="button" onClick={onClose} aria-label="Close instructions">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-110px)] overflow-y-auto p-5 sm:p-6">
          <div className="space-y-3">
            {inputGuides.map((guide) => (
              <div key={guide.title} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-bold text-stone-900">{guide.title}</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">{guide.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <button className="btn-primary" type="button" onClick={onClose}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CropGuideModal({ crop, weatherSummary, onClose, onPlayAudio, t }) {
  if (!crop) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4" onClick={onClose}>
      <div
        className="surface max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-guide-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 p-5 sm:p-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-leaf-700">{t('cropGuide')}</p>
            <h2 id="crop-guide-title" className="mt-1 text-2xl font-bold text-stone-950">{crop.name}</h2>
            <p className="mt-2 text-sm text-stone-500">{crop.variety} | {crop.window}</p>
          </div>
          <button className="btn-icon shrink-0" type="button" onClick={onClose} aria-label={t('closeCropGuide')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-110px)] overflow-y-auto p-5 sm:p-6">
          <div className="rounded-lg bg-leaf-50/70 p-4">
            <p className="text-sm leading-7 text-stone-700">{crop.guide}</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('watering')}</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{crop.watering}</p>
            </div>
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('fertilizer')}</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{crop.fertilizer}</p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-sky-700">{t('liveWeatherContext')}</p>
            <p className="mt-2 text-sm text-stone-700">{weatherSummary || t('refreshWeatherContext')}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {crop.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-leaf-100 bg-leaf-50 px-3 py-1 text-sm font-semibold text-leaf-800">
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" type="button" onClick={onPlayAudio}>
              <Play className="h-4 w-4" />
              {t('playAudioGuide')}
            </button>
            <button className="btn-primary" type="button" onClick={onClose}>
              {t('closeCropGuide')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CropCard({ crop, onGuide, weatherSummary }) {
  return (
    <article className="surface overflow-hidden rounded-lg">
      <div className="p-5">
        <div className="flex flex-col gap-4 min-[440px]:flex-row min-[440px]:items-start min-[440px]:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-600 sm:h-14 sm:w-14">
              <Leaf className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-bold text-stone-950 sm:text-2xl">{crop.name}</h2>
              <p className="text-base text-stone-500">{crop.variety}</p>
            </div>
          </div>
          <div className="text-left min-[440px]:text-right">
            <p className="text-3xl font-bold text-leaf-600 sm:text-4xl">{crop.score}%</p>
            <p className="text-xs font-bold uppercase text-stone-500">Suitability</p>
          </div>
        </div>

        <div className="mt-6 h-2 rounded-full bg-leaf-50">
          <div className="h-2 rounded-full bg-leaf-500" style={{ width: `${crop.score}%` }} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {crop.tags.map((tag, index) => (
            <span
              key={tag}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                index === 0 ? 'bg-leaf-50 text-leaf-800' : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="my-7 border-t border-dashed border-stone-200" />
        <div className="flex items-center justify-between gap-4 text-sm font-semibold text-stone-600">
          <span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Planting Window</span>
          <span className="text-right">{crop.window}</span>
        </div>

        <div className="mt-5 rounded-lg bg-leaf-50/60 p-4">
          <p className="text-sm leading-6 text-stone-700">{crop.guide}</p>
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-stone-100 px-5 py-4 text-sm">
        <span className="inline-flex items-center gap-2 text-stone-500">
          <Droplets className="h-4 w-4" />
          {weatherSummary || 'Waiting for live weather context'}
        </span>
        <button className="inline-flex items-center gap-2 font-bold text-leaf-700" onClick={() => onGuide(crop)} type="button">
          View Guide <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </article>
  );
}

export default function Scan() {
  const { t } = useI18n();
  const { speak, voiceTutorialsEnabled } = useVoice();
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All Crops');
  const [sortMode, setSortMode] = useState('Suitability');
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [audioStatus, setAudioStatus] = useState('');
  const [locationState, setLocationState] = useState({
    locating: false,
    error: '',
    attempted: false,
    label: '',
    coords: null,
  });

  useEffect(() => {
    const savedScans = readStoredScans();
    setHistory(savedScans);
    if (savedScans.length > 0) {
      const latest = savedScans[0];
      setResult(latest);
      setForm(buildFormFromInputs(latest.inputs || latest));
      setLocationState(buildLocationStateFromScan(latest));
      return;
    }
    requestCurrentLocation(true);
  }, []);

  useEffect(() => {
    if (!showGuideModal) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setShowGuideModal(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGuideModal]);

  useEffect(() => {
    if (!selectedCrop) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSelectedCrop(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCrop]);

  const canSubmit = useMemo(() => {
    const ph = parseOptionalNumber(form.ph_level);
    const moisture = parseOptionalNumber(form.moisture_percent);
    const soilTemperature = parseOptionalNumber(form.soil_temperature_c);
    return Boolean(
      form.soil_type &&
      (ph === null || (ph >= 0 && ph <= 14)) &&
      (moisture === null || (moisture >= 0 && moisture <= 100)) &&
      (soilTemperature === null || (soilTemperature >= -10 && soilTemperature <= 80))
    );
  }, [form.moisture_percent, form.ph_level, form.soil_temperature_c, form.soil_type]);

  const crops = useMemo(
    () => (result?.recommendations || []).map((item) => buildCropCard(item, result)),
    [result]
  );

  const visibleCrops = useMemo(() => {
    const filtered = activeCategory === 'All Crops' ? crops : crops.filter((crop) => crop.category === activeCategory);
    return [...filtered].sort((a, b) => {
      if (sortMode === 'Crop Name') return a.name.localeCompare(b.name);
      if (sortMode === 'Planting Window') return a.window.localeCompare(b.window);
      return b.score - a.score;
    });
  }, [activeCategory, crops, sortMode]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function buildPayload() {
    return {
      soil_type: form.soil_type,
      ph_level: parseOptionalNumber(form.ph_level),
      moisture_percent: parseOptionalNumber(form.moisture_percent),
      soil_temperature_c: parseOptionalNumber(form.soil_temperature_c),
      nitrogen_level: form.nitrogen_level,
      phosphorus_level: form.phosphorus_level,
      potassium_level: form.potassium_level,
      drainage: form.drainage,
      sunlight: form.sunlight,
      season: form.season,
      province: form.province.trim() || null,
      latitude: locationState.coords?.latitude ?? null,
      longitude: locationState.coords?.longitude ?? null,
      location_label: locationState.coords ? locationState.label || 'Current device location' : null,
    };
  }

  function requestCurrentLocation(silent = false) {
    if (!navigator.geolocation) {
      if (!silent) {
        setLocationState((current) => ({
          ...current,
          locating: false,
          attempted: true,
          error: 'Geolocation is not supported on this device.',
        }));
      }
      return;
    }

    setLocationState((current) => ({
      ...current,
      locating: true,
      attempted: true,
      error: '',
    }));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);
        let detectedProvince = '';

        try {
          const geocodedLocation = await reverseGeocodeLocation(latitude, longitude);
          detectedProvince = geocodedLocation.province || '';
        } catch {
          detectedProvince = '';
        }

        if (detectedProvince) {
          setForm((current) => ({
            ...current,
            province: detectedProvince,
          }));
        }

        setLocationState({
          locating: false,
          error: '',
          attempted: true,
          label: 'Current device location',
          coords: {
            latitude,
            longitude,
            accuracy_m: accuracy,
          },
        });
      },
      (gpsError) => {
        if (silent) {
          setLocationState((current) => ({
            ...current,
            locating: false,
            attempted: true,
          }));
          return;
        }

        setLocationState((current) => ({
          ...current,
          locating: false,
          attempted: true,
          error: buildGpsErrorMessage(gpsError),
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }

  function resetForm() {
    setForm(initialForm);
    setResult(null);
    setError('');
    setSelectedCrop(null);
    setAudioStatus('');
    setActiveCategory('All Crops');
    setSortMode('Suitability');
  }

  function saveHistory(scan) {
    const next = [scan, ...history.filter((item) => item.id !== scan.id)].slice(0, 12);
    setHistory(next);
    localStorage.setItem('agriscan_soil_scans', JSON.stringify(next));
  }

  async function runRecommendation(payload) {
    setError('');
    setLoading(true);
    setAudioStatus('');

    try {
      const response = await api.post('/predictions/soil-scan', payload);
      const scan = { ...response.data, id: makeHistoryId(), created_at: new Date().toISOString(), inputs: payload };
      setResult(scan);
      saveHistory(scan);
      return scan;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Soil scan failed.'));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    await runRecommendation(buildPayload());
  }

  function handleHistorySelect(scan) {
    setResult(scan);
    setForm(buildFormFromInputs(scan.inputs || scan));
    setLocationState(buildLocationStateFromScan(scan));
    setSelectedCrop(null);
    setAudioStatus('');
  }

  function cycleSortMode() {
    const currentIndex = sortModes.indexOf(sortMode);
    setSortMode(sortModes[(currentIndex + 1) % sortModes.length]);
  }

  function playAudioGuide(crop = selectedCrop) {
    const message = buildAudioGuide(crop, result, t);

    if (!voiceTutorialsEnabled) {
      setAudioStatus(t('voiceTutorialsDisabled'));
      return;
    }

    const spoken = speak(message, {
      kind: 'tutorial',
      onEnd: () => setAudioStatus(t('audioFinished')),
      onError: () => setAudioStatus(t('audioUnsupported')),
    });
    setAudioStatus(spoken.ok ? t('audioPlaying') : t('audioUnsupported'));
  }

  const locationLabel = result?.location?.label || locationState.label || 'Saved farm location if available';
  const recommendationIntro = result?.soil_summary
    ? `Based on ${result.soil_summary.toLowerCase()}`
    : 'Based on your latest soil scan';

  return (
    <div className="space-y-6">
      <InputGuideModal open={showGuideModal} onClose={() => setShowGuideModal(false)} />
      <CropGuideModal
        crop={selectedCrop}
        weatherSummary={result?.weather_summary}
        onClose={() => setSelectedCrop(null)}
        onPlayAudio={() => playAudioGuide(selectedCrop)}
        t={t}
      />

      <header className="overflow-hidden rounded-lg border border-leaf-100 bg-white">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-4 py-2 text-sm font-bold text-leaf-700">
                <FlaskConical className="h-4 w-4" />
                Manual Soil Scan
              </span>
              <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">Recommendations Included</span>
            </div>
            <h1 className="mt-5 break-words text-2xl font-bold tracking-normal text-stone-950 sm:text-4xl">
              Manual Scan & Crop Recommendations
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-500 sm:text-lg">
              Enter soil type, pH, moisture, and NPK levels. AgriScan will recommend the best crop and show detailed guides in the same workspace.
            </p>
          </div>
          <div className="grid content-center gap-4 border-t border-leaf-100 bg-leaf-50 p-6 lg:border-l lg:border-t-0">
            <div className="overflow-hidden rounded-lg border border-white/80 bg-white shadow-sm">
              <img src={soilScanImage} alt="Soil and seedling field scan visual" className="h-40 w-full object-cover" />
              <div className="grid gap-3 p-4">
                {[
                  ['Soil', form.soil_type],
                  ['pH', form.ph_level || 'Not set'],
                  ['Moisture', form.moisture_percent ? `${form.moisture_percent}%` : 'Not set'],
                  ['Soil Temp', form.soil_temperature_c ? `${form.soil_temperature_c}C` : 'Not set'],
                  ['Location', locationLabel || 'Pending'],
                  ['Best Crop', result?.best_crop || 'Pending'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-semibold text-leaf-900">{label}</span>
                    <span className="min-w-0 text-right font-bold text-stone-950">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/80 bg-white shadow-sm">
              <img src={recommendationsImage} alt="Harvested crops ready for recommendation matching" className="h-28 w-full object-cover" />
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">Recommendation Context</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Your soil reading, GPS location, and live weather all combine to rank the best crop match for this field.
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] xl:gap-6">
        <form onSubmit={submit} className="surface rounded-lg p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-950">Soil Details</h2>
              <p className="mt-1 text-sm text-stone-500">Type the soil reading from your farm plot.</p>
              <button
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-leaf-700"
                type="button"
                onClick={() => setShowGuideModal(true)}
              >
                <Info className="h-4 w-4" />
                How farmers can fill this in
              </button>
            </div>
            <button className="btn-icon" type="button" onClick={resetForm} title="Reset form">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-stone-700">Soil Type</span>
              <select className="field mt-2 h-12" value={form.soil_type} onChange={(event) => updateField('soil_type', event.target.value)}>
                {soilOptions.map((soil) => <option key={soil}>{soil}</option>)}
              </select>
              <FieldHelp>Hand-feel guide: gritty = sandy, sticky = clay, crumbly = loam, river-deposit soil = alluvial.</FieldHelp>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-bold text-stone-700">pH Level</span>
                <input
                  className="field mt-2 h-12"
                  inputMode="decimal"
                  max="14"
                  min="0"
                  placeholder="e.g. 6.5"
                  step="0.1"
                  type="number"
                  value={form.ph_level}
                  onChange={(event) => updateField('ph_level', event.target.value)}
                />
                <FieldHelp>Use a pH strip or meter. Around 6.0 to 7.0 is common for many crops.</FieldHelp>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-stone-700">Moisture %</span>
                <input
                  className="field mt-2 h-12"
                  inputMode="decimal"
                  max="100"
                  min="0"
                  placeholder="e.g. 45"
                  step="1"
                  type="number"
                  value={form.moisture_percent}
                  onChange={(event) => updateField('moisture_percent', event.target.value)}
                />
                <FieldHelp>Use a moisture meter if possible. Dry soil is low, damp soil is medium, soggy soil is high.</FieldHelp>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-stone-700">Soil Temp</span>
                <input
                  className="field mt-2 h-12"
                  inputMode="decimal"
                  max="80"
                  min="-10"
                  placeholder="e.g. 28"
                  step="0.1"
                  type="number"
                  value={form.soil_temperature_c}
                  onChange={(event) => updateField('soil_temperature_c', event.target.value)}
                />
                <FieldHelp>Use a soil thermometer or meter. If unavailable, enter the closest measured soil temperature.</FieldHelp>
              </label>
            </div>

            <NutrientControl label="Nitrogen" value={form.nitrogen_level} onChange={(value) => updateField('nitrogen_level', value)} />
            <FieldHelp>Low: pale older leaves and slow growth. Medium: normal green growth. High: very dark green and lush growth.</FieldHelp>
            <NutrientControl label="Phosphorus" value={form.phosphorus_level} onChange={(value) => updateField('phosphorus_level', value)} />
            <FieldHelp>Low: weak roots, slow early growth, or purplish leaves. Medium: steady growth. High: tested or recently corrected soil.</FieldHelp>
            <NutrientControl label="Potassium" value={form.potassium_level} onChange={(value) => updateField('potassium_level', value)} />
            <FieldHelp>Low: yellow or brown leaf edges and weaker stems. Medium: balanced growth. High: strong tested potassium level.</FieldHelp>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-stone-700">Drainage</span>
                <select className="field mt-2 h-12" value={form.drainage} onChange={(event) => updateField('drainage', event.target.value)}>
                  {drainageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <FieldHelp>Good = water drains fast. Moderate = drains in a few hours. Poor or waterlogged = puddles stay long.</FieldHelp>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-stone-700">Sunlight</span>
                <select className="field mt-2 h-12" value={form.sunlight} onChange={(event) => updateField('sunlight', event.target.value)}>
                  {sunlightOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <FieldHelp>Full sun means 6+ hours of direct sunlight. Partial shade means only part of the day gets direct sun.</FieldHelp>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-stone-700">Season</span>
                <select className="field mt-2 h-12" value={form.season} onChange={(event) => updateField('season', event.target.value)}>
                  {seasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <FieldHelp>Choose the season your farm is in now: regular, wet/rainy, or dry season.</FieldHelp>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-stone-700">Province</span>
                <input
                  className="field mt-2 h-12"
                  placeholder="e.g. Nueva Ecija"
                  value={form.province}
                  onChange={(event) => updateField('province', event.target.value)}
                />
                <FieldHelp>Type your province if GPS is unavailable. When current GPS is used, AgriScan will auto-fill this field.</FieldHelp>
              </label>
            </div>

            <section className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-stone-900">Current Location</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {locationState.label || result?.location?.label || 'Current GPS not captured yet'}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatLocationMeta(locationState.coords || result?.location)}
                  </p>
                </div>
                <button className="btn-secondary h-10 px-4 text-sm" type="button" onClick={() => requestCurrentLocation()} disabled={locationState.locating}>
                  {locationState.locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  {locationState.locating ? 'Locating...' : 'Use Current GPS'}
                </button>
              </div>
              {locationState.error && <p className="mt-3 text-sm font-medium text-amber-700">{locationState.error}</p>}
            </section>
          </div>

          {error && <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

          <button className="btn-primary mt-6 h-12 w-full text-base" disabled={!canSubmit || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
            {loading ? t('checkingSoil') : t('recommendBestCrop')}
          </button>
        </form>

        <div className="space-y-6">
          <ResultPanel result={result} />

          <section className="rounded-lg border border-sky-100 bg-sky-50 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sky-700">Location and Weather</p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <MapPin className="h-4 w-4 text-sky-600" />
                  <span>{locationLabel}</span>
                </div>
                <p className="mt-1 text-sm text-stone-600">{result?.weather_summary || 'Current live weather will appear here after soil analysis.'}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="btn-secondary h-10 w-full px-4 text-sm sm:w-auto" onClick={() => runRecommendation(buildPayload())} type="button" disabled={!canSubmit || loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  {loading ? 'Refreshing...' : 'Refresh Recommendation'}
                </button>
                <button className="btn-secondary h-10 w-full px-4 text-sm sm:w-auto" onClick={cycleSortMode} type="button">
                  <Filter className="h-4 w-4" />
                  Sort: {sortMode}
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-leaf-700">Integrated Recommendations</p>
                <h2 className="mt-1 text-2xl font-bold text-stone-950">Crop Matches From This Scan</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {recommendationIntro}. {result?.weather_summary ? `${result.weather_summary}.` : ''} Using {locationLabel}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700">
                  {result?.best_crop ? `Best match: ${result.best_crop}` : 'Run a soil scan to personalize this section'}
                </span>
                <button className="btn-secondary h-10 px-4 text-sm" onClick={() => playAudioGuide()} type="button">
                  <Play className="h-4 w-4" />
                  {t('playAudioGuide')}
                </button>
              </div>
            </div>

            <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`shrink-0 rounded-full px-6 py-3 text-sm font-semibold ${
                    activeCategory === item ? 'bg-leaf-600 text-white shadow-[0_8px_16px_rgba(22,163,74,0.18)]' : 'border border-stone-200 bg-white text-stone-600'
                  }`}
                  onClick={() => setActiveCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>

            {audioStatus && (
              <div className="mb-4 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800">
                {audioStatus}
              </div>
            )}

            {result ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {visibleCrops.map((crop) => (
                  <CropCard key={crop.id} crop={crop} onGuide={setSelectedCrop} weatherSummary={result?.weather_summary} />
                ))}
                {visibleCrops.length === 0 && (
                  <div className="surface rounded-lg p-8 text-center xl:col-span-2">
                    <Leaf className="mx-auto h-10 w-10 text-stone-400" />
                    <p className="mt-3 font-bold text-stone-950">No recommendations in this category yet.</p>
                    <button className="btn-secondary mt-4" type="button" onClick={() => setActiveCategory('All Crops')}>Show all crops</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="surface rounded-lg p-10 text-center">
                <Loader2 className="mx-auto h-10 w-10 text-leaf-600" />
                <p className="mt-4 text-lg font-bold text-stone-950">Recommendations will appear here</p>
                <p className="mt-2 text-sm text-stone-500">Complete the manual soil scan and AgriScan will fill this page with crop matches, guides, and weather-aware advice.</p>
              </div>
            )}
          </section>

          <SoilActions result={result} />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              [FlaskConical, 'Soil Type', form.soil_type],
              [Gauge, 'pH', form.ph_level || '--'],
              [Droplets, 'Moisture', form.moisture_percent ? `${form.moisture_percent}%` : '--'],
              [Thermometer, 'Soil Temp', form.soil_temperature_c ? `${form.soil_temperature_c}C` : '--'],
              [Sun, 'Sunlight', form.sunlight],
            ].map(([Icon, label, value]) => (
              <article key={label} className="surface rounded-lg p-5">
                <Icon className="h-5 w-5 text-leaf-600" />
                <p className="mt-4 text-sm font-bold uppercase tracking-wide text-stone-500">{label}</p>
                <p className="mt-1 text-xl font-bold capitalize text-stone-950">{value}</p>
              </article>
            ))}
          </section>

          <section className="flex flex-col gap-5 rounded-lg border border-leaf-100 bg-leaf-100/70 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-leaf-600 text-white">
                <Info className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-leaf-950">Farmer's Pro Tip</h2>
                <p className="mt-2 max-w-4xl text-base leading-7 text-leaf-900">
                  {result?.best_crop
                    ? `${result.best_crop} is the strongest fit for ${locationLabel}. ${result.recommendations?.[0]?.planting_window || ''}`
                    : 'Run or save a soil scan first so AgriScan can personalize the best crop for your field.'}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <button className="btn-primary h-14 w-full px-8 text-base sm:w-auto" onClick={() => playAudioGuide()} type="button">
                <Play className="h-5 w-5" />
                {t('playAudioGuide')}
              </button>
            </div>
          </section>

          <HistoryList history={history} onSelect={handleHistorySelect} />
        </div>
      </div>
    </div>
  );
}
