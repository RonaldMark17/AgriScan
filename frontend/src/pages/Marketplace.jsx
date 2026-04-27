import { ArrowRight, Crosshair, Droplets, Filter, Info, Leaf, Loader2, MapPin, Play, TrendingUp, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { getApiErrorMessage } from '../utils/apiErrors.js';

const categories = ['All Crops', 'Vegetables', 'Grains', 'Fruits', 'Root Crops'];
const sortModes = ['Suitability', 'Crop Name', 'Planting Window'];
const defaultScanInputs = {
  soil_type: 'Loam',
  ph_level: 6.5,
  moisture_percent: 45,
  nitrogen_level: 'medium',
  phosphorus_level: 'medium',
  potassium_level: 'medium',
  drainage: 'moderate',
  sunlight: 'full sun',
  season: 'regular season',
  province: null,
};

function buildGpsErrorMessage(error) {
  if (!error) return 'Could not access your current location.';
  if (error.code === error.PERMISSION_DENIED) return 'Location access was blocked. AgriScan will fall back to your saved farm location if available.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Your current location is unavailable right now.';
  if (error.code === error.TIMEOUT) return 'Location lookup timed out. Please try again.';
  return 'Could not access your current location.';
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    });
  });
}

function readLatestSoilScan() {
  try {
    const scans = JSON.parse(localStorage.getItem('agriscan_soil_scans') || '[]');
    return Array.isArray(scans) && scans.length > 0 ? scans[0] : null;
  } catch {
    return null;
  }
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

function buildAudioGuide(selectedCrop, result) {
  if (selectedCrop) {
    return `${selectedCrop.name}. ${selectedCrop.guide} Watering: ${selectedCrop.watering} Fertilizer: ${selectedCrop.fertilizer}`;
  }

  if (result?.best_crop) {
    const currentWeather = result.weather_summary ? ` Current weather: ${result.weather_summary}.` : '';
    return `${result.best_crop} is the best crop recommendation right now.${currentWeather} ${result.recommendations?.[0]?.planting_window || ''}`.trim();
  }

  return 'AgriScan is ready to refresh crop recommendations using your latest soil scan and current location.';
}

function CropGuideModal({ crop, weatherSummary, onClose, onPlayAudio }) {
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
            <p className="text-sm font-bold uppercase tracking-wide text-leaf-700">Crop Guide</p>
            <h2 id="crop-guide-title" className="mt-1 text-2xl font-bold text-stone-950">{crop.name}</h2>
            <p className="mt-2 text-sm text-stone-500">{crop.variety} - {crop.window}</p>
          </div>
          <button className="btn-icon shrink-0" type="button" onClick={onClose} aria-label="Close crop guide">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-110px)] overflow-y-auto p-5 sm:p-6">
          <div className="rounded-lg bg-leaf-50/70 p-4">
            <p className="text-sm leading-7 text-stone-700">{crop.guide}</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">Watering</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{crop.watering}</p>
            </div>
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">Fertilizer</p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{crop.fertilizer}</p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-sky-700">Live Weather Context</p>
            <p className="mt-2 text-sm text-stone-700">{weatherSummary || 'Refresh recommendations to pull the latest weather context for this crop.'}</p>
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
              Play Audio Guide
            </button>
            <button className="btn-primary" type="button" onClick={onClose}>
              Close Guide
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-leaf-50 text-leaf-600">
              <Leaf className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-stone-950">{crop.name}</h2>
              <p className="text-base text-stone-500">{crop.variety}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-leaf-600">{crop.score}%</p>
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

