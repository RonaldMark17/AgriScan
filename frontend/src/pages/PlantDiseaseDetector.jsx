import {
  Camera,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  ImagePlus,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, getApiBaseUrl } from '../api/client.js';
import { diseaseDetectorImage } from '../assets/visuals/index.js';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

const HISTORY_STORAGE_KEY = 'agriscan_disease_scans';
const MAX_IMAGE_UPLOAD_MB = 10;
const MAX_IMAGE_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_MB * 1024 * 1024;
const INVALID_CROP_IMAGE_MESSAGE =
  'Upload a clear close-up crop leaf, fruit, stem, or plant-part photo with the crop as the main subject. Grass or leaves in the background are not enough for diagnosis.';
const supportedCropFocus = [
  { key: 'rice', name: 'Rice', aliases: ['palay'] },
  { key: 'corn', name: 'Corn', aliases: ['maize', 'mais'] },
  { key: 'coconut', name: 'Coconut', aliases: ['niyog'] },
  { key: 'banana', name: 'Banana', aliases: ['saging'] },
  { key: 'sugarcane', name: 'Sugarcane', aliases: ['sugar cane', 'tubo'] },
  { key: 'cassava', name: 'Cassava', aliases: ['kamoteng kahoy', 'kamote kahoy'] },
  { key: 'sweet_potato', name: 'Sweet Potato', aliases: ['sweet potato', 'camote', 'kamote'] },
  { key: 'tomato', name: 'Tomato', aliases: ['kamatis'] },
  { key: 'eggplant', name: 'Eggplant', aliases: ['talong'] },
  { key: 'mung_bean', name: 'Mung Bean', aliases: ['mungbean', 'mongo', 'monggo'] },
  { key: 'mango', name: 'Mango', aliases: ['mangga'] },
  { key: 'pineapple', name: 'Pineapple', aliases: ['pinya'] },
  { key: 'calamansi', name: 'Calamansi', aliases: ['kalamansi'] },
  { key: 'onion', name: 'Onion', aliases: ['sibuyas'] },
  { key: 'cabbage', name: 'Cabbage', aliases: ['repolyo'] },
  { key: 'bitter_gourd', name: 'Bitter Gourd', aliases: ['ampalaya'] },
  { key: 'pepper', name: 'Pepper', aliases: ['sili', 'chili', 'chilli', 'bell pepper'] },
  { key: 'potato', name: 'Potato', aliases: ['patatas'] },
  { key: 'guava', name: 'Guava', aliases: ['bayabas'] },
  { key: 'cacao', name: 'Cacao', aliases: ['cocoa'] },
  { key: 'coffee', name: 'Coffee', aliases: ['kape'] },
  { key: 'abaca', name: 'Abaca', aliases: ['abaka'] },
];
const quickCropOptions = supportedCropFocus.map((crop) => crop.name);
const cropDisplayNamesByKey = Object.fromEntries(supportedCropFocus.map((crop) => [crop.key, crop.name]));
const cropAliasEntries = supportedCropFocus
  .flatMap((crop) => [crop.key, crop.name, ...crop.aliases].map((alias) => [alias.toLowerCase().replace(/[_-]+/g, ' '), crop.key]))
  .sort((first, second) => second[0].length - first[0].length);

