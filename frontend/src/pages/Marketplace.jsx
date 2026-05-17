import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Crosshair,
  Droplets,
  Filter,
  FlaskConical,
  Leaf,
  Loader2,
  MapPin,
  Play,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client.js';
import TranslatedText from '../components/shared/TranslatedText.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
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

function buildGpsErrorMessage(error, t) {
  if (!error) return t('couldNotAccessLocation');
  if (error.code === error.PERMISSION_DENIED) return t('locationAccessBlocked');
  if (error.code === error.POSITION_UNAVAILABLE) return t('locationUnavailable');
  if (error.code === error.TIMEOUT) return t('locationTimedOut');
  return t('couldNotAccessLocation');
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

function translatedCategory(category, t) {
  const keys = {
    'All Crops': 'allCrops',
    Vegetables: 'vegetables',
    Grains: 'grains',
    Fruits: 'fruits',
    'Root Crops': 'rootCrops',
  };
  return t(keys[category] || category);
}

function translatedSortMode(mode, t) {
  const keys = {
    Suitability: 'sortSuitability',
    'Crop Name': 'sortCropName',
    'Planting Window': 'sortPlantingWindow',
  };
  return t(keys[mode] || mode);
}

function translatedTag(tag, t) {
  const keys = {
    'Location Aware': 'locationAware',
    'Soil Match': 'soilMatch',
    'Live Weather': 'liveWeather',
    'Manual Soil': 'manualSoil',
    'Top Match': 'topMatch',
    Alternative: 'alternative',
  };
  return t(keys[tag] || tag);
}

function buildCropCard(item, result) {
  const category = getCropCategory(item.crop);
  const locationTag = result?.location?.label ? 'Location Aware' : 'Soil Match';
  const weatherTag = result?.weather_summary ? 'Live Weather' : 'Manual Soil';
  const isBestMatch = item.crop === result?.best_crop;

  return {
    id: `${item.crop}-${item.suitability}`,
    name: item.crop,
    variety: category,
    category,
    score: item.suitability,
    isBestMatch,
    tags: [locationTag, weatherTag, isBestMatch ? 'Top Match' : 'Alternative'],
    window: item.planting_window,
    guide: item.reason,
    watering: item.watering,
    fertilizer: item.fertilizer,
    scoreBreakdown: item.score_breakdown || [],
    riskFlags: item.risk_flags || [],
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

function lockDocumentScroll() {
  const { body, documentElement } = document;
  const appContent = document.querySelector('.app-content');
  const hasAppContentStyles = Boolean(appContent && typeof appContent === 'object' && 'style' in appContent);
  const scrollY = window.scrollY;
  const previous = {
    htmlOverflow: documentElement.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyPaddingRight: body.style.paddingRight,
    appContentOverflowY: hasAppContentStyles ? appContent.style.overflowY : '',
    appContentOverscrollBehavior: hasAppContentStyles ? appContent.style.overscrollBehavior : '',
  };
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

  documentElement.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
  if (hasAppContentStyles) {
    appContent.style.overflowY = 'hidden';
    appContent.style.overscrollBehavior = 'none';
  }

  return () => {
    documentElement.style.overflow = previous.htmlOverflow;
    body.style.overflow = previous.bodyOverflow;
    body.style.position = previous.bodyPosition;
    body.style.top = previous.bodyTop;
    body.style.left = previous.bodyLeft;
    body.style.right = previous.bodyRight;
    body.style.width = previous.bodyWidth;
    body.style.paddingRight = previous.bodyPaddingRight;
    if (hasAppContentStyles) {
      appContent.style.overflowY = previous.appContentOverflowY;
      appContent.style.overscrollBehavior = previous.appContentOverscrollBehavior;
    }
    window.scrollTo(0, scrollY);
  };
}

function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number > 0 ? `+${number}` : `${number}`;
}

function GuideSection({ accent = 'leaf', icon: Icon, title, children }) {
  const accentClasses = {
    leaf: 'bg-leaf-100 text-leaf-700',
    sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-700',
    stone: 'bg-stone-100 text-stone-700',
  };

  return (
    <section className="crop-guide-section rounded-[1.35rem] border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accentClasses[accent] || accentClasses.leaf}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-tight text-stone-950 sm:text-lg">{title}</h3>
          <div className="mt-3 text-sm leading-7 text-stone-600 sm:text-[15px] sm:leading-8">{children}</div>
        </div>
      </div>
    </section>
  );
}

function CropGuideMetric({ label, value, tone = 'stone' }) {
  const toneClasses = {
    leaf: 'border-leaf-200 bg-leaf-50/80',
    stone: 'border-stone-200 bg-white/90',
    sky: 'border-sky-200 bg-sky-50/80',
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClasses[tone] || toneClasses.stone}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <div className="mt-2 text-sm font-semibold leading-6 text-stone-900">
        {typeof value === 'string' ? <TranslatedText text={value} /> : value}
      </div>
    </div>
  );
}

function CropGuideModal({ crop, weatherSummary, onClose, onPlayAudio, t }) {
  if (!crop || typeof document === 'undefined') return null;

  return createPortal(
    <div className="crop-guide-overlay fixed inset-0 z-[140] overflow-hidden overscroll-none bg-stone-950/78 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8" onClick={onClose}>
      <div className="flex h-full items-center justify-center">
        <div
          className="crop-guide-dialog surface flex max-h-[85vh] w-[92vw] max-w-[760px] flex-col overflow-hidden rounded-[1.5rem] border border-white/80 bg-white ring-1 ring-stone-950/5 sm:max-h-[82vh] sm:w-[94vw]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-guide-title"
          aria-describedby="crop-guide-summary"
        >
          <div className="crop-guide-header sticky top-0 z-20 flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-leaf-700 sm:text-sm">{t('cropGuide')}</p>
              <h2 id="crop-guide-title" className="mt-2 break-words text-2xl font-bold tracking-tight text-stone-950 sm:text-[2rem]">{crop.name}</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">{translatedCategory(crop.variety, t)} | <TranslatedText text={crop.window} /></p>
            </div>
            <button
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-leaf-50 text-leaf-800 transition hover:border-leaf-200 hover:bg-white hover:text-leaf-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 active:scale-[0.98]"
              type="button"
              onClick={onClose}
              aria-label={t('closeCropGuide')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="crop-guide-body min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-stone-50 via-stone-50/70 to-white px-4 py-4 sm:px-6 sm:py-6">
            <div className="space-y-4 sm:space-y-5">
              <section className="crop-guide-hero rounded-[1.35rem] border border-leaf-200 bg-gradient-to-br from-leaf-50 via-white to-[#ecfdf3] p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-leaf-700 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {crop.isBestMatch ? `#1 ${t('topMatch')}` : t('alternative')}
                  </span>
                  <span className="rounded-full border border-leaf-200 bg-white/80 px-3 py-1 text-xs font-semibold text-leaf-800">
                    {translatedCategory(crop.variety, t)}
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">{crop.name}</h3>
                <TranslatedText
                  as="p"
                  id="crop-guide-summary"
                  className="mt-3 max-w-3xl text-sm leading-7 text-stone-600 sm:text-[15px] sm:leading-8 line-clamp-3"
                  text={crop.guide}
                />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <CropGuideMetric label={t('cropType')} value={translatedCategory(crop.variety, t)} />
                  <CropGuideMetric label={t('plantingWindow')} value={crop.window} />
                  <CropGuideMetric label={t('suitability')} tone="leaf" value={<span className="text-lg font-bold text-leaf-800">{crop.score}%</span>} />
                </div>
              </section>

              <GuideSection accent="leaf" icon={Leaf} title={t('whyRecommended')}>
                <TranslatedText as="p" className="text-sm leading-7 text-stone-600 sm:text-[15px] sm:leading-8" text={crop.guide} />
              </GuideSection>

              <GuideSection accent="sky" icon={Sun} title={t('soilWeatherSuitability')}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">{t('liveWeatherContext')}</p>
                    {weatherSummary ? (
                      <TranslatedText as="p" className="mt-2 text-sm leading-7 text-stone-700" text={weatherSummary} />
                    ) : (
                      <p className="mt-2 text-sm leading-7 text-stone-700">{t('refreshWeatherContext')}</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">{t('plantingWindow')}</p>
                    <TranslatedText as="p" className="mt-2 text-sm leading-7 text-stone-700" text={crop.window} />
                  </div>
                </div>
              </GuideSection>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <GuideSection accent="leaf" icon={Droplets} title={t('wateringGuide')}>
                  <TranslatedText as="p" className="text-sm leading-7 text-stone-600 sm:text-[15px] sm:leading-8" text={crop.watering} />
                </GuideSection>

                <GuideSection accent="stone" icon={FlaskConical} title={t('fertilizerGuide')}>
                  <TranslatedText as="p" className="text-sm leading-7 text-stone-600 sm:text-[15px] sm:leading-8" text={crop.fertilizer} />
                </GuideSection>
              </div>

              <GuideSection accent="stone" icon={TrendingUp} title={t('scoreBreakdown')}>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">{t('overallSuitability')}</p>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-stone-950">{crop.score}%</p>
                      </div>
                      <div className="w-full max-w-xs">
                        <div className="h-2.5 rounded-full bg-leaf-100">
                          <div className="h-2.5 rounded-full bg-leaf-600" style={{ width: `${crop.score}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {crop.scoreBreakdown?.length > 0 ? (
                    <div className="space-y-2">
                      {crop.scoreBreakdown.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-stone-900">{item.label}</p>
                            {item.detail && <TranslatedText as="p" className="mt-1 text-xs leading-6 text-stone-500" text={item.detail} />}
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${Number(item.value) >= 0 ? 'bg-leaf-50 text-leaf-700' : 'bg-amber-50 text-amber-700'}`}>
                            {formatScoreValue(item.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {crop.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-leaf-100 bg-leaf-50 px-3 py-1 text-xs font-semibold text-leaf-800 sm:text-sm">
                          {translatedTag(tag, t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </GuideSection>

              {crop.riskFlags?.length > 0 && (
                <GuideSection accent="amber" icon={CalendarClock} title={t('riskFlags')}>
                  <ul className="space-y-2 pl-1 text-sm leading-7 text-amber-900">
                    {crop.riskFlags.map((flag) => (
                      <li key={flag} className="flex gap-2">
                        <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                        <TranslatedText text={flag} />
                      </li>
                    ))}
                  </ul>
                </GuideSection>
              )}
            </div>
          </div>

          <div className="crop-guide-footer sticky bottom-0 z-20 shrink-0 border-t border-stone-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button className="btn-secondary w-full justify-center sm:w-auto" type="button" onClick={onPlayAudio}>
                <Play className="mr-2 h-4 w-4" />
                {t('playAudioGuide')}
              </button>
              <button className="btn-primary w-full justify-center sm:w-auto" type="button" onClick={onClose}>
                {t('closeCropGuide')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CropCard({ crop, onGuide, weatherSummary, t }) {
  return (
    <article
      className={`surface flex h-full flex-col overflow-hidden rounded-[1rem] border transition-shadow ${
        crop.isBestMatch
          ? 'crop-card-best-match border-leaf-300 bg-gradient-to-br from-leaf-50 via-white to-white ring-1 ring-leaf-100'
          : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
              crop.isBestMatch
                ? 'bg-leaf-700 text-white shadow-sm'
                : 'border border-stone-200 bg-stone-50 text-stone-600'
            }`}
          >
            {crop.isBestMatch && <CheckCircle2 className="h-3.5 w-3.5" />}
            {crop.isBestMatch ? `#1 ${t('topMatch')}` : t('alternative')}
          </span>
        </div>

        <div className="flex flex-col gap-4 min-[440px]:flex-row min-[440px]:items-start min-[440px]:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${crop.isBestMatch ? 'bg-leaf-100 text-leaf-700' : 'bg-leaf-50 text-leaf-600'}`}>
              <Leaf className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-bold leading-tight tracking-tight text-stone-950">{crop.name}</h2>
              <p className="mt-0.5 text-sm font-medium text-stone-500">{translatedCategory(crop.variety, t)}</p>
            </div>
          </div>
          <div className="text-left min-[440px]:text-right">
            <p className={`text-3xl font-bold leading-none ${crop.isBestMatch ? 'text-leaf-700' : 'text-leaf-600'}`}>{crop.score}%</p>
            <p className="mt-1 text-xs font-bold uppercase text-stone-500">{t('suitability')}</p>
          </div>
        </div>

        <div className="mt-6 h-2 rounded-full bg-leaf-50">
          <div className={`h-2 rounded-full ${crop.isBestMatch ? 'bg-leaf-700' : 'bg-leaf-500'}`} style={{ width: `${crop.score}%` }} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {crop.tags.map((tag, index) => (
            <span
              key={tag}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                index === 0 ? 'bg-leaf-50 text-leaf-800' : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >
              {translatedTag(tag, t)}
            </span>
          ))}
        </div>

        <div className="my-5 border-t border-dashed border-stone-200" />
        <div className="grid gap-2 text-sm font-semibold text-stone-600 min-[460px]:grid-cols-[120px_minmax(0,1fr)]">
          <span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" /> {t('plantingWindow')}</span>
          <TranslatedText as="span" className="min-w-0 break-words min-[460px]:text-right" text={crop.window} />
        </div>

        <div className={`mt-5 rounded-xl p-4 ${crop.isBestMatch ? 'bg-leaf-50/80' : 'bg-leaf-50/60'}`}>
          <TranslatedText as="p" className="text-sm leading-6 text-stone-700" text={crop.guide} />
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50/50 px-4 py-4 text-sm min-[460px]:flex-row min-[460px]:items-center min-[460px]:justify-between sm:px-5">
        <span className="inline-flex min-w-0 items-center gap-2 text-stone-500">
          <Droplets className="h-4 w-4 shrink-0" />
          {weatherSummary ? <TranslatedText text={weatherSummary} /> : t('waitingLiveWeather')}
        </span>
        <button className="inline-flex shrink-0 items-center gap-2 font-bold text-leaf-700" onClick={() => onGuide(crop)} type="button">
          {t('viewGuide')} <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </article>
  );
}

export default function Marketplace() {
  const { t } = useI18n();
  const { speak, voiceTutorialsEnabled } = useVoice();
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

  const loadRecommendations = useCallback(async (useCurrentLocation = true) => {
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
        payload.location_label = t('currentDeviceLocation');
        setGpsState({ locating: false, error: '', attempted: true });
      } catch (gpsError) {
        setGpsState({ locating: false, error: buildGpsErrorMessage(gpsError, t), attempted: true });
      }
    }

    try {
      const response = await api.post('/predictions/soil-scan', payload);
      setResult(response.data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('couldNotRefreshCropRecommendations')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadRecommendations(true);
  }, [loadRecommendations]);

  useEffect(() => {
    if (!selectedCrop) return undefined;
    const unlockScroll = lockDocumentScroll();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSelectedCrop(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unlockScroll();
    };
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
    const message = buildAudioGuide(selectedCrop, result, t);

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

  const locationLabel = result?.location?.label || t('savedFarmLocationIfAvailable');
  const recommendationIntro = result?.soil_summary
    ? `Based on ${result.soil_summary.toLowerCase()}`
    : t('basedOnLatestSoilScan');

  return (
    <div className="page-stack">
      <CropGuideModal
        crop={selectedCrop}
        weatherSummary={result?.weather_summary}
        onClose={() => setSelectedCrop(null)}
        onPlayAudio={playAudioGuide}
        t={t}
      />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{t('recommendations')}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-normal text-stone-950 sm:text-3xl">{t('cropRecommendations')}</h1>
          <TranslatedText
            as="p"
            className="mt-2 max-w-4xl text-sm leading-6 text-stone-600"
            text={`${recommendationIntro}. ${result?.weather_summary ? `${result.weather_summary}.` : ''} ${t('usingLocation', { location: locationLabel })}`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700">
              {scanSource === 'latest-scan' ? t('basedOnLatestSoilScan') : t('soilReadingsPrompt')}
            </span>
            {result?.best_crop && (
              <span className="rounded-full border border-leaf-100 bg-leaf-50 px-4 py-2 text-sm font-semibold text-leaf-800">
                {t('bestMatch', { crop: result.best_crop })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary h-10 px-4 text-sm" onClick={() => loadRecommendations(true)} type="button" disabled={loading || gpsState.locating}>
            {loading || gpsState.locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            {loading || gpsState.locating ? t('refreshing') : t('useCurrentGps')}
          </button>
          <button className="btn-secondary h-10 px-4 text-sm" onClick={cycleSortMode} type="button">
            <Filter className="h-4 w-4" />
            {t('sort')}: {translatedSortMode(sortMode, t)}
          </button>
        </div>
      </div>

      {(gpsState.error || error) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          {gpsState.error || error}
        </div>
      )}

      {audioStatus && (
        <div className="rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800">
          {audioStatus}
        </div>
      )}

      <section className="rounded-lg border border-sky-100 bg-sky-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-sky-700">{t('locationAndWeather')}</p>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
              <MapPin className="h-4 w-4 text-sky-600" />
              <span>{locationLabel}</span>
            </div>
            {result?.weather_summary ? (
              <TranslatedText as="p" className="mt-1 text-sm text-stone-600" text={result.weather_summary} />
            ) : (
              <p className="mt-1 text-sm text-stone-600">{t('currentLiveWeatherAfterSoil')}</p>
            )}
          </div>
          <div className="grid gap-2 text-sm text-stone-700 sm:grid-cols-2">
            <span className="rounded-lg bg-white/80 px-4 py-3 font-semibold">{result?.best_crop ? t('bestMatch', { crop: result.best_crop }) : t('pending')}</span>
            <span className="rounded-lg bg-white/80 px-4 py-3 font-semibold">{result ? `${Math.round(result.confidence * 100)}% ${t('suitability')}` : t('checking')}</span>
          </div>
        </div>
      </section>

      <div className="pill-strip">
        {categories.map((item) => (
          <button
            key={item}
            className={`shrink-0 rounded-full px-8 py-3 text-base font-semibold ${
              activeCategory === item ? 'bg-leaf-600 text-white shadow-[0_8px_16px_rgba(22,163,74,0.18)]' : 'border border-stone-200 bg-white text-stone-600'
            }`}
            onClick={() => setActiveCategory(item)}
            type="button"
          >
            {translatedCategory(item, t)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="surface rounded-lg p-10 text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-leaf-600" />
          <p className="mt-4 text-lg font-bold text-stone-950">{t('refreshRecommendation')}</p>
          <p className="mt-2 text-sm text-stone-500">{t('completeManualSoilScan')}</p>
        </div>
      ) : (
        <div className="card-grid">
          {visibleCrops.map((crop) => <CropCard key={crop.id} crop={crop} onGuide={setSelectedCrop} weatherSummary={result?.weather_summary} t={t} />)}
          {visibleCrops.length === 0 && (
            <div className="surface rounded-lg p-8 text-center xl:col-span-2">
              <Leaf className="mx-auto h-10 w-10 text-stone-400" />
              <p className="mt-3 font-bold text-stone-950">{t('noRecommendationsCategory')}</p>
              <button className="btn-secondary mt-4" type="button" onClick={() => setActiveCategory('All Crops')}>{t('showAllCrops')}</button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