export default function Marketplace() {
  const [activeCategory, setActiveCategory] = useState('All Crops');
  const [sortMode, setSortMode] = useState('Suitability');
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [audioStatus, setAudioStatus] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gpsState, setGpsState] = useState({
    locating: false,
    error: '',
    attempted: false,
  });
  const [scanSource, setScanSource] = useState('default');

  async function loadRecommendations(useCurrentLocation = true) {
    setLoading(true);
    setError('');
    setAudioStatus('');

    const latestScan = readLatestSoilScan();
    const payload = {
      ...defaultScanInputs,
      ...(latestScan?.inputs || {}),
      province: latestScan?.inputs?.province ?? latestScan?.province ?? defaultScanInputs.province,
    };

    setScanSource(latestScan?.inputs ? 'latest-scan' : 'default');

    if (useCurrentLocation) {
      setGpsState({ locating: true, error: '', attempted: true });
      try {
        const position = await getCurrentPosition();
        payload.latitude = Number(position.coords.latitude.toFixed(6));
        payload.longitude = Number(position.coords.longitude.toFixed(6));
        payload.location_label = 'Current device location';
        setGpsState({ locating: false, error: '', attempted: true });
      } catch (gpsError) {
        setGpsState({ locating: false, error: buildGpsErrorMessage(gpsError), attempted: true });
      }
    }

    try {
      const response = await api.post('/predictions/soil-scan', payload);
      setResult(response.data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Could not refresh crop recommendations.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecommendations(true);
  }, []);

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

  function cycleSortMode() {
    const currentIndex = sortModes.indexOf(sortMode);
    setSortMode(sortModes[(currentIndex + 1) % sortModes.length]);
  }

  function playAudioGuide() {
    const message = buildAudioGuide(selectedCrop, result);

    if (!('speechSynthesis' in window)) {
      setAudioStatus('Audio guide is not supported on this browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    utterance.onend = () => setAudioStatus('Audio guide finished.');
    window.speechSynthesis.speak(utterance);
    setAudioStatus('Playing audio guide...');
  }

  const locationLabel = result?.location?.label || 'Saved farm location if available';
  const recommendationIntro = result?.soil_summary
    ? `Based on ${result.soil_summary.toLowerCase()}`
    : 'Based on your latest soil scan';

  return (
    <div>
      <CropGuideModal
        crop={selectedCrop}
        weatherSummary={result?.weather_summary}
        onClose={() => setSelectedCrop(null)}
        onPlayAudio={playAudioGuide}
      />

      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="inline-flex rounded-full border border-leaf-100 bg-leaf-50 px-6 py-2 text-sm font-bold text-leaf-700">AI Powered Insights</span>
          <h1 className="mt-4 text-3xl font-bold tracking-normal text-stone-950 sm:text-4xl">Crop Recommendations</h1>
          <p className="mt-3 max-w-4xl text-lg leading-8 text-stone-600">
            {recommendationIntro}. {result?.weather_summary ? `${result.weather_summary}.` : ''} Using {locationLabel}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700">
              {scanSource === 'latest-scan' ? 'Using latest saved soil scan' : 'Using starter soil profile'}
            </span>
            {result?.best_crop && (
              <span className="rounded-full border border-leaf-100 bg-leaf-50 px-4 py-2 text-sm font-semibold text-leaf-800">
                Best match: {result.best_crop}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary h-12 px-5 text-base" onClick={() => loadRecommendations(true)} type="button" disabled={loading || gpsState.locating}>
            {loading || gpsState.locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
            {loading || gpsState.locating ? 'Refreshing...' : 'Use Current GPS'}
          </button>
          <button className="btn-secondary h-12 px-5 text-base" onClick={cycleSortMode} type="button">
            <Filter className="h-5 w-5" />
            Sort: {sortMode}
          </button>
        </div>
      </div>

      {(gpsState.error || error) && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          {gpsState.error || error}
        </div>
      )}

      <section className="mb-8 rounded-lg border border-sky-100 bg-sky-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-sky-700">Location and Weather</p>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
              <MapPin className="h-4 w-4 text-sky-600" />
              <span>{locationLabel}</span>
            </div>
            <p className="mt-1 text-sm text-stone-600">{result?.weather_summary || 'Current live weather will appear here after refresh.'}</p>
          </div>
          <div className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
            <span className="rounded-lg bg-white/80 px-4 py-3 font-semibold">{result?.best_crop || 'Pending'} best match</span>
            <span className="rounded-lg bg-white/80 px-4 py-3 font-semibold">{result ? `${Math.round(result.confidence * 100)}% suitability` : 'Waiting for scan'}</span>
          </div>
        </div>
      </section>

      <div className="mb-8 flex gap-3 overflow-x-auto pb-1">
        {categories.map((item) => (
          <button
            key={item}
            className={`shrink-0 rounded-full px-8 py-3 text-base font-semibold ${
              activeCategory === item ? 'bg-leaf-600 text-white shadow-[0_8px_16px_rgba(22,163,74,0.18)]' : 'border border-stone-200 bg-white text-stone-600'
            }`}
            onClick={() => setActiveCategory(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="surface rounded-lg p-10 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-leaf-600" />
          <p className="mt-4 text-lg font-bold text-stone-950">Refreshing crop recommendations</p>
          <p className="mt-2 text-sm text-stone-500">Matching the latest soil profile with your current location and weather.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {visibleCrops.map((crop) => <CropCard key={crop.id} crop={crop} onGuide={setSelectedCrop} weatherSummary={result?.weather_summary} />)}
          {visibleCrops.length === 0 && (
            <div className="surface rounded-lg p-8 text-center xl:col-span-2">
              <Leaf className="mx-auto h-10 w-10 text-stone-400" />
              <p className="mt-3 font-bold text-stone-950">No recommendations in this category yet.</p>
              <button className="btn-secondary mt-4" type="button" onClick={() => setActiveCategory('All Crops')}>Show all crops</button>
            </div>
          )}
        </div>
      )}

      <section className="mt-8 flex flex-col gap-5 rounded-lg border border-leaf-100 bg-leaf-100/70 p-6 sm:flex-row sm:items-center sm:justify-between">
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
          <button className="btn-primary h-14 w-full px-8 text-base sm:w-auto" onClick={playAudioGuide} type="button">
            <Play className="h-5 w-5" />
            Play Audio Guide
          </button>
          {audioStatus && <p className="mt-2 text-center text-sm font-semibold text-leaf-800">{audioStatus}</p>}
        </div>
      </section>
    </div>
  );
}