function makeHistoryId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getBackendHealthUrl() {
  const apiBaseUrl = getApiBaseUrl();
  try {
    const url = new URL(apiBaseUrl, window.location.origin);
    url.pathname = url.pathname.replace(/\/api\/v1\/?$/, '') || '/';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/health`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `${apiBaseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')}/health`;
  }
}

async function checkBackendHealth(timeoutMs = 2500) {
  if (!window.navigator.onLine) return false;
  const controller = new window.AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(getBackendHealthUrl(), {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
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
  return scan?.crop_label || scan?.crop_type || inferCropLabel(scan) || 'General crop leaf';
}

const offlineDiseaseGuide = {
  pest_leaf_damage: {
    disease_name: 'Pest or physical leaf damage',
    cause: 'The photo shows torn leaf edges, holes, or missing tissue. This often points to chewing pests or recent physical damage rather than a leaf disease.',
    treatment: 'Inspect both sides of nearby leaves for larvae or insects, remove badly damaged leaves when practical, and use integrated pest management before any pesticide decision.',
  },
  leaf_spot_or_blight: {
    disease_name: 'Leaf spot or blight symptoms',
    cause: 'The image shows damaged or discolored leaf tissue that can match a leaf spot, blight, or stress pattern.',
    treatment: 'Remove heavily affected leaves, improve airflow, avoid wetting foliage, and confirm the crop-specific cause with a local agriculture officer.',
  },
  rice_blast: {
    disease_name: 'Rice blast',
    cause: 'The photo shows elongated brown or gray lesions on rice leaves, a common visual pattern for rice blast.',
    treatment: 'Remove badly affected leaves, avoid heavy late nitrogen, improve airflow, and ask the local agriculture office about resistant varieties or approved fungicide timing.',
  },
  rice_bacterial_leaf_blight: {
    disease_name: 'Rice bacterial leaf blight',
    cause: 'The rice leaf shows blighted brown or yellow tissue that can match bacterial leaf blight patterns.',
    treatment: 'Use clean seedlings, improve drainage, avoid excess nitrogen, and confirm locally before applying bactericide.',
  },
  rice_brown_spot: {
    disease_name: 'Rice brown spot',
    cause: 'The image has multiple brown leaf spots on rice, which can appear when leaves stay wet or the crop is stressed.',
    treatment: 'Correct nutrient stress, keep the field clean, avoid prolonged leaf wetness, and use approved fungicide only when field pressure is high.',
  },
  rice_leaf_folder: {
    disease_name: 'Rice leaf folder damage',
    cause: 'Folded, scraped, or missing rice leaf tissue can match leaf-folder or chewing pest damage.',
    treatment: 'Open folded leaves and scout for larvae, preserve natural enemies, and use threshold-based pest control when local guidance recommends it.',
  },
  corn_northern_leaf_blight: {
    disease_name: 'Corn northern leaf blight',
    cause: 'The corn leaf pattern resembles elongated tan or gray blight lesions.',
    treatment: 'Improve residue management, rotate crops, use resistant hybrids, and consider fungicide only when disease pressure and crop stage justify it.',
  },
  corn_gray_leaf_spot: {
    disease_name: 'Corn gray leaf spot',
    cause: 'The corn leaf shows spot-like lesions that can match gray leaf spot under humid conditions.',
    treatment: 'Use resistant hybrids, rotate away from corn, manage crop residue, and scout before any fungicide decision.',
  },
  corn_common_rust: {
    disease_name: 'Corn common rust',
    cause: 'Rust-colored speckling on corn leaves can indicate common rust.',
    treatment: 'Scout nearby plants, plant resistant hybrids in future cycles, and seek local advice if rust pustules spread quickly.',
  },
  tomato_early_blight: {
    disease_name: 'Tomato early blight',
    cause: 'The tomato leaf has brown necrotic spotting consistent with early blight or related leaf spot symptoms.',
    treatment: 'Remove lower infected leaves, mulch to reduce soil splash, improve airflow, and use approved fungicide if symptoms spread.',
  },
  tomato_late_blight: {
    disease_name: 'Tomato late blight',
    cause: 'Dark, fast-spreading tomato leaf lesions can match late blight under cool, wet weather.',
    treatment: 'Remove infected tissue, keep foliage dry, avoid overhead watering, and contact local agriculture support because late blight can spread quickly.',
  },
  tomato_bacterial_spot: {
    disease_name: 'Tomato bacterial spot',
    cause: 'Many small dark tomato leaf spots can match bacterial spot symptoms.',
    treatment: 'Avoid handling wet plants, prune infected leaves, improve airflow, and follow local copper or bactericide guidance if confirmed.',
  },
  tomato_septoria_leaf_spot: {
    disease_name: 'Tomato Septoria leaf spot',
    cause: 'Many small circular spots on tomato foliage can match Septoria leaf spot or a related tomato leaf spot disease.',
    treatment: 'Remove infected lower leaves, mulch to reduce soil splash, keep irrigation off foliage, and rotate away from tomato or potato where possible.',
  },
  pepper_bacterial_spot: {
    disease_name: 'Pepper bacterial spot',
    cause: 'The pepper leaf shows spotting that commonly matches bacterial spot symptoms.',
    treatment: 'Avoid wet handling, remove infected leaves, improve spacing, and use clean seed or transplants in the next cycle.',
  },
  potato_early_blight: {
    disease_name: 'Potato early blight',
    cause: 'The potato leaf shows brown necrotic lesions consistent with early blight or related leaf spot symptoms.',
    treatment: 'Remove infected leaves, avoid water splash, keep plants vigorous, and use approved fungicide if field pressure increases.',
  },
  potato_late_blight: {
    disease_name: 'Potato late blight',
    cause: 'Dark potato leaf lesions can match late blight, especially after cool wet weather.',
    treatment: 'Remove infected tissue quickly, keep foliage dry, and seek local guidance because late blight can spread rapidly.',
  },
  banana_black_sigatoka: {
    disease_name: 'Banana black Sigatoka',
    cause: 'The banana leaf shows streaking or necrotic spotting consistent with Sigatoka-type leaf disease.',
    treatment: 'Remove heavily infected leaves, improve plantation airflow, avoid overcrowding, and follow local Sigatoka management guidance.',
  },
  banana_yellow_sigatoka: {
    disease_name: 'Banana yellow Sigatoka',
    cause: 'Yellow-brown streaks on banana leaves can match yellow Sigatoka symptoms.',
    treatment: 'Prune infected leaves, improve ventilation, and use clean field sanitation to slow spread.',
  },
  banana_insect_pest: {
    disease_name: 'Banana insect pest damage',
    cause: 'The banana leaf shows missing or torn tissue that can match insect feeding or physical leaf damage.',
    treatment: 'Inspect the plant for active insects, remove badly affected leaves, improve sanitation, and follow local banana IPM guidance.',
  },
  banana_fruit_rot: {
    disease_name: 'Banana fruit rot symptoms',
    cause: 'The photo shows dark, sunken, or spreading lesions on banana fruit tissue rather than a leaf-only disease pattern.',
    treatment: 'Remove badly affected fruit, reduce handling wounds, keep bunches dry, improve sanitation, and confirm anthracnose or another fruit rot locally.',
  },
  banana_crown_rot: {
    disease_name: 'Banana crown or bunch rot symptoms',
    cause: 'The photo shows dark decay around the banana crown, cut ends, or bunch tissue.',
    treatment: 'Separate affected hands, sanitize tools and containers, avoid harvest injuries, and follow local postharvest disease guidance.',
  },
  mango_anthracnose: {
    disease_name: 'Mango anthracnose',
    cause: 'Dark mango leaf lesions commonly match anthracnose or related fungal spotting.',
    treatment: 'Prune infected tissues, improve airflow, avoid prolonged wetness, and use locally approved protective spray if needed.',
  },
  mango_bacterial_canker: {
    disease_name: 'Mango bacterial canker',
    cause: 'Multiple dark mango leaf lesions can match bacterial canker or bacterial spotting symptoms.',
    treatment: 'Prune affected tissue, disinfect tools, avoid overhead irrigation, and confirm with local agriculture support.',
  },
  mango_cutting_weevil: {
    disease_name: 'Mango cutting weevil damage',
    cause: 'The mango leaf shows cut or missing tissue that can match chewing insect damage.',
    treatment: 'Inspect new flushes for pests, remove affected material, and follow local mango IPM recommendations before spraying.',
  },
  guava_red_rust: {
    disease_name: 'Guava red rust',
    cause: 'Rust-colored spotting on guava leaves can match red rust symptoms.',
    treatment: 'Prune affected foliage, improve canopy ventilation, and follow local fungicide guidance if symptoms spread.',
  },
  guava_phytophthora: {
    disease_name: 'Guava phytophthora disease',
    cause: 'Dark water-stressed lesions on guava can match Phytophthora-type disease pressure.',
    treatment: 'Improve drainage, avoid standing water, remove infected tissues, and confirm diagnosis locally.',
  },
  guava_scab: {
    disease_name: 'Guava scab',
    cause: 'Guava leaf spotting can match scab or related surface lesions.',
    treatment: 'Remove infected tissue, improve airflow, protect new flushes, and use crop-specific fungicide guidance when needed.',
  },
  healthy: {
    disease_name: 'Healthy crop',
    cause: 'No strong disease lesion pattern was detected in the offline image scan.',
    treatment: 'Continue regular monitoring, balanced watering, field sanitation, and nutrient management.',
  },
};

function normalizeCrop(value) {
  return (value || '').trim().toLowerCase();
}

function normalizeCropKey(value) {
  const normalized = normalizeCrop(value).replace(/[_-]+/g, ' ');
  if (!normalized) return '';
  for (const [alias, cropKey] of cropAliasEntries) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized)) {
      return cropKey;
    }
  }
  return normalized.replace(/\s+/g, '_');
}

