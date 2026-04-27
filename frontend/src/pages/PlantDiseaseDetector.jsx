import {
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  ImagePlus,
  Leaf,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { diseaseDetectorImage } from '../assets/visuals/index.js';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

const HISTORY_STORAGE_KEY = 'agriscan_disease_scans';
const quickCropOptions = ['Rice', 'Corn', 'Tomato'];

function makeHistoryId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferCropLabel(scan) {
  const text = `${scan?.disease_name || ''} ${scan?.cause || ''}`.toLowerCase();
  if (text.includes('rice') || text.includes('palay')) return 'Rice';
  if (text.includes('corn') || text.includes('maize') || text.includes('mais')) return 'Corn';
  if (text.includes('tomato') || text.includes('kamatis')) return 'Tomato';
  return null;
}

function resolveCropLabel(scan) {
  return scan?.crop_label || scan?.crop_type || inferCropLabel(scan) || 'Unverified crop';
}

function ResultPanel({ result, previewUrl, t }) {
  const confidence = result ? Math.round(result.confidence * 100) : 0;
  const cropLabel = result ? resolveCropLabel(result) : '--';
  const cropVerified = Boolean(result?.crop_label || result?.crop_type || inferCropLabel(result));

  return (
    <section className="surface overflow-hidden rounded-lg">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-4 py-2 text-sm font-bold text-leaf-700">
              <FlaskConical className="h-4 w-4" />
              {t('analysisReady')}
            </span>
            {cropLabel !== '--' && (
              <span className="rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">
                {cropLabel}
              </span>
            )}
          </div>

          <h2 className="mt-5 text-2xl font-bold text-stone-950 sm:text-3xl">
            {result?.disease_name || t('readyForDiseaseAnalysis')}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 sm:text-base">
            {result?.cause || t('diseaseAnalysisPrompt')}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('detectedCrop')}</p>
              <p className="mt-2 text-lg font-bold text-stone-950">{cropLabel}</p>
              <p className="mt-1 text-sm text-stone-500">
                {cropVerified ? 'Detected from the uploaded crop image' : 'AgriScan could not specifically verify the crop from this image yet'}
              </p>
            </article>
            <article className="rounded-lg border border-leaf-100 bg-leaf-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">{t('confidence')}</p>
              <p className="mt-2 text-3xl font-bold text-leaf-900">{confidence || '--'}%</p>
              <div className="mt-3 h-2 rounded-full bg-white">
                <div className="h-2 rounded-full bg-leaf-600" style={{ width: `${confidence}%` }} />
              </div>
            </article>
          </div>

          {result && (
            <div className="mt-6 space-y-4">
              <article className="rounded-lg border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('likelyCause')}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{result.cause}</p>
              </article>
              <article className="rounded-lg border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('treatmentSuggestion')}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{result.treatment}</p>
              </article>
              <article className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{t('modelBasis')}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{t('modelBasisBody')}</p>
              </article>
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 bg-stone-50 p-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('uploadCropImage')}</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {previewUrl ? (
              <img src={previewUrl} alt="Crop preview" className="h-64 w-full object-cover" />
            ) : (
              <div className="relative h-64 overflow-hidden bg-stone-100">
                <img src={diseaseDetectorImage} alt="Sample crop disease leaves" className="h-full w-full object-cover opacity-45" />
                <div className="absolute inset-0 grid place-items-center bg-white/50 text-stone-500">
                  <div className="text-center">
                    <ImagePlus className="mx-auto h-10 w-10" />
                    <p className="mt-3 text-sm font-semibold">{t('diseaseAnalysisPrompt')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {result?.image_name && <p className="mt-3 text-sm font-semibold text-stone-700">{result.image_name}</p>}
        </div>
      </div>
    </section>
  );
}

function HistoryList({ history, onSelect, t }) {
  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-950">{t('recentDiseaseScans')}</h2>
          <p className="text-sm text-stone-500">{t('savedDiseaseDetections')}</p>
        </div>
        <span className="w-fit rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700">
          {history.length} {t('total')}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {history.slice(0, 6).map((scan) => (
          <button
            key={scan.local_id}
            className="surface rounded-lg p-4 text-left transition hover:border-leaf-200 hover:bg-leaf-50"
            onClick={() => onSelect(scan)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{resolveCropLabel(scan)}</p>
                <h3 className="mt-2 text-lg font-bold text-stone-950">{scan.disease_name}</h3>
                <p className="mt-1 text-sm text-stone-500">{new Date(scan.created_at).toLocaleString()}</p>
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
            <p className="mt-3 text-sm font-semibold text-stone-500">{t('noDiseaseDetections')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function PlantDiseaseDetector() {
  const { t } = useI18n();
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = Boolean(imageFile);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]'));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function saveHistory(scan) {
    const next = [scan, ...history.filter((item) => item.local_id !== scan.local_id)].slice(0, 12);
    setHistory(next);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  }

  function updateImage(nextFile) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/')) {
      setError('Please upload a valid crop image file.');
      return;
    }

    setError('');
    setResult(null);
    setImageFile(nextFile);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(nextFile);
    });
  }

  function clearImage() {
    setImageFile(null);
    setFileInputKey((current) => current + 1);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return '';
    });
  }

  function resetForm() {
    setResult(null);
    setError('');
    clearImage();
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    const payload = new FormData();
    payload.append('image', imageFile);

    try {
      const response = await api.post('/scans', payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const nextResult = {
        ...response.data,
        local_id: makeHistoryId(),
        created_at: new Date().toISOString(),
        crop_label: response.data.crop_label || inferCropLabel(response.data),
        image_name: imageFile.name,
      };

      setResult(nextResult);
      saveHistory(nextResult);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Disease detection failed.'));
    } finally {
      setLoading(false);
    }
  }

  function handleHistorySelect(scan) {
    clearImage();
    setResult(scan);
  }

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-lg border border-leaf-100 bg-white">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-4 py-2 text-sm font-bold text-leaf-700">
                <Leaf className="h-4 w-4" />
                {t('plantDiseaseDetector')}
              </span>
              <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
                ML image analysis
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-normal text-stone-950 sm:text-4xl">
              {t('plantDiseaseDetector')}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-stone-500 sm:text-lg">
              {t('plantDiseaseDetectorBody')}
            </p>
          </div>

          <div className="grid content-center gap-3 border-t border-leaf-100 bg-leaf-50 p-6 lg:border-l lg:border-t-0">
            <div className="overflow-hidden rounded-lg border border-white/80 bg-white shadow-sm">
              <img src={diseaseDetectorImage} alt="Rice, corn, and tomato leaves with disease symptoms" className="h-40 w-full object-cover" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">Supported crop focus</p>
            <div className="flex flex-wrap gap-2">
              {quickCropOptions.map((crop) => (
                <span key={crop} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-stone-700">
                  {crop}
                </span>
              ))}
            </div>
            <p className="text-sm leading-6 text-stone-600">{t('supportedVisualCrops')}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={submit} className="surface rounded-lg p-5 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-950">{t('uploadCropImage')}</h2>
              <p className="mt-1 text-sm text-stone-500">Upload one crop or leaf image. AgriScan will detect the crop and analyze possible disease automatically.</p>
            </div>
            <button className="btn-icon" type="button" onClick={resetForm} title={t('resetForm')}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white px-5 py-8 text-center transition hover:border-leaf-300 hover:bg-leaf-50">
                <input
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  key={fileInputKey}
                  type="file"
                  onChange={(event) => updateImage(event.target.files?.[0])}
                />
                {previewUrl ? (
                  <img src={previewUrl} alt="Crop preview" className="h-56 w-full rounded-lg object-cover" />
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-leaf-600" />
                    <p className="mt-4 text-base font-bold text-stone-900">{t('takeOrUploadPhoto')}</p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">
                      Take a clear crop or leaf photo with one main subject and natural light when possible.
                    </p>
                  </>
                )}
              </label>

              {imageFile && (
                <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-stone-900">{imageFile.name}</p>
                    <p className="mt-1 text-xs text-stone-500">{formatFileSize(imageFile.size)}</p>
                  </div>
                  <button className="btn-icon h-9 w-9 shrink-0" type="button" onClick={clearImage} aria-label={t('removePhoto')}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

          <button className="btn-primary mt-6 h-12 w-full text-base" disabled={!canSubmit || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {loading ? t('analyzingCropImage') : t('analyzeCropImage')}
          </button>
        </form>

        <div className="space-y-6">
          <ResultPanel result={result} previewUrl={previewUrl} t={t} />

          <section className="grid gap-4 sm:grid-cols-2">
            <article className="surface rounded-lg p-5">
              <Leaf className="h-5 w-5 text-leaf-600" />
              <p className="mt-4 text-sm font-bold uppercase tracking-wide text-stone-500">{t('detectedCrop')}</p>
              <p className="mt-1 text-xl font-bold text-stone-950">{result ? resolveCropLabel(result) : '--'}</p>
            </article>
            <article className="surface rounded-lg p-5">
              <FlaskConical className="h-5 w-5 text-leaf-600" />
              <p className="mt-4 text-sm font-bold uppercase tracking-wide text-stone-500">{t('diagnosis')}</p>
              <p className="mt-1 text-xl font-bold text-stone-950">{result?.disease_name || '--'}</p>
            </article>
          </section>

          <HistoryList history={history} onSelect={handleHistorySelect} t={t} />
        </div>
      </div>
    </div>
  );
}