function cropDisplayName(value) {
  const cropKey = normalizeCropKey(value);
  return cropDisplayNamesByKey[cropKey] || value || 'General crop leaf';
}

function shouldUseBrowserFallback(error) {
  if (!window.navigator.onLine) return true;
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) return true;
  if (!error?.response) return true;
  return error.response.status >= 500;
}

function scanRequestErrorMessage(error, fallback = 'Disease detection failed.') {
  const apiMessage = getApiErrorMessage(error, '');
  const status = error?.response?.status;
  if (status === 401) return 'Your session expired. Please sign in again, then scan the image.';
  if (status === 403) return 'Your account is not allowed to create disease scans.';
  if (status === 413) return `Image exceeds the ${MAX_IMAGE_UPLOAD_MB} MB upload limit.`;
  if (status === 415) return apiMessage || 'Only JPG, PNG, and WebP images are supported.';
  if (status >= 400 && status < 500) return apiMessage || 'AgriScan could not process this image. Try a JPG, PNG, or WebP crop photo.';
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')) {
    return 'The backend model took too long to respond, so AgriScan used browser analysis for this scan.';
  }
  return apiMessage || fallback;
}

function isLocalVisualAnalysisMode(mode) {
  const text = (mode || '').toLowerCase();
  return text.includes('offline') || text.includes('fallback') || text.includes('browser') || text.includes('crop-part') || text.includes('filename-guided');
}

function healthyKeyForCrop(crop) {
  return crop ? `${crop}_healthy` : 'healthy';
}

function normalizeContextText(value) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const nonCropFilenameTerms = [
  'dog',
  'dogs',
  'cat',
  'cats',
  'puppy',
  'puppies',
  'kitten',
  'terrier',
  'spaniel',
  'retriever',
  'shepherd',
  'shih',
  'lhasa',
  'chihuahua',
  'poodle',
  'corgi',
  'collie',
  'hound',
  'husky',
  'wolf',
  'wolves',
  'horse',
  'cow',
  'goat',
  'sheep',
  'pig',
  'bird',
  'person',
  'people',
  'human',
  'face',
  'car',
  'truck',
  'bus',
  'motorcycle',
  'bicycle',
  'phone',
  'laptop',
  'computer',
  'keyboard',
];

function hasNonCropFilenameContext(fileName) {
  const text = normalizeContextText(fileName);
  if (!text) return false;
  if (text.includes('spider mite')) return false;
  const tokens = new Set(text.split(/\s+/));
  return nonCropFilenameTerms.some((term) => tokens.has(term));
}

function inferContextFromFilename(fileName, cropType) {
  const text = normalizeContextText(fileName);
  let crop = normalizeCropKey(cropType);
  if (!text) return { crop, key: '', confidence: 0 };

  for (const [alias, cropKey] of cropAliasEntries) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) {
      crop = cropKey;
      break;
    }
  }
  if (/\b(bunch|crown)\b/.test(text)) crop = 'banana';

  if (text.includes('early blight')) {
    if (crop === 'potato') return { crop: 'potato', key: 'potato_early_blight', confidence: 0.88 };
    if (!crop || crop === 'tomato') return { crop: 'tomato', key: 'tomato_early_blight', confidence: 0.88 };
    return { crop, key: 'leaf_spot_or_blight', confidence: 0.78 };
  }
  if (text.includes('late blight')) {
    if (crop === 'potato') return { crop: 'potato', key: 'potato_late_blight', confidence: 0.86 };
    if (!crop || crop === 'tomato') return { crop: 'tomato', key: 'tomato_late_blight', confidence: 0.86 };
    return { crop, key: 'leaf_spot_or_blight', confidence: 0.76 };
  }
  if (text.includes('septoria')) return { crop: 'tomato', key: 'tomato_septoria_leaf_spot', confidence: 0.86 };
  if (text.includes('target spot')) return { crop: 'tomato', key: 'tomato_target_spot', confidence: 0.84 };
  if (text.includes('rice blast') || (crop === 'rice' && text.includes('blast'))) return { crop: 'rice', key: 'rice_blast', confidence: 0.86 };
  if (text.includes('northern leaf blight') || (crop === 'corn' && text.includes('blight'))) return { crop: 'corn', key: 'corn_northern_leaf_blight', confidence: 0.84 };
  if (text.includes('sigatoka')) return { crop: 'banana', key: text.includes('black') ? 'banana_black_sigatoka' : 'banana_yellow_sigatoka', confidence: 0.84 };
  if (crop === 'banana' && /\b(bunch|crown|closeup|close up)\b/.test(text)) return { crop: 'banana', key: 'banana_crown_rot', confidence: 0.83 };
  if (crop === 'banana' && /\b(fruit|rot|anthracnose|black|disease|spot)\b/.test(text)) return { crop: 'banana', key: 'banana_fruit_rot', confidence: 0.82 };

  return { crop, key: '', confidence: 0 };
}

function looksLikeBananaFruitIssue(features, crop) {
  if (crop !== 'banana') return false;
  const fruitSignal = features.bananaFruitRatio >= 0.1 || features.yellowRatio >= 0.045 || (features.greenComponentCount >= 8 && features.maxGreenAspect >= 2);
  const decaySignal = features.darkLesionRatio >= 0.045 || features.lesionRatio >= 0.08;
  const notLeafDominant = features.greenLeafRatio < 0.38 || features.greenComponentCount >= 8;
  return fruitSignal && decaySignal && notLeafDominant;
}

function looksLikeMangoLeaf(features) {
  const broadLanceolateLeaf =
    features.greenLeafRatio >= 0.32 &&
    features.maxGreenAreaRatio >= 0.24 &&
    features.maxGreenAspect >= 2.6 &&
    features.maxGreenAspect <= 7.5;
  const spottedOrBlighted = features.componentCount >= 4 || features.lesionRatio >= 0.025 || features.darkLesionRatio >= 0.018;
  const notFruitCluster = features.bananaFruitRatio < 0.12 && features.yellowRatio < 0.09;
  return broadLanceolateLeaf && spottedOrBlighted && notFruitCluster;
}

function pickOfflineDiseaseKey(crop, features) {
  if (looksLikeBananaFruitIssue(features, crop)) {
    return features.greenComponentCount >= 8 ? 'banana_crown_rot' : 'banana_fruit_rot';
  }

  const structuralDamage =
    features.greenLeafRatio >= 0.14 &&
    features.lesionWithinPlant < 0.045 &&
    features.lesionRatio < 0.045 &&
    features.adjacentNonleafRatio >= 0.08 &&
    (features.greenEdgeRatio >= 0.18 || (features.adjacentNonleafRatio >= 0.18 && features.contrast >= 55));
  const highEdgeDamage =
    features.greenLeafRatio >= 0.12 &&
    features.lesionRatio < 0.035 &&
    features.contrast >= 62 &&
    features.greenEdgeRatio >= 0.24;
  if (structuralDamage || highEdgeDamage) {
    if (crop === 'rice') return 'rice_leaf_folder';
    if (crop === 'banana') return 'banana_insect_pest';
    if (crop === 'mango') return 'mango_cutting_weevil';
    return 'pest_leaf_damage';
  }

  const healthyLeaf = features.greenLeafRatio >= 0.26 && features.lesionWithinPlant < 0.035 && features.lesionRatio < 0.025 && features.contrast < 72;
  if (healthyLeaf) return offlineDiseaseGuide[healthyKeyForCrop(crop)] ? healthyKeyForCrop(crop) : 'healthy';

  const elongated = features.maxAspect >= 1.8 && features.maxAreaRatio >= 0.006;
  const manySpots = features.componentCount >= 7 && features.maxAreaRatio < 0.025;
  const highLesion = features.lesionWithinPlant >= 0.08 || features.lesionRatio >= 0.055;
  const yellowing = features.yellowRatio >= 0.12 && features.lesionRatio < 0.05;
  const edgeBlight = features.edgeLesionRatio >= 0.08;

  if (crop === 'rice') {
    if (features.maxAreaRatio >= 0.06 || features.darkLesionRatio >= 0.08) return 'rice_blast';
    if (yellowing) return 'rice_bacterial_leaf_blight';
    if (edgeBlight) return 'rice_bacterial_leaf_blight';
    if (elongated) return 'rice_bacterial_leaf_blight';
    if (manySpots) return 'rice_brown_spot';
    return highLesion ? 'rice_blast' : 'rice_brown_spot';
  }
  if (crop === 'corn') {
    if (features.rustRatio >= 0.035 && manySpots) return 'corn_common_rust';
    if (manySpots && !elongated) return 'corn_gray_leaf_spot';
    return 'corn_northern_leaf_blight';
  }
  if (crop === 'tomato') {
    if (features.darkLesionRatio >= 0.055 || features.lesionRatio >= 0.09) return 'tomato_late_blight';
    if (manySpots && features.maxAreaRatio < 0.012) return 'tomato_septoria_leaf_spot';
    if (manySpots && features.yellowRatio >= 0.08) return 'tomato_early_blight';
    if (manySpots) return 'tomato_bacterial_spot';
    return 'tomato_early_blight';
  }
  if (crop === 'pepper') return 'pepper_bacterial_spot';
  if (crop === 'potato') return features.darkLesionRatio >= 0.05 || features.lesionRatio >= 0.085 ? 'potato_late_blight' : 'potato_early_blight';
  if (crop === 'banana') return elongated && features.yellowRatio >= 0.06 ? 'banana_yellow_sigatoka' : 'banana_black_sigatoka';
  if (crop === 'mango') return manySpots ? 'mango_bacterial_canker' : 'mango_anthracnose';
  if (crop === 'guava') {
    if (features.rustRatio >= 0.025) return 'guava_red_rust';
    if (features.darkLesionRatio >= 0.045) return 'guava_phytophthora';
    return 'guava_scab';
  }
  if (highLesion) return 'leaf_spot_or_blight';
  if (features.contrast > 75) return 'pest_leaf_damage';
  return 'healthy';
}

function computeOfflineConfidence(features, crop) {
  const confidence = 0.56 + Math.min(features.lesionWithinPlant * 0.35, 0.18) + Math.min(features.lesionRatio * 1.5, 0.1) + (crop ? 0.08 : 0);
  return Math.min(Math.max(confidence, 0.6), 0.86);
}

function hasCropSubjectInForeground(features, crop) {
  const cropKey = normalizeCropKey(crop);
  const fruitOrProduceCrop = ['banana', 'corn', 'mango', 'guava', 'tomato', 'pepper', 'eggplant', 'cacao', 'coffee'].includes(cropKey);
  const centeredLeaf = features.centerGreenRatio >= 0.075 || (features.maxGreenAreaRatio >= 0.12 && features.greenLeafRatio >= 0.18);
  const animalLikeCenter =
    features.centerGreenRatio < 0.04 &&
    features.centerTanRatio >= 0.28 &&
    features.centerNeutralRatio >= 0.16 &&
    features.centerFruitRatio < 0.14;
  const centeredDiseaseTissue =
    !animalLikeCenter &&
    features.centerLesionRatio >= 0.08 &&
    (features.centerGreenRatio >= 0.035 || features.greenLeafRatio >= 0.1);
  const centeredFruitOrStem =
    fruitOrProduceCrop &&
    features.centerFruitRatio >= 0.18 &&
    (features.centerGreenRatio >= 0.035 || features.greenLeafRatio >= 0.1 || features.lesionRatio >= 0.065);

  return centeredLeaf || centeredDiseaseTissue || centeredFruitOrStem;
}

function shouldRejectNonCropForeground(features, crop) {
  const hasForegroundCrop = hasCropSubjectInForeground(features, crop);
  const syntheticGreenBackground =
    features.chromaGreenRatio >= 0.35 &&
    features.centerChromaGreenRatio >= 0.22 &&
    features.chromaGreenRatio / Math.max(features.greenLeafRatio, 0.001) >= 0.55 &&
    features.naturalGreenRatio <= 0.18 &&
    features.centerNaturalGreenRatio <= 0.2 &&
    features.bananaFruitRatio < 0.1;
  const weakOverallCropSignal =
    features.greenLeafRatio < 0.06 && features.lesionRatio < 0.018 && features.bananaFruitRatio < 0.08;
  const backgroundOnlyGreen =
    features.greenLeafRatio >= 0.08 &&
    features.centerGreenRatio < 0.045 &&
    features.centerFruitRatio < 0.1 &&
    features.centerLesionRatio < 0.08;
  const centeredNeutralObject =
    features.centerNeutralRatio >= 0.34 &&
    features.centerGreenRatio < 0.08 &&
    features.centerFruitRatio < 0.22;
  const centeredFurLikeObject =
    features.centerGreenRatio < 0.07 &&
    features.centerTanRatio >= 0.18 &&
    features.centerNeutralRatio >= 0.16 &&
    features.maxGreenAreaRatio < 0.16 &&
    !hasForegroundCrop;
  const animalOnGreenBackground =
    features.greenLeafRatio >= 0.12 &&
    features.centerGreenRatio < 0.04 &&
    features.centerTanRatio >= 0.28 &&
    features.centerNeutralRatio >= 0.16 &&
    features.centerFruitRatio < 0.14 &&
    features.centerNaturalGreenRatio / Math.max(features.naturalGreenRatio, 0.001) < 0.35;
  const flatGreenBackground =
    !crop &&
    features.greenLeafRatio >= 0.58 &&
    features.lesionRatio < 0.018 &&
    features.greenComponentCount <= 2 &&
    features.greenEdgeRatio < 0.08 &&
    features.adjacentNonleafRatio < 0.08 &&
    features.centerFruitRatio < 0.18;

  return (
    syntheticGreenBackground ||
    weakOverallCropSignal ||
    backgroundOnlyGreen ||
    centeredNeutralObject ||
    centeredFurLikeObject ||
    animalOnGreenBackground ||
    flatGreenBackground
  );
}

function inferOfflineCrop(features, fileName = '') {
  const filenameContext = inferContextFromFilename(fileName, '');
  if (filenameContext.crop) return filenameContext.crop;
  if (features.greenLeafRatio < 0.08 && features.lesionRatio < 0.018) return '';

  const bananaFruitLike =
    (features.bananaFruitRatio >= 0.18 && features.darkLesionRatio >= 0.04 && features.lesionRatio >= 0.06) ||
    (features.greenComponentCount >= 8 && features.maxGreenAspect >= 2 && features.darkLesionRatio >= 0.08 && features.yellowRatio >= 0.04);
  if (bananaFruitLike) return 'banana';

  const manySmallSpots = features.componentCount >= 7 && features.maxAreaRatio < 0.012;
  const broadSpottedLeaf = features.greenLeafRatio >= 0.52 && features.componentCount >= 10 && features.maxAreaRatio < 0.055 && features.maxGreenAspect < 1.9;
  if (looksLikeMangoLeaf(features)) return 'mango';
  if (broadSpottedLeaf) return 'tomato';
  if (manySmallSpots && features.greenLeafRatio < 0.55) return 'tomato';
  if (features.greenLeafRatio < 0.18 && features.lesionRatio >= 0.05) return 'rice';

  const grassLikeLeaf = features.maxGreenAspect >= 2.3 || (features.greenComponentCount >= 3 && features.maxGreenAspect >= 1.9 && features.maxGreenAreaRatio < 0.18);

  if (grassLikeLeaf) {
    if (features.greenLeafRatio >= 0.18 || features.maxGreenAreaRatio >= 0.08) return 'corn';
    return 'rice';
  }
  if (features.yellowRatio >= 0.2 && features.lesionRatio >= 0.08 && features.greenLeafRatio >= 0.3) return 'banana';
  if (features.darkLesionRatio >= 0.04 && features.greenLeafRatio < 0.55) return 'tomato';
  if (features.greenLeafRatio >= 0.2 && features.maxGreenAspect >= 2.0) return 'corn';
  if (features.yellowRatio >= 0.1) return 'rice';
  return '';
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image for offline analysis.'));
    };
    image.src = url;
  });
}

async function analyzeImageOffline(file, cropType) {
  const crop = normalizeCropKey(cropType);
  if (hasNonCropFilenameContext(file.name)) {
    throw new Error(INVALID_CROP_IMAGE_MESSAGE);
  }

  const image = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;

  let greenLeaf = 0;
  let lesion = 0;
  let plant = 0;
  let yellow = 0;
  let rust = 0;
  let darkLesion = 0;
  let edgeLesion = 0;
  let bananaFruit = 0;
  let chromaGreen = 0;
  let naturalGreen = 0;
  let centerGreen = 0;
  let centerChromaGreen = 0;
  let centerNaturalGreen = 0;
  let centerLesion = 0;
  let centerFruit = 0;
  let centerNeutral = 0;
  let centerTan = 0;
  let sum = 0;
  let sumSq = 0;
  const lesionMask = new Uint8Array(size * size);
  const greenMask = new Uint8Array(size * size);
  const centerStart = size * 0.25;
  const centerEnd = size * 0.75;
  const centerPixelCount = (centerEnd - centerStart) * (centerEnd - centerStart);

  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    const red = pixels[offset] / 255;
    const green = pixels[offset + 1] / 255;
    const blue = pixels[offset + 2] / 255;
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel - minChannel;
    const brightness = (red + green + blue) / 3;
    sum += brightness;
    sumSq += brightness * brightness;

    const isGreenLeaf = green > red * 1.05 && green > blue * 1.05 && green > 0.15 && saturation > 0.08;
    const isBrown = red > 0.23 && green > 0.12 && blue < 0.38 && red > green * 1.02 && saturation > 0.1 && maxChannel < 0.82;
    const isDark = red > 0.14 && green > 0.08 && blue < 0.28 && red >= green * 0.85 && green > blue * 1.08 && saturation > 0.08 && maxChannel < 0.55;
    const isYellow = red > 0.45 && green > 0.42 && blue < 0.32 && green > blue * 1.15;
    const isRust = red > 0.48 && green > 0.2 && green < 0.48 && blue < 0.24 && red > green * 1.2;
    const isLesion = (isBrown || isDark || isYellow) && !isGreenLeaf;
    const isChromaGreen = isGreenLeaf && green > 0.42 && red < 0.25 && blue < 0.32 && saturation > 0.36;
    const isNeutralSubject = saturation < 0.18 && maxChannel > 0.25 && maxChannel < 0.95;
    const isTanSubject = red > 0.42 && green > 0.25 && blue > 0.12 && red > green * 1.08 && green > blue * 1.05 && saturation > 0.1;
    const isBananaFruit =
      red > 0.36 &&
      green > 0.32 &&
      blue < 0.55 &&
      red > blue * 1.12 &&
      green > blue * 1.1 &&
      red < green * 1.45 &&
      green < red * 1.55 &&
      saturation > 0.05 &&
      !isGreenLeaf;
    const x = index % size;
    const y = Math.floor(index / size);
    const isCenterPixel = x >= centerStart && x < centerEnd && y >= centerStart && y < centerEnd;
    if (isGreenLeaf) {
      greenLeaf += 1;
      greenMask[index] = 1;
      if (isChromaGreen) {
        chromaGreen += 1;
      } else {
        naturalGreen += 1;
      }
    }
    if (isBananaFruit) bananaFruit += 1;
    if (isYellow) yellow += 1;
    if (isRust) rust += 1;
    if (isDark) darkLesion += 1;
    if (isLesion) {
      lesion += 1;
      lesionMask[index] = 1;
      if (x < 14 || x > size - 15 || y < 14 || y > size - 15) edgeLesion += 1;
    }
    if (isCenterPixel) {
      if (isGreenLeaf) centerGreen += 1;
      if (isChromaGreen) centerChromaGreen += 1;
      if (isGreenLeaf && !isChromaGreen) centerNaturalGreen += 1;
      if (isLesion) centerLesion += 1;
      if (isBananaFruit) centerFruit += 1;
      if (isNeutralSubject) centerNeutral += 1;
      if (isTanSubject) centerTan += 1;
    }
    if (isGreenLeaf || isLesion) plant += 1;
  }

  const visited = new Uint8Array(size * size);
  let componentCount = 0;
  let maxAreaRatio = 0;
  let maxAspect = 1;
  const stack = [];
  for (let start = 0; start < lesionMask.length; start += 1) {
    if (!lesionMask[start] || visited[start]) continue;
    let area = 0;
    let minX = size;
    let maxX = 0;
    let minY = size;
    let maxY = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      area += 1;
      const x = current % size;
      const y = Math.floor(current / size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [current - 1, current + 1, current - size, current + size];
      for (const next of neighbors) {
        if (next < 0 || next >= lesionMask.length || visited[next] || !lesionMask[next]) continue;
        const nx = next % size;
        const cx = current % size;
        if (Math.abs(nx - cx) > 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    if (area >= 18) {
      componentCount += 1;
      const width = Math.max(maxX - minX + 1, 1);
      const height = Math.max(maxY - minY + 1, 1);
      maxAreaRatio = Math.max(maxAreaRatio, area / lesionMask.length);
      maxAspect = Math.max(maxAspect, Math.max(width / height, height / width));
    }
  }

  const greenVisited = new Uint8Array(size * size);
  let greenComponentCount = 0;
  let maxGreenAreaRatio = 0;
  let maxGreenAspect = 1;
  const greenStack = [];
  for (let start = 0; start < greenMask.length; start += 1) {
    if (!greenMask[start] || greenVisited[start]) continue;
    let area = 0;
    let minX = size;
    let maxX = 0;
    let minY = size;
    let maxY = 0;
    greenStack.push(start);
    greenVisited[start] = 1;
    while (greenStack.length) {
      const current = greenStack.pop();
      area += 1;
      const x = current % size;
      const y = Math.floor(current / size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [current - 1, current + 1, current - size, current + size];
      for (const next of neighbors) {
        if (next < 0 || next >= greenMask.length || greenVisited[next] || !greenMask[next]) continue;
        const nx = next % size;
        const cx = current % size;
        if (Math.abs(nx - cx) > 1) continue;
        greenVisited[next] = 1;
        greenStack.push(next);
      }
    }
    if (area >= 24) {
      greenComponentCount += 1;
      const width = Math.max(maxX - minX + 1, 1);
      const height = Math.max(maxY - minY + 1, 1);
      maxGreenAreaRatio = Math.max(maxGreenAreaRatio, area / greenMask.length);
      maxGreenAspect = Math.max(maxGreenAspect, Math.max(width / height, height / width));
    }
  }

  let greenEdge = 0;
  let adjacentNonleaf = 0;
  const neighborOffsets = [-1, 1, -size, size, -size - 1, -size + 1, size - 1, size + 1];
  for (let index = 0; index < greenMask.length; index += 1) {
    if (!greenMask[index]) continue;
    const x = index % size;
    let touchesNonGreen = false;
    let touchesNeutral = false;
    for (const offset of neighborOffsets) {
      const next = index + offset;
      if (next < 0 || next >= greenMask.length) continue;
      const nx = next % size;
      if (Math.abs(nx - x) > 1) continue;
      if (!greenMask[next]) {
        touchesNonGreen = true;
        const pixelOffset = next * 4;
        const red = pixels[pixelOffset] / 255;
        const green = pixels[pixelOffset + 1] / 255;
        const blue = pixels[pixelOffset + 2] / 255;
        const maxChannel = Math.max(red, green, blue);
        const minChannel = Math.min(red, green, blue);
        const saturation = maxChannel - minChannel;
        if (saturation < 0.3 && maxChannel > 0.18 && maxChannel < 0.9) touchesNeutral = true;
      }
    }
    if (touchesNonGreen) greenEdge += 1;
    if (touchesNeutral) adjacentNonleaf += 1;
  }

  const mean = sum / (size * size);
  const variance = sumSq / (size * size) - mean * mean;
  const features = {
    greenLeafRatio: greenLeaf / (size * size),
    lesionRatio: lesion / (size * size),
    lesionWithinPlant: lesion / Math.max(plant, 1),
    yellowRatio: yellow / (size * size),
    rustRatio: rust / (size * size),
    darkLesionRatio: darkLesion / (size * size),
    edgeLesionRatio: edgeLesion / Math.max(size * size * 0.32, 1),
    componentCount,
    maxAreaRatio,
    maxAspect,
    greenComponentCount,
    maxGreenAreaRatio,
    maxGreenAspect,
    greenEdgeRatio: greenEdge / Math.max(greenLeaf, 1),
    adjacentNonleafRatio: adjacentNonleaf / Math.max(greenLeaf, 1),
    bananaFruitRatio: bananaFruit / (size * size),
    chromaGreenRatio: chromaGreen / (size * size),
    naturalGreenRatio: naturalGreen / (size * size),
    centerGreenRatio: centerGreen / centerPixelCount,
    centerChromaGreenRatio: centerChromaGreen / centerPixelCount,
    centerNaturalGreenRatio: centerNaturalGreen / centerPixelCount,
    centerLesionRatio: centerLesion / centerPixelCount,
    centerFruitRatio: centerFruit / centerPixelCount,
    centerNeutralRatio: centerNeutral / centerPixelCount,
    centerTanRatio: centerTan / centerPixelCount,
    contrast: Math.sqrt(Math.max(variance, 0)) * 255,
  };

  if (shouldRejectNonCropForeground(features, crop)) {
    throw new Error(INVALID_CROP_IMAGE_MESSAGE);
  }

  const filenameContext = inferContextFromFilename(file.name, crop);
  const analysisCrop = crop || filenameContext.crop || inferOfflineCrop(features, file.name);
  const key = filenameContext.key || pickOfflineDiseaseKey(analysisCrop, features);
  const guide = offlineDiseaseGuide[key] || offlineDiseaseGuide.healthy;
  const confidence = filenameContext.confidence || (key === 'healthy' ? (analysisCrop ? 0.76 : 0.68) : computeOfflineConfidence(features, analysisCrop));
  const cropLabel = cropDisplayName(analysisCrop);
  return {
    id: Date.now(),
    user_id: 0,
    farm_id: null,
    crop_id: null,
    crop_type: cropLabel,
    crop_label: cropLabel,
    disease_name: guide.disease_name,
    confidence,
    cause: guide.cause,
    treatment: guide.treatment,
    status: 'offline',
    image_path: 'offline-browser-analysis',
    analysis_mode: filenameContext.key ? 'filename-guided browser analysis' : crop ? 'offline browser analysis' : analysisCrop ? 'offline browser crop-inferred analysis' : 'offline browser visual analysis',
    reference_url: null,
    reference_title: null,
    created_at: new Date().toISOString(),
  };
}

function ResultPanel({ result, previewUrl, t }) {
  const confidence = result ? Math.round(result.confidence * 100) : 0;
  const cropLabel = result ? resolveCropLabel(result) : '--';
  const cropVerified = Boolean(result?.crop_label || result?.crop_type || inferCropLabel(result)) && cropLabel !== 'General crop leaf';

  return (
    <section className="surface overflow-hidden rounded-lg">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-3 py-2 text-sm font-bold text-leaf-700 sm:px-4">
              <FlaskConical className="h-4 w-4" />
              {t('analysisReady')}
            </span>
            {cropLabel !== '--' && (
              <span className="rounded-full bg-stone-100 px-3 py-2 text-sm font-bold text-stone-700 sm:px-4">
                {cropLabel}
              </span>
            )}
          </div>

          <h2 className="mt-5 break-words text-2xl font-bold text-stone-950 sm:text-3xl">
            {result?.disease_name || t('readyForDiseaseAnalysis')}
          </h2>
          {!result ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 sm:text-base">
              {t('diseaseAnalysisPrompt')}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('detectedCrop')}</p>
              <p className="mt-2 text-lg font-bold text-stone-950">{cropLabel}</p>
              <p className="mt-1 text-sm text-stone-500">
                {cropVerified ? 'Estimated from the uploaded crop image' : 'Analyzed as a general crop leaf from visible disease or pest patterns'}
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
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  {isLocalVisualAnalysisMode(result.analysis_mode)
                    ? 'Local visual analysis used image features plus the selected or estimated crop. Confirm severe cases with a local agriculture officer.'
                    : t('modelBasisBody')}
                </p>
                {result.reference_url && (
                  <a className="mt-3 inline-flex text-sm font-bold text-sky-700 hover:text-sky-900" href={result.reference_url} rel="noreferrer" target="_blank">
                    {result.reference_title || 'Open crop disease reference'}
                  </a>
                )}
              </article>
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 bg-stone-50 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('uploadCropImage')}</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {previewUrl ? (
              <img src={previewUrl} alt="Crop preview" className="h-52 w-full object-cover sm:h-64" />
            ) : (
              <div className="relative h-52 overflow-hidden bg-stone-100 sm:h-64">
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
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [showImageSourcePicker, setShowImageSourcePicker] = useState(false);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCrop, setSelectedCrop] = useState('');
  const [detectorConnection, setDetectorConnection] = useState(() => ({
    browserOnline: window.navigator.onLine,
    backendOnline: null,
    checking: false,
  }));

  const canSubmit = Boolean(imageFile);
  const detectorMode = !detectorConnection.browserOnline
    ? 'offline'
    : detectorConnection.backendOnline === false
      ? 'offline'
      : detectorConnection.backendOnline === true
        ? 'online'
        : 'checking';

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]'));
    } catch {
      setHistory([]);
    }
  }, []);

  async function detectOnlineMode() {
    const browserOnline = window.navigator.onLine;
    if (!browserOnline) {
      setDetectorConnection({ browserOnline: false, backendOnline: false, checking: false });
      return false;
    }

    setDetectorConnection((current) => ({ ...current, browserOnline: true, checking: true }));
    const backendOnline = await checkBackendHealth();
    setDetectorConnection({ browserOnline: true, backendOnline, checking: false });
    return backendOnline;
  }

  useEffect(() => {
    let active = true;

    async function refreshMode() {
      const browserOnline = window.navigator.onLine;
      if (!browserOnline) {
        if (active) {
          setDetectorConnection({ browserOnline: false, backendOnline: false, checking: false });
        }
        return;
      }

      if (active) {
        setDetectorConnection((current) => ({ ...current, browserOnline: true, checking: true }));
      }
      const backendOnline = await checkBackendHealth();
      if (active) {
        setDetectorConnection({ browserOnline: true, backendOnline, checking: false });
      }
    }

    function handleOnline() {
      void refreshMode();
    }

    function handleOffline() {
      setDetectorConnection({ browserOnline: false, backendOnline: false, checking: false });
    }

    void refreshMode();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
    if (nextFile.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(`Image exceeds the ${MAX_IMAGE_UPLOAD_MB} MB upload limit.`);
      setResult(null);
      clearImage();
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

  function handleFileInputChange(event) {
    updateImage(event.target.files?.[0]);
    event.target.value = '';
  }

  function chooseImageSource(source) {
    setShowImageSourcePicker(false);
    if (source === 'camera') {
      cameraInputRef.current?.click();
      return;
    }
    galleryInputRef.current?.click();
  }

  function clearImage() {
    setImageFile(null);
    setFileInputKey((current) => current + 1);
    setShowImageSourcePicker(false);
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
    setResult(null);

    let preflightOfflineResult;
    try {
      preflightOfflineResult = await analyzeImageOffline(imageFile, selectedCrop);
    } catch (validationError) {
      setResult(null);
      setError(validationError?.message || INVALID_CROP_IMAGE_MESSAGE);
      setLoading(false);
      return;
    }

    const payload = new FormData();
    payload.append('image', imageFile);
    payload.append('crop_type', selectedCrop);

    try {
      const backendReady = await detectOnlineMode();
      const useOfflineAnalysis = !window.navigator.onLine || !backendReady;
      payload.append('offline_mode', useOfflineAnalysis ? 'true' : 'false');

      if (useOfflineAnalysis) {
        const nextResult = {
          ...preflightOfflineResult,
          local_id: makeHistoryId(),
          image_name: imageFile.name,
        };
        setResult(nextResult);
        saveHistory(nextResult);
        return;
      }

      const response = await api.post('/scans', payload, {
        timeout: 120000,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const nextResult = {
        ...response.data,
        local_id: makeHistoryId(),
        created_at: new Date().toISOString(),
        crop_type: response.data.crop_type || selectedCrop,
        crop_label: response.data.crop_label || selectedCrop || inferCropLabel(response.data),
        image_name: imageFile.name,
      };

      setResult(nextResult);
      saveHistory(nextResult);
    } catch (requestError) {
      const apiMessage = getApiErrorMessage(requestError, '');
      const invalidCropImage =
        requestError?.response?.status === 400 &&
        /crop|leaf|plant|animal|vehicle|object/i.test(apiMessage || '');
      if (invalidCropImage) {
        setResult(null);
        setError(apiMessage || INVALID_CROP_IMAGE_MESSAGE);
        return;
      }
      if (!shouldUseBrowserFallback(requestError)) {
        setError(scanRequestErrorMessage(requestError));
        return;
      }

      try {
        const offlineResult = await analyzeImageOffline(imageFile, selectedCrop);
        const nextResult = {
          ...offlineResult,
          local_id: makeHistoryId(),
          image_name: imageFile.name,
          analysis_mode: 'offline browser fallback',
        };
        setResult(nextResult);
        saveHistory(nextResult);
        setError(scanRequestErrorMessage(requestError, 'Network or ML service was unavailable, so AgriScan used browser visual analysis.'));
      } catch (offlineError) {
        setResult(null);
        setError(offlineError?.message || getApiErrorMessage(requestError, 'Disease detection failed.'));
      }
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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Image diagnosis</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-normal text-stone-950 sm:text-3xl">
            {t('plantDiseaseDetector')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Upload a crop image and review the model diagnosis, confidence, and treatment guidance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="status-pill border border-stone-200 bg-white text-stone-700">{quickCropOptions.length} crops</span>
          <span className={`status-pill ${detectorMode === 'online' ? 'bg-leaf-50 text-leaf-800' : detectorMode === 'offline' ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-700'}`}>
            {detectorMode === 'online' ? 'ML online' : detectorMode === 'offline' ? 'Device mode' : 'Checking'}
          </span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] xl:gap-6">
        <form onSubmit={submit} className="surface rounded-lg p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-950">{t('uploadCropImage')}</h2>
              <p className="mt-1 text-sm text-stone-500">Upload a clear crop image.</p>
            </div>
            <button className="btn-icon" type="button" onClick={resetForm} title={t('resetForm')}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-stone-700">Crop type</span>
              <select className="field mt-2 h-12" value={selectedCrop} onChange={(event) => setSelectedCrop(event.target.value)}>
                <option value="">Auto detect crop</option>
                {quickCropOptions.map((crop) => (
                  <option key={crop} value={crop}>{crop}</option>
                ))}
              </select>
            </label>

            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <input
                accept="image/*"
                className="hidden"
                key={`gallery-${fileInputKey}`}
                ref={galleryInputRef}
                type="file"
                onChange={handleFileInputChange}
              />
              <input
                accept="image/*"
                capture="environment"
                className="hidden"
                key={`camera-${fileInputKey}`}
                ref={cameraInputRef}
                type="file"
                onChange={handleFileInputChange}
              />
              <button
                className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white px-5 py-8 text-center transition hover:border-leaf-300 hover:bg-leaf-50 focus:outline-none focus:ring-2 focus:ring-leaf-500 focus:ring-offset-2"
                type="button"
                onClick={() => setShowImageSourcePicker(true)}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Crop preview" className="h-48 w-full rounded-lg object-cover sm:h-56" />
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-leaf-600" />
                    <p className="mt-4 text-base font-bold text-stone-900">{t('takeOrUploadPhoto')}</p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">
                      Take a clear crop or leaf photo with one main subject and natural light when possible.
                    </p>
                  </>
                )}
              </button>

              {showImageSourcePicker && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" role="dialog" aria-label="Choose image source">
                  <button
                    className="flex min-h-20 items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left transition hover:border-leaf-300 hover:bg-leaf-50 focus:outline-none focus:ring-2 focus:ring-leaf-500 focus:ring-offset-2"
                    type="button"
                    onClick={() => chooseImageSource('gallery')}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-leaf-50 text-leaf-700">
                      <ImagePlus className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-stone-950">Upload from gallery</span>
                      <span className="mt-1 block text-xs font-medium text-stone-500">Choose an existing photo</span>
                    </span>
                  </button>
                  <button
                    className="flex min-h-20 items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left transition hover:border-leaf-300 hover:bg-leaf-50 focus:outline-none focus:ring-2 focus:ring-leaf-500 focus:ring-offset-2"
                    type="button"
                    onClick={() => chooseImageSource('camera')}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
                      <Camera className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-stone-950">Use camera</span>
                      <span className="mt-1 block text-xs font-medium text-stone-500">Take a new photo</span>
                    </span>
                  </button>
                </div>
              )}

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

          <HistoryList history={history} onSelect={handleHistorySelect} t={t} />
        </div>
      </div>
    </div>
  );
}
