import {
  Camera,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardList,
  Flag,
  FlaskConical,
  ImagePlus,
  Loader2,
  RotateCcw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, getApiBaseUrl } from '../api/client.js';
import { diseaseDetectorImage } from '../assets/visuals/index.js';
import TranslatedText from '../components/shared/TranslatedText.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';

const HISTORY_STORAGE_KEY = 'agriscan_disease_scans';
const MAX_IMAGE_UPLOAD_MB = 10;
const MAX_IMAGE_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_MB * 1024 * 1024;
const TRANSPORT_IMAGE_TARGET_BYTES = 900 * 1024;
const TRANSPORT_IMAGE_MAX_DIMENSION = 1600;
const CUSTOM_CROP_OPTION = '__other_crop__';
const INVALID_CROP_IMAGE_MESSAGE =
  'Upload a clear close-up crop leaf, fruit, stem, or plant-part photo with the crop as the main subject. Grass or leaves in the background are not enough for diagnosis.';
class CropTypeMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CropTypeMismatchError';
  }
}

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
  { key: 'pechay', name: 'Pechay', aliases: ['bok choy', 'bokchoi', 'pak choi', 'pakchoy'] },
  { key: 'gabi_taro', name: 'Gabi / Taro', aliases: ['gabi', 'taro', 'gabi taro'] },
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
const unsupportedCropAliasEntries = [
  ['lettuce', 'Lettuce'],
  ['mustard', 'Mustard'],
  ['mustasa', 'Mustard'],
  ['okra', 'Okra'],
  ['lady finger', 'Okra'],
  ['ladyfinger', 'Okra'],
  ['jute', 'Jute'],
  ['saluyot', 'Jute'],
  ['kangkong', 'Water Spinach'],
  ['water spinach', 'Water Spinach'],
  ['spinach', 'Spinach'],
  ['squash', 'Squash'],
  ['kalabasa', 'Squash'],
  ['cucumber', 'Cucumber'],
  ['pipino', 'Cucumber'],
  ['watermelon', 'Watermelon'],
  ['melon', 'Melon'],
  ['papaya', 'Papaya'],
  ['langka', 'Jackfruit'],
  ['jackfruit', 'Jackfruit'],
  ['durian', 'Durian'],
  ['rambutan', 'Rambutan'],
  ['lanzones', 'Lanzones'],
  ['chayote', 'Chayote'],
  ['sayote', 'Chayote'],
  ['sitaw', 'Yardlong Bean'],
  ['yardlong bean', 'Yardlong Bean'],
  ['string bean', 'String Bean'],
  ['soybean', 'Soybean'],
  ['peanut', 'Peanut'],
  ['mani', 'Peanut'],
  ['singkamas', 'Singkamas / Jicama'],
  ['jicama', 'Singkamas / Jicama'],
  ['yam bean', 'Singkamas / Jicama'],
  ['mexican turnip', 'Singkamas / Jicama'],
  ['black pepper', 'Black Pepper'],
  ['peppercorn', 'Black Pepper'],
  ['peppercorns', 'Black Pepper'],
  ['pepper corns', 'Black Pepper'],
  ['paminta', 'Black Pepper'],
  ['sesame', 'Sesame'],
  ['sunflower', 'Sunflower'],
  ['strawberry', 'Strawberry'],
  ['grape', 'Grape'],
  ['orange', 'Orange'],
  ['lemon', 'Lemon'],
  ['lime', 'Lime'],
  ['orchid', 'Orchid'],
  ['rose', 'Rose'],
].sort((first, second) => second[0].length - first[0].length);
const unsupportedCropNameGuards = ['black pepper', 'peppercorn', 'peppercorns', 'pepper corns', 'paminta'];

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

function getBackendRootUrl() {
  const apiBaseUrl = getApiBaseUrl();
  try {
    const url = new URL(apiBaseUrl, window.location.origin);
    return url.origin;
  } catch {
    return window.location.origin;
  }
}

function imageNameFromPath(path) {
  return (path || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
}

function getScanImageUrl(scan) {
  const rawPath = scan?.image_url || scan?.image_path || '';
  if (!rawPath || rawPath === 'manual-entry' || rawPath === 'offline-browser-analysis') return '';
  if (/^(blob:|data:|https?:\/\/)/i.test(rawPath)) return rawPath;

  let normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\.?\//, '');
  const uploadsIndex = normalizedPath.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) {
    normalizedPath = normalizedPath.slice(uploadsIndex + 1);
  }
  normalizedPath = normalizedPath.replace(/^\/+/, '');
  if (!normalizedPath.startsWith('uploads/')) return '';

  return `${getBackendRootUrl().replace(/\/$/, '')}/${encodeURI(normalizedPath)}`;
}

function historyKey(scan) {
  if (scan?.id) return `scan-${scan.id}`;
  return scan?.local_id || `${scan?.image_name || scan?.image_path || 'scan'}-${scan?.created_at || ''}`;
}

function normalizeFilenameUnsupportedScan(scan) {
  const imageName = scan?.image_name || imageNameFromPath(scan?.image_path);
  const filenameLabel = unsupportedCropLabelFromFilename(imageName);
  if (!filenameLabel) return scan;

  const cropText = `${scan?.crop_label || ''} ${scan?.crop_type || ''}`.toLowerCase();
  const alreadyLabeled = cropText.includes(filenameLabel.toLowerCase());
  const wrongSupportedCrop = /\b(banana|corn|rice|tomato|mango|guava|pepper|potato)\b/.test(cropText);
  if (alreadyLabeled && !wrongSupportedCrop) return scan;

  const cropPartHint = /singkamas|jicama|yam bean|mexican turnip/i.test(filenameLabel)
    ? 'singkamas root, leaf, or stem'
    : 'affected leaf, fruit, stem, or plant part';

  return {
    ...scan,
    crop_type: `Possible ${filenameLabel}`,
    crop_label: `Possible ${filenameLabel}`,
    disease_name: 'Crop scan needs review',
    confidence: Math.min(Number(scan?.confidence) || 0.58, 0.62),
    cause: `AgriScan recognized ${filenameLabel} from the file name, but this crop is not in the trained crop list. The previous crop-specific result should be reviewed instead of treated as banana, corn, rice, or another listed crop.`,
    treatment: `Retake a close photo of the ${cropPartHint}, compare it with an online crop reference, and confirm with a local agriculture officer before applying any treatment.`,
    analysis_mode: 'filename unsupported crop review',
    reference_url: onlineReferenceSearchUrl('healthy', filenameLabel),
    reference_title: 'Search online crop disease reference',
  };
}

function normalizeHistoryScan(scan) {
  return normalizeFilenameUnsupportedScan({
    ...scan,
    local_id: scan.local_id || (scan.id ? `scan-${scan.id}` : makeHistoryId()),
    image_name: scan.image_name || imageNameFromPath(scan.image_path),
    crop_label: scan.crop_label || scan.crop_type || inferCropLabel(scan),
  });
}

function mergeHistory(serverHistory, localHistory) {
  const seen = new Set();
  return [...serverHistory, ...localHistory]
    .map(normalizeHistoryScan)
    .filter((scan) => {
      const key = historyKey(scan);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
    .slice(0, 12);
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
  if (text.includes('banana') || text.includes('saging')) return 'Banana';
  if (text.includes('tomato') || text.includes('kamatis')) return 'Tomato';
  return null;
}

function resolveCropLabel(scan) {
  return scan?.crop_label || scan?.crop_type || inferCropLabel(scan) || 'General crop leaf';
}

function translateCropLabel(label, t) {
  if (label === 'General crop leaf') return t('generalCropLeaf');
  return label;
}

function translateDiseaseName(name, t) {
  const key = String(name || '').trim().toLowerCase();
  const labels = {
    'healthy crop': 'healthyCrop',
    'leaf spot or blight symptoms': 'leafSpotOrBlightSymptoms',
    'pest-related leaf damage': 'pestRelatedLeafDamage',
    'pest or physical leaf damage': 'pestOrPhysicalLeafDamage',
    'crop scan needs review': 'cropScanNeedsReview',
    'possible healthy crop': 'possibleHealthyCrop',
    'possible leaf spot or blight symptoms': 'possibleLeafSpotOrBlightSymptoms',
    'possible pest-related leaf damage': 'possiblePestRelatedLeafDamage',
    'not a crop image': 'notCropImage',
    'invalid crop or leaf image': 'invalidCropOrLeafImage',
  };
  return labels[key] ? t(labels[key]) : name;
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
  corn_stalk_rot: {
    disease_name: 'Corn stalk rot symptoms',
    cause: 'The image shows browning, decay, or lesions on corn stalk tissue instead of a leaf-only disease pattern.',
    treatment: 'Remove heavily affected stalks after harvest, improve field drainage and residue management, avoid plant stress where practical, and confirm the stalk rot cause with a local agriculture officer.',
  },
  corn_ear_pest_damage: {
    disease_name: 'Corn earworm or borer damage',
    cause: 'The photo shows damaged corn kernels or husk tissue, which is more consistent with ear-feeding pest damage than a banana fruit disease.',
    treatment: 'Inspect nearby ears for larvae and frass, remove badly damaged ears, improve field sanitation, and follow local corn IPM thresholds before using any pesticide.',
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
  mango_phoma_blight: {
    disease_name: 'Mango Phoma blight',
    cause: 'The mango leaf shows broad brown to black blighted tissue with yellowing or scorched margins, which can match Phoma-type leaf blight.',
    treatment: 'Prune and destroy infected leaves or twigs, improve canopy airflow, avoid overhead watering, and confirm local fungicide guidance before spraying.',
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
  review_needed: {
    disease_name: 'Crop scan needs review',
    cause: 'AgriScan could not safely match this image to one specific crop disease from the visible patterns.',
    treatment: 'Retake a close, well-lit photo of one affected leaf or fruit, select the crop type, and confirm with a local agriculture officer before treatment.',
  },
};
const correctionConditionsByCrop = {
  rice: [
    'Healthy crop',
    'Rice bacterial leaf blight',
    'Rice blast',
    'Rice brown spot',
    'Rice tungro virus',
    'Rice hispa damage',
    'Rice leaf folder damage',
    'Rice brown plant hopper damage',
    'Rice sheath blight',
  ],
  corn: [
    'Healthy crop',
    'Corn common rust',
    'Corn gray leaf spot',
    'Corn northern leaf blight',
    'Corn stalk rot symptoms',
    'Corn earworm or borer damage',
    'Corn leaf spot or blight symptoms',
  ],
  coconut: [
    'Healthy crop',
    'Coconut leaf blight',
    'Coconut bud rot',
    'Coconut root wilt',
    'Coconut rhinoceros beetle damage',
    'Coconut scale insect damage',
    'Coconut lethal yellowing',
  ],
  banana: [
    'Healthy crop',
    'Banana black Sigatoka',
    'Banana yellow Sigatoka',
    'Banana Panama disease',
    'Banana Moko disease',
    'Banana bract mosaic virus',
    'Banana insect pest damage',
    'Banana fruit rot symptoms',
    'Banana crown or bunch rot symptoms',
  ],
  sugarcane: [
    'Healthy crop',
    'Sugarcane red rot',
    'Sugarcane smut',
    'Sugarcane rust',
    'Sugarcane mosaic virus',
    'Sugarcane leaf scald',
    'Sugarcane borer damage',
  ],
  cassava: [
    'Healthy crop',
    'Cassava mosaic disease',
    'Cassava bacterial blight',
    'Cassava brown streak disease',
    'Cassava anthracnose',
    'Cassava mealybug damage',
  ],
  sweet_potato: [
    'Healthy crop',
    'Sweet Potato scab',
    'Sweet Potato feathery mottle virus',
    'Sweet Potato weevil damage',
    'Sweet Potato stem rot',
    'Sweet Potato leaf spot or blight symptoms',
  ],
  tomato: [
    'Healthy crop',
    'Tomato bacterial spot',
    'Tomato early blight',
    'Tomato late blight',
    'Tomato leaf mold',
    'Tomato Septoria leaf spot',
    'Tomato target spot',
    'Tomato yellow leaf curl virus',
    'Tomato mosaic virus',
    'Tomato spider mite damage',
  ],
  eggplant: [
    'Healthy crop',
    'Eggplant bacterial wilt',
    'Eggplant Phomopsis blight',
    'Eggplant Cercospora leaf spot',
    'Eggplant flea beetle damage',
    'Eggplant fruit and shoot borer damage',
    'Eggplant powdery mildew',
  ],
  mung_bean: [
    'Healthy crop',
    'Mung Bean yellow mosaic virus',
    'Mung Bean powdery mildew',
    'Mung Bean Cercospora leaf spot',
    'Mung Bean anthracnose',
    'Mung Bean bacterial spot',
  ],
  mango: [
    'Healthy crop',
    'Mango anthracnose',
    'Mango bacterial canker',
    'Mango cutting weevil damage',
    'Mango Phoma blight',
    'Mango die-back',
    'Mango gall midge damage',
    'Mango powdery mildew',
    'Mango sooty mould',
  ],
  pineapple: [
    'Healthy crop',
    'Pineapple heart rot',
    'Pineapple mealybug wilt',
    'Pineapple leaf spot or blight symptoms',
    'Pineapple fruit rot symptoms',
    'Pineapple root rot',
  ],
  calamansi: [
    'Healthy crop',
    'Calamansi citrus canker',
    'Calamansi citrus greening',
    'Calamansi scab',
    'Calamansi melanose',
    'Calamansi sooty mould',
    'Calamansi leaf miner damage',
  ],
  onion: [
    'Healthy crop',
    'Onion purple blotch',
    'Onion downy mildew',
    'Onion basal rot',
    'Onion twister disease',
    'Onion thrips damage',
  ],
  cabbage: [
    'Healthy crop',
    'Cabbage black rot',
    'Cabbage clubroot',
    'Cabbage downy mildew',
    'Cabbage Alternaria leaf spot',
    'Cabbage diamondback moth damage',
  ],
  pechay: [
    'Healthy crop',
    'Pechay downy mildew',
    'Pechay bacterial soft rot',
    'Pechay leaf spot or blight symptoms',
    'Pechay diamondback moth damage',
    'Pechay aphid damage',
  ],
  gabi_taro: [
    'Healthy crop',
    'Gabi / Taro leaf blight',
    'Gabi / Taro corm rot',
    'Gabi / Taro mosaic virus',
    'Gabi / Taro leaf spot or blight symptoms',
    'Gabi / Taro pest damage',
  ],
  bitter_gourd: [
    'Healthy crop',
    'Bitter Gourd powdery mildew',
    'Bitter Gourd downy mildew',
    'Bitter Gourd anthracnose',
    'Bitter Gourd mosaic virus',
    'Bitter Gourd fruit fly damage',
  ],
  pepper: [
    'Healthy crop',
    'Pepper bacterial spot',
    'Pepper anthracnose',
    'Pepper mosaic virus',
    'Pepper powdery mildew',
  ],
  potato: [
    'Healthy crop',
    'Potato early blight',
    'Potato late blight',
    'Potato bacterial wilt',
    'Potato black scurf',
    'Potato mosaic virus',
  ],
  guava: [
    'Healthy crop',
    'Guava phytophthora disease',
    'Guava red rust',
    'Guava scab',
    'Guava anthracnose',
    'Guava styler and root disorder',
  ],
  cacao: [
    'Healthy crop',
    'Cacao black pod rot',
    'Cacao frosty pod rot',
    'Cacao vascular streak dieback',
    'Cacao pod borer damage',
    'Cacao cherelle wilt',
  ],
  coffee: [
    'Healthy crop',
    'Coffee leaf rust',
    'Coffee berry disease',
    'Coffee brown eye spot',
    'Coffee berry borer damage',
    'Coffee anthracnose',
  ],
  abaca: [
    'Healthy crop',
    'Abaca bunchy top virus',
    'Abaca mosaic virus',
    'Abaca fusarium wilt',
    'Abaca bacterial wilt',
    'Abaca leaf spot or blight symptoms',
  ],
};

function getCorrectionConditionOptions(cropLabel) {
  const cropKey = normalizeCropKey(cropLabel);
  const options = correctionConditionsByCrop[cropKey];
  const cropOptions = options?.length ? options : ['Healthy crop', 'Leaf spot or blight symptoms', 'Pest or physical leaf damage'];
  return ['Not a crop image', ...cropOptions];
}

function normalizeCrop(value) {
  return (value || '').trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCropKey(value) {
  const normalized = normalizeCrop(value).replace(/[_-]+/g, ' ');
  if (!normalized) return '';
  if (unsupportedCropNameGuards.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`).test(normalized))) {
    return normalized.replace(/\s+/g, '_');
  }
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
  return text.includes('offline') || text.includes('fallback') || text.includes('browser') || text.includes('crop-part') || text.includes('filename-guided') || text.includes('review');
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

function freeformUnsupportedCropLabel(cropType) {
  const cropKey = normalizeCropKey(cropType);
  if (!cropType || cropDisplayNamesByKey[cropKey]) return '';
  const text = normalizeContextText(cropType);
  if (!text || ['auto detect', 'auto detect crop', 'select crop', 'unknown'].includes(text)) return '';
  const tokens = new Set(text.split(/\s+/));
  if (nonCropFilenameTerms.some((term) => tokens.has(term))) return '';
  for (const [alias, label] of unsupportedCropAliasEntries) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(text)) return label;
  }
  const words = text.split(/\s+/).filter((word) => !['crop', 'plant', 'leaf'].includes(word));
  return words.length ? words.slice(0, 4).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '';
}

function unsupportedCropLabelFromFilename(fileName) {
  const text = normalizeContextText(fileName);
  if (!text) return '';
  for (const [alias, label] of unsupportedCropAliasEntries) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(text)) return label;
  }
  return '';
}

function possibleCropGroupLabel(features) {
  const hasLeafOrPlantSubject =
    hasCropSubjectInForeground(features, '') ||
    (features.greenLeafRatio >= 0.16 && (features.maxGreenAreaRatio >= 0.08 || features.lesionRatio >= 0.035));
  if (!hasLeafOrPlantSubject) return '';
  if (features.bananaFruitRatio >= 0.12 || features.maxFruitAreaRatio >= 0.1) return 'Unlisted fruit crop';
  if (
    features.maxGreenAspect >= 2.3 ||
    (features.greenComponentCount >= 3 && features.maxGreenAspect >= 1.9 && features.maxGreenAreaRatio < 0.22)
  ) {
    return 'Unlisted grass-like crop';
  }
  if (features.greenLeafRatio >= 0.22 || features.maxGreenAreaRatio >= 0.12) return 'Unlisted leafy crop';
  return 'Unlisted crop';
}

function possibleUnsupportedCropLabel(features, { fileName = '', cropType = '', supportedInference = '' } = {}) {
  const selectedCropKey = normalizeCropKey(cropType);
  const filenameLabel = unsupportedCropLabelFromFilename(fileName);
  if (filenameLabel) {
    if (
      selectedCropKey &&
      supportedInference === selectedCropKey &&
      isReliableVisualCropInference(features, supportedInference)
    ) {
      return '';
    }
    return filenameLabel;
  }
  if (cropDisplayNamesByKey[selectedCropKey]) return '';

  const freeformLabel = freeformUnsupportedCropLabel(cropType);
  if (freeformLabel) {
    if (supportedInference && isReliableVisualCropInference(features, supportedInference)) return '';
    return freeformLabel;
  }

  const filenameContext = inferContextFromFilename(fileName, cropType);
  if (cropDisplayNamesByKey[filenameContext.crop]) return '';
  if (supportedInference && isReliableVisualCropInference(features, supportedInference)) return '';
  return possibleCropGroupLabel(features);
}

function onlineReferenceSearchUrl(referenceKey, cropLabel) {
  const query =
    referenceKey === 'healthy'
      ? `${cropLabel} healthy plant leaf disease diagnosis extension`
      : referenceKey === 'pest_leaf_damage'
        ? `${cropLabel} leaf chewing holes insect damage integrated pest management extension`
        : `${cropLabel} leaf spot blight symptoms disease management extension`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function buildPossibleUnsupportedResult(features, cropLabel) {
  const key = pickOfflineDiseaseKey('', features);
  const strongDiseaseSignal = hasStrongVisualDiseaseSignal(features, '');
  const classKey = key || 'review_needed';
  const possibleCropLabel = cropLabel.startsWith('Possible ') ? cropLabel : `Possible ${cropLabel}`;
  let diseaseName = 'Possible healthy crop';
  let cause = `AgriScan does not have ${cropLabel} in the trained crop list. The visible plant tissue does not show strong disease markers, so it may be healthy.`;
  let treatment = 'Keep monitoring new leaves or fruit, compare with a trusted crop guide, and retake a close photo if spots, yellowing, wilting, or rot appears.';
  let referenceKey = 'healthy';
  let confidence = classKey === 'review_needed' ? 0.58 : Math.min(Math.max(computeOfflineConfidence(features, ''), 0.54), 0.72);

  if (!['healthy', 'review_needed'].includes(classKey) && !classKey.endsWith('_healthy') && strongDiseaseSignal) {
    if (classKey === 'pest_leaf_damage') {
      diseaseName = 'Possible pest-related leaf damage';
      cause = `AgriScan does not have ${cropLabel} in the trained crop list. The visible subject shows chewing, edge damage, holes, or discoloration that can match pest or physical damage.`;
      treatment = 'Inspect both sides of nearby leaves for insects or larvae, remove badly damaged tissue when practical, and confirm the crop and pest before using pesticide.';
      referenceKey = 'pest_leaf_damage';
      confidence = Math.min(Math.max(computeOfflineConfidence(features, ''), 0.58), 0.76);
    } else {
      diseaseName = 'Possible leaf spot or blight symptoms';
      cause = `AgriScan does not have ${cropLabel} in the trained crop list. Visible spots, blighting, rust, or necrotic tissue suggest a possible crop disease.`;
      treatment = 'Remove heavily affected tissue, improve airflow, avoid wetting foliage, and use the linked crop reference or a local agriculture officer to confirm the exact crop disease before treatment.';
      referenceKey = 'leaf_spot_or_blight';
      confidence = Math.min(Math.max(computeOfflineConfidence(features, ''), 0.58), 0.78);
    }
  }

  return {
    id: Date.now(),
    user_id: 0,
    farm_id: null,
    crop_id: null,
    crop_type: possibleCropLabel,
    crop_label: possibleCropLabel,
    disease_name: diseaseName,
    confidence,
    cause,
    treatment,
    status: 'offline',
    image_path: 'offline-browser-analysis',
    analysis_mode: 'unsupported crop browser analysis',
    reference_url: onlineReferenceSearchUrl(referenceKey, cropLabel),
    reference_title: 'Search online crop disease reference',
    created_at: new Date().toISOString(),
  };
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
  if (crop === 'mango' && (text.includes('phoma') || text.includes('blight'))) return { crop: 'mango', key: 'mango_phoma_blight', confidence: text.includes('phoma') ? 0.88 : 0.82 };
  if (crop === 'mango' && text.includes('anthracnose')) return { crop: 'mango', key: 'mango_anthracnose', confidence: 0.86 };
  if (crop === 'mango' && (text.includes('canker') || text.includes('black spot'))) return { crop: 'mango', key: 'mango_bacterial_canker', confidence: 0.82 };
  if (text.includes('northern leaf blight') || (crop === 'corn' && text.includes('blight'))) return { crop: 'corn', key: 'corn_northern_leaf_blight', confidence: 0.84 };
  if (text.includes('stalk rot') || (text.includes('stalk') && text.includes('rot'))) return { crop: crop || 'corn', key: 'corn_stalk_rot', confidence: 0.84 };
  if (text.includes('sigatoka')) return { crop: 'banana', key: text.includes('black') ? 'banana_black_sigatoka' : 'banana_yellow_sigatoka', confidence: 0.84 };
  if (crop === 'banana' && /\b(bunch|crown|closeup|close up)\b/.test(text)) return { crop: 'banana', key: 'banana_crown_rot', confidence: 0.83 };
  if (crop === 'banana' && /\b(fruit|rot|anthracnose|black|disease|spot)\b/.test(text)) return { crop: 'banana', key: 'banana_fruit_rot', confidence: 0.82 };

  return { crop, key: '', confidence: 0 };
}

function looksLikeBananaFruitIssue(features, crop) {
  if (looksLikeCornEarIssue(features, crop)) return false;
  if (crop && crop !== 'banana') return false;
  if (looksLikeHealthyRicePanicle(features)) return false;
  if (!crop && features.greenLeafRatio >= 0.45 && features.maxGreenAreaRatio >= 0.28) return false;
  const fruitSignal =
    features.bananaFruitRatio >= 0.1 ||
    features.maxFruitAreaRatio >= 0.08 ||
    (features.yellowRatio >= 0.09 && features.darkLesionRatio >= 0.035 && features.greenLeafRatio < 0.28);
  const decaySignal =
    features.darkLesionRatio >= 0.04 ||
    (features.lesionRatio >= 0.13 && features.maxAreaRatio >= 0.06 && features.rustRatio >= 0.035);
  const notLeafDominant = features.greenLeafRatio < 0.38 || features.fruitComponentCount >= 2 || features.greenComponentCount >= 8;
  return fruitSignal && decaySignal && notLeafDominant;
}

function looksLikeCornEarIssue(features, crop) {
  if (crop && crop !== 'corn' && crop !== 'banana') return false;
  const kernelSignal = features.bananaFruitRatio >= 0.22 || features.maxFruitAreaRatio >= 0.12;
  const huskSignal = features.greenLeafRatio >= 0.06 || features.greenComponentCount >= 2;
  const damageSignal = features.lesionRatio >= 0.1 || features.darkLesionRatio >= 0.045 || features.rustRatio >= 0.03;
  const cobStructure =
    features.fruitComponentCount >= 3 &&
    features.maxFruitAreaRatio >= 0.08 &&
    features.maxFruitAreaRatio < 0.34 &&
    features.centerFruitRatio >= 0.18;
  const notLeafDominant = features.greenLeafRatio < 0.42 && features.maxGreenAreaRatio < 0.28;
  const notBananaBunch = !(
    features.greenComponentCount >= 8 &&
    features.maxGreenAspect >= 3 &&
    features.maxFruitAreaRatio < 0.12
  );
  return kernelSignal && huskSignal && damageSignal && cobStructure && notLeafDominant && notBananaBunch;
}

function looksLikeHealthyRicePanicle(features) {
  const warmGrainRatio = features.bananaFruitRatio + features.yellowRatio;
  const rustSpotDisease =
    features.componentCount >= 8 &&
    features.rustRatio >= 0.025 &&
    features.lesionRatio >= 0.07;
  const largeBlightPatch =
    features.maxAreaRatio >= 0.055 &&
    features.lesionRatio >= 0.1 &&
    features.darkLesionRatio >= 0.035;
  const matureRicePanicle =
    features.bananaFruitRatio >= 0.22 &&
    features.yellowRatio >= 0.16 &&
    features.greenLeafRatio >= 0.18 &&
    features.maxGreenAspect >= 2.4 &&
    features.fruitComponentCount >= 6 &&
    features.maxFruitAreaRatio >= 0.1 &&
    features.maxFruitAreaRatio < 0.32 &&
    features.rustRatio < 0.02 &&
    features.darkLesionRatio < 0.24 &&
    features.lesionRatio < 0.38;
  if (matureRicePanicle) return true;

  const grainPanicleStructure =
    warmGrainRatio >= 0.12 &&
    features.greenLeafRatio >= 0.14 &&
    features.maxGreenAspect >= 1.65 &&
    features.fruitComponentCount >= 3 &&
    features.maxFruitAreaRatio < 0.22 &&
    features.bananaFruitRatio < 0.34 &&
    features.darkLesionRatio < 0.095 &&
    features.rustRatio < 0.035 &&
    !rustSpotDisease &&
    !largeBlightPatch;
  if (grainPanicleStructure) return true;

  const warmGrainSignal =
    (features.bananaFruitRatio >= 0.045 && features.yellowRatio >= 0.035) ||
    warmGrainRatio >= 0.11 ||
    (features.fruitComponentCount >= 4 && features.maxFruitAreaRatio < 0.08 && features.bananaFruitRatio >= 0.055);
  const grassLeafStructure =
    features.greenLeafRatio >= 0.14 &&
    (features.maxGreenAspect >= 1.45 ||
      features.greenComponentCount >= 3 ||
      (features.maxGreenAreaRatio >= 0.08 && features.greenEdgeRatio >= 0.14));
  const clusteredSmallGrainsCandidate =
    (features.fruitComponentCount >= 3 && features.maxFruitAreaRatio < 0.16) ||
      (features.fruitComponentCount >= 1 &&
        features.maxFruitAreaRatio < 0.24 &&
        features.greenComponentCount >= 4 &&
        features.maxGreenAspect >= 2) ||
      (features.greenLeafRatio >= 0.28 && features.yellowRatio >= 0.08 && features.maxGreenAspect >= 1.8);
  const riceCanopyWithGrain =
    features.greenLeafRatio >= 0.42 &&
    warmGrainRatio >= 0.045 &&
    (features.componentCount >= 3 || features.maxAspect >= 1.6) &&
    features.lesionRatio < 0.16;
  const riceGrainCanopy =
    features.greenLeafRatio >= 0.18 &&
    warmGrainRatio >= 0.055 &&
    (features.fruitComponentCount >= 2 || features.yellowRatio >= 0.05 || features.bananaFruitRatio >= 0.09) &&
    features.maxFruitAreaRatio < 0.24 &&
    features.lesionRatio < 0.18 &&
    features.darkLesionRatio < 0.13 &&
    (features.maxGreenAspect >= 1.55 ||
      features.greenComponentCount >= 3 ||
      features.yellowRatio >= 0.035 ||
      (features.greenEdgeRatio >= 0.18 && features.maxGreenAreaRatio < 0.5));
  const clusteredSmallGrains =
    (clusteredSmallGrainsCandidate || riceCanopyWithGrain || riceGrainCanopy) &&
    features.bananaFruitRatio < 0.42;
  const notRotLike =
    features.darkLesionRatio < 0.08 &&
    features.rustRatio < 0.1 &&
    !(features.lesionRatio >= 0.18 && features.maxAreaRatio >= 0.14);
  const spottedLeafDisease =
    features.componentCount >= 7 &&
    features.lesionRatio >= 0.028 &&
    features.lesionWithinPlant >= 0.045 &&
    !riceGrainCanopy;
  const bananaBunchLike =
    features.maxFruitAreaRatio >= 0.24 &&
    features.bananaFruitRatio >= 0.22 &&
    features.greenLeafRatio < 0.32;
  const chewingOrMissingTissue =
    features.adjacentNonleafRatio >= 0.18 &&
    features.greenEdgeRatio >= 0.18 &&
    features.lesionRatio < 0.055 &&
    warmGrainRatio < 0.12;
  const broadSingleLeaf =
    features.maxGreenAreaRatio >= 0.4 &&
    features.greenComponentCount <= 6 &&
    warmGrainRatio < 0.13 &&
    features.yellowRatio < 0.08;
  const mangoBlightLike =
    looksLikeMangoLeaf(features) &&
    (features.darkLesionRatio >= 0.025 || features.lesionRatio >= 0.07 || features.yellowRatio >= 0.08);
  const leafStructure = grassLeafStructure || riceCanopyWithGrain || riceGrainCanopy;
  return (
    warmGrainSignal &&
    leafStructure &&
    clusteredSmallGrains &&
    notRotLike &&
    !spottedLeafDisease &&
    !rustSpotDisease &&
    !bananaBunchLike &&
    !chewingOrMissingTissue &&
    !broadSingleLeaf &&
    !mangoBlightLike
  );
}

function looksLikeHealthyBananaBunch(features) {
  if (looksLikeHealthyRicePanicle(features)) return false;

  const cleanGreenBananaBunch =
    features.greenLeafRatio >= 0.55 &&
    features.greenComponentCount >= 4 &&
    features.maxGreenAreaRatio >= 0.35 &&
    features.maxGreenAspect >= 2 &&
    features.maxGreenAspect <= 6.8 &&
    features.bananaFruitRatio >= 0.06 &&
    features.fruitComponentCount >= 3 &&
    features.lesionRatio < 0.16 &&
    features.darkLesionRatio < 0.15 &&
    features.rustRatio < 0.015 &&
    features.maxAreaRatio < 0.04;
  if (cleanGreenBananaBunch) return true;

  const greenBananaFingerCluster =
    features.greenLeafRatio >= 0.42 &&
    features.greenComponentCount >= 4 &&
    features.maxGreenAreaRatio < 0.56 &&
    features.maxGreenAspect >= 1.2 &&
    features.maxGreenAspect <= 6.8 &&
    features.lesionRatio < 0.18 &&
    features.darkLesionRatio < 0.12 &&
    features.rustRatio < 0.08 &&
    features.maxAreaRatio < 0.13 &&
    !(features.componentCount >= 12 && features.rustRatio >= 0.025 && features.lesionRatio >= 0.07);
  const cleanFruitSurface =
    features.lesionRatio < 0.1 &&
    features.darkLesionRatio < 0.06 &&
    features.rustRatio < 0.07 &&
    features.maxAreaRatio < 0.09;
  const spottedLeafDisease =
    features.componentCount >= 7 &&
    features.darkLesionRatio >= 0.045 &&
    features.lesionWithinPlant >= 0.05 &&
    features.yellowRatio < 0.035;
  const clusteredFingers =
    features.greenComponentCount >= 5 &&
    features.maxGreenAreaRatio < 0.42 &&
    features.maxGreenAspect >= 1.25 &&
    features.maxGreenAspect <= 5.8;
  const denseGreenBunch =
    features.greenLeafRatio >= 0.5 &&
    features.maxGreenAreaRatio >= 0.32 &&
    features.maxGreenAreaRatio < 0.62 &&
    features.maxGreenAspect <= 2.4 &&
    (features.greenComponentCount >= 4 || features.fruitComponentCount >= 2) &&
    features.contrast < 68;
  const fruitToneSignal =
    features.bananaFruitRatio >= 0.025 ||
    features.yellowRatio >= 0.025 ||
    features.greenLeafRatio >= 0.55;
  const grassLeaf =
    features.maxGreenAspect >= 6 &&
    features.greenComponentCount <= 3 &&
    features.maxGreenAreaRatio < 0.28;
  return (
    fruitToneSignal &&
    (cleanFruitSurface || greenBananaFingerCluster) &&
    (clusteredFingers || denseGreenBunch || greenBananaFingerCluster) &&
    !spottedLeafDisease &&
    !grassLeaf
  );
}

function hasStrongVisualDiseaseSignal(features, crop = '') {
  if ((!crop || crop === 'rice') && looksLikeHealthyRicePanicle(features)) return false;
  if ((!crop || crop === 'banana') && looksLikeHealthyBananaBunch(features)) return false;

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
  const spottedLeaf =
    features.componentCount >= 7 &&
    features.maxAreaRatio < 0.035 &&
    features.lesionRatio >= 0.028;
  const broadLesion = features.maxAreaRatio >= 0.055 && features.lesionRatio >= 0.035;
  const yellowBlight =
    features.yellowRatio >= 0.16 &&
    features.greenLeafRatio >= 0.18 &&
    (features.lesionRatio >= 0.03 || features.edgeLesionRatio >= 0.06);

  return (
    structuralDamage ||
    highEdgeDamage ||
    spottedLeaf ||
    broadLesion ||
    yellowBlight ||
    features.lesionWithinPlant >= 0.075 ||
    features.lesionRatio >= 0.055 ||
    features.darkLesionRatio >= 0.045 ||
    features.rustRatio >= 0.035 ||
    features.edgeLesionRatio >= 0.08
  );
}

function hasForegroundLeafDiseaseSignal(features, crop = '') {
  if (!hasStrongVisualDiseaseSignal(features, crop)) return false;

  const animalLikeCenter =
    !crop &&
    features.centerTanRatio >= 0.18 &&
    features.centerNeutralRatio >= 0.1 &&
    features.centerGreenRatio < 0.45 &&
    features.greenEdgeRatio < 0.09 &&
    features.adjacentNonleafRatio < 0.07;
  if (animalLikeCenter) return false;

  const centeredSpottedLeaf =
    features.centerGreenRatio >= 0.07 &&
    features.centerLesionRatio >= 0.02 &&
    features.lesionWithinPlant >= 0.035;
  const broadSpottedLeaf =
    features.greenLeafRatio >= 0.18 &&
    features.maxGreenAreaRatio >= 0.08 &&
    features.lesionRatio >= 0.025 &&
    features.componentCount >= 3;
  const largeDiseasedLeaf =
    features.greenLeafRatio >= 0.30 &&
    features.maxGreenAreaRatio >= 0.25 &&
    features.lesionRatio >= 0.035;

  return centeredSpottedLeaf || broadSpottedLeaf || largeDiseasedLeaf;
}

function isReliableVisualCropInference(features, crop) {
  if (!crop) return false;
  if (crop === 'banana') return looksLikeHealthyBananaBunch(features) || looksLikeBananaFruitIssue(features, '');
  if (crop === 'rice') return looksLikeHealthyRicePanicle(features);
  if (crop === 'corn') return looksLikeCornEarIssue(features, '');
  if (crop === 'mango') return looksLikeMangoLeaf(features);
  if (['cabbage', 'pechay', 'gabi_taro'].includes(crop)) {
    return (
      features.greenLeafRatio >= 0.25 &&
      features.centerGreenRatio >= 0.45 &&
      features.maxGreenAreaRatio >= 0.25 &&
      features.centerTanRatio < 0.08 &&
      features.bananaFruitRatio < 0.08
    );
  }
  if (['tomato', 'pepper', 'potato', 'eggplant'].includes(crop)) {
    return (
      features.greenLeafRatio >= 0.18 &&
      features.componentCount >= 5 &&
      features.lesionRatio >= 0.025 &&
      features.bananaFruitRatio < 0.12
    );
  }
  return false;
}

function validateSelectedCropAgainstImage(features, selectedCrop) {
  const selectedCropKey = normalizeCropKey(selectedCrop);
  if (!selectedCropKey || !cropDisplayNamesByKey[selectedCropKey]) return;

  const visualCropKey = inferOfflineCrop(features, '');
  if (!visualCropKey || visualCropKey === selectedCropKey || !isReliableVisualCropInference(features, visualCropKey)) return;

  const selectedLabel = cropDisplayName(selectedCropKey);
  const visualLabel = cropDisplayName(visualCropKey);
  throw new CropTypeMismatchError(
    `Selected crop is ${selectedLabel}, but the uploaded image looks like ${visualLabel}. Choose ${visualLabel} or use Auto detect crop.`,
  );
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
  if ((!crop || crop === 'rice') && looksLikeHealthyRicePanicle(features)) {
    return 'healthy';
  }

  if ((!crop || crop === 'banana') && looksLikeHealthyBananaBunch(features)) {
    return 'healthy';
  }

  if (looksLikeCornEarIssue(features, crop)) {
    return 'corn_ear_pest_damage';
  }

  if (looksLikeBananaFruitIssue(features, crop)) {
    return features.greenComponentCount >= 8 ? 'banana_crown_rot' : 'banana_fruit_rot';
  }

  const healthyLeaf = features.greenLeafRatio >= 0.26 && features.lesionWithinPlant < 0.035 && features.lesionRatio < 0.025 && features.contrast < 72;
  const healthyLeafyVegetable =
    ['pechay', 'cabbage', 'gabi_taro'].includes(crop) &&
    features.greenLeafRatio >= 0.25 &&
    features.centerGreenRatio >= 0.45 &&
    features.lesionWithinPlant < 0.035 &&
    features.lesionRatio < 0.025 &&
    features.centerTanRatio < 0.08 &&
    (features.centerNeutralRatio < 0.12 || (crop === 'cabbage' && features.centerNeutralRatio <= 0.34)) &&
    features.contrast < 78;
  if (healthyLeaf || healthyLeafyVegetable) return offlineDiseaseGuide[healthyKeyForCrop(crop)] ? healthyKeyForCrop(crop) : 'healthy';

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

  if (!hasStrongVisualDiseaseSignal(features, crop)) return 'review_needed';

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
  if (crop === 'mango') {
    const largeBlightPatch = features.maxAreaRatio >= 0.035 || features.darkLesionRatio >= 0.055 || features.lesionRatio >= 0.12;
    const scorchedMangoLeaf = features.yellowRatio >= 0.055 && features.darkLesionRatio >= 0.025;
    if (largeBlightPatch && (scorchedMangoLeaf || features.lesionWithinPlant >= 0.11)) return 'mango_phoma_blight';
    return manySpots ? 'mango_bacterial_canker' : 'mango_anthracnose';
  }
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
  if (hasForegroundLeafDiseaseSignal(features, crop)) {
    return false;
  }
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
  const animalOnLawnSubject =
    features.greenLeafRatio >= 0.45 &&
    features.maxGreenAreaRatio >= 0.45 &&
    features.greenComponentCount <= 2 &&
    features.greenEdgeRatio < 0.1 &&
    features.adjacentNonleafRatio < 0.07 &&
    features.centerGreenRatio < 0.45 &&
    features.centerTanRatio >= 0.18 &&
    features.centerNeutralRatio >= 0.1 &&
    features.centerFruitRatio < 0.2 &&
    features.bananaFruitRatio < 0.14 &&
    features.fruitComponentCount <= 4;
  const centeredAnimalOrPerson =
    !crop &&
    features.greenLeafRatio >= 0.2 &&
    features.centerGreenRatio < 0.12 &&
    features.maxGreenAreaRatio < 0.3 &&
    features.lesionRatio < 0.04 &&
    features.bananaFruitRatio < 0.08 &&
    features.centerTanRatio >= 0.12 &&
    features.centerNeutralRatio >= 0.1 &&
    features.centerLesionRatio < 0.04;
  const flatGreenBackground =
    !crop &&
    features.greenLeafRatio >= 0.58 &&
    features.lesionRatio < 0.018 &&
    features.greenComponentCount <= 2 &&
    features.greenEdgeRatio < 0.08 &&
    features.adjacentNonleafRatio < 0.08 &&
    features.centerFruitRatio < 0.18 &&
    !hasForegroundCrop;

  return (
    syntheticGreenBackground ||
    weakOverallCropSignal ||
    backgroundOnlyGreen ||
    centeredNeutralObject ||
    centeredFurLikeObject ||
    animalOnGreenBackground ||
    animalOnLawnSubject ||
    centeredAnimalOrPerson ||
    flatGreenBackground
  );
}

function inferOfflineCrop(features, fileName = '') {
  const filenameContext = inferContextFromFilename(fileName, '');
  if (filenameContext.crop) return filenameContext.crop;
  if (features.greenLeafRatio < 0.08 && features.lesionRatio < 0.018) return '';

  if (looksLikeHealthyRicePanicle(features)) return 'rice';
  if (looksLikeHealthyBananaBunch(features)) return 'banana';

  if (looksLikeCornEarIssue(features, '')) return 'corn';

  const bananaFruitLike =
    (features.bananaFruitRatio >= 0.18 &&
      features.darkLesionRatio >= 0.04 &&
      features.lesionRatio >= 0.06 &&
      (features.greenLeafRatio < 0.55 || features.greenComponentCount >= 6 || features.maxFruitAreaRatio >= 0.18)) ||
    (features.greenComponentCount >= 8 && features.maxGreenAspect >= 2 && features.darkLesionRatio >= 0.08 && features.yellowRatio >= 0.04);
  if (bananaFruitLike) return 'banana';

  const manySmallSpots = features.componentCount >= 7 && features.maxAreaRatio < 0.012;
  const broadSpottedLeaf = features.greenLeafRatio >= 0.52 && features.componentCount >= 10 && features.maxAreaRatio < 0.055 && features.maxGreenAspect < 1.9;
  if (looksLikeMangoLeaf(features)) return 'mango';
  if (broadSpottedLeaf) return 'tomato';
  if (manySmallSpots && features.greenLeafRatio < 0.55) return 'tomato';
  if (features.greenLeafRatio < 0.18 && features.lesionRatio >= 0.05) return 'rice';

  const cabbageHeadLike =
    features.greenLeafRatio >= 0.45 &&
    features.centerGreenRatio >= 0.55 &&
    features.maxGreenAreaRatio >= 0.42 &&
    features.lesionRatio < 0.025 &&
    features.bananaFruitRatio < 0.05 &&
    features.centerTanRatio < 0.08 &&
    features.centerNeutralRatio >= 0.08 &&
    features.centerNeutralRatio <= 0.34 &&
    features.maxGreenAspect < 3.2;
  if (cabbageHeadLike) return 'cabbage';

  const denseLeafyVegetable =
    features.greenLeafRatio >= 0.25 &&
    features.centerGreenRatio >= 0.55 &&
    features.maxGreenAreaRatio >= 0.25 &&
    features.lesionRatio < 0.025 &&
    features.bananaFruitRatio < 0.05 &&
    features.centerTanRatio < 0.08 &&
    features.centerNeutralRatio < 0.08 &&
    features.maxGreenAspect < 1.8;
  if (denseLeafyVegetable) return 'pechay';

  const grassLikeLeaf = features.maxGreenAspect >= 2.3 || (features.greenComponentCount >= 3 && features.maxGreenAspect >= 1.9 && features.maxGreenAreaRatio < 0.18);

  if (grassLikeLeaf) {
    if (features.greenLeafRatio >= 0.18 || features.maxGreenAreaRatio >= 0.08) return 'corn';
    return 'rice';
  }
  if (
    features.yellowRatio >= 0.2 &&
    features.lesionRatio >= 0.08 &&
    features.greenLeafRatio >= 0.3 &&
    features.maxGreenAspect < 1.8 &&
    features.rustRatio < 0.03 &&
    features.componentCount < 12
  ) return 'banana';
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

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function jpegNameFor(file) {
  const stem = (file.name || 'crop-image').replace(/\.[^.]+$/, '');
  return `${stem}.jpg`;
}

async function prepareImageForUpload(file) {
  if (!file || file.size <= TRANSPORT_IMAGE_TARGET_BYTES) return file;

  try {
    const image = await loadImageElement(file);
    const scale = Math.min(1, TRANSPORT_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let bestBlob = null;
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (!blob) continue;
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }
      if (blob.size <= TRANSPORT_IMAGE_TARGET_BYTES) {
        return new window.File([blob], jpegNameFor(file), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
      }
    }
    if (bestBlob && bestBlob.size < file.size) {
      return new window.File([bestBlob], jpegNameFor(file), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
    }
  } catch {
    // Keep the original upload if the browser cannot create a compressed transport copy.
  }

  return file;
}

function plantSubjectMaskFromPixels(pixels, size) {
  const mask = new Uint8Array(size * size);
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    const red = pixels[offset] / 255;
    const green = pixels[offset + 1] / 255;
    const blue = pixels[offset + 2] / 255;
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel - minChannel;
    const greenLeaf = green > red * 1.05 && green > blue * 1.05 && green > 0.15 && saturation > 0.08;
    const brownOrDark =
      red > 0.2 &&
      green > 0.08 &&
      blue < 0.42 &&
      red >= green * 0.82 &&
      green > blue * 1.02 &&
      saturation > 0.07 &&
      maxChannel < 0.86;
    const yellowOrKernel =
      red > 0.36 &&
      green > 0.3 &&
      blue < 0.58 &&
      red > blue * 1.08 &&
      green > blue * 1.05 &&
      red < green * 1.65 &&
      green < red * 1.65 &&
      saturation > 0.045;
    const tanStemOrHusk =
      red > 0.34 &&
      green > 0.22 &&
      blue > 0.1 &&
      red > green * 0.92 &&
      green > blue * 1.02 &&
      saturation > 0.07 &&
      maxChannel < 0.92;
    if (greenLeaf || brownOrDark || yellowOrKernel || tanStemOrHusk) {
      mask[index] = 1;
    }
  }
  return mask;
}

function dilateMask(mask, size, iterations = 1) {
  let current = mask;
  const offsets = [-1, 1, -size, size, -size - 1, -size + 1, size - 1, size + 1];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextMask = new Uint8Array(current);
    for (let index = 0; index < current.length; index += 1) {
      if (!current[index]) continue;
      const x = index % size;
      for (const offset of offsets) {
        const next = index + offset;
        if (next < 0 || next >= current.length) continue;
        const nx = next % size;
        if (Math.abs(nx - x) > 1) continue;
        nextMask[next] = 1;
      }
    }
    current = nextMask;
  }
  return current;
}

function selectMainSubjectMask(mask, size) {
  const selected = new Uint8Array(size * size);
  const visited = new Uint8Array(size * size);
  const stack = [];
  let largest = null;
  const minArea = Math.max(18, Math.round(size * size * 0.002));
  const centerLeft = size * 0.18;
  const centerRight = size * 0.82;
  const centerTop = size * 0.18;
  const centerBottom = size * 0.82;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const pixels = [];
    let minX = size;
    let maxX = 0;
    let minY = size;
    let maxY = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop();
      pixels.push(current);
      const x = current % size;
      const y = Math.floor(current / size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [current - 1, current + 1, current - size, current + size];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        const nx = next % size;
        if (Math.abs(nx - x) > 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    const area = pixels.length;
    if (!largest || area > largest.area) largest = { area, pixels };
    if (area < minArea) continue;
    const overlapsCenter = minX < centerRight && maxX > centerLeft && minY < centerBottom && maxY > centerTop;
    const largeComponent = area >= size * size * 0.015;
    if (overlapsCenter || largeComponent) {
      for (const pixelIndex of pixels) selected[pixelIndex] = 1;
    }
  }

  if (!selected.some(Boolean) && largest) {
    for (const pixelIndex of largest.pixels) selected[pixelIndex] = 1;
  }
  return dilateMask(selected, size, 2);
}

function subjectFocusedPixels(image, size) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = size;
  sourceCanvas.height = size;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0, size, size);
  const imageData = sourceContext.getImageData(0, 0, size, size);
  const pixels = imageData.data;
  const mask = plantSubjectMaskFromPixels(pixels, size);
  const maskRatio = mask.reduce((sum, value) => sum + value, 0) / mask.length;
  if (maskRatio < 0.025) return pixels;

  const selected = selectMainSubjectMask(mask, size);
  if (!selected.some(Boolean)) return pixels;

  let minX = size;
  let maxX = 0;
  let minY = size;
  let maxY = 0;
  for (let index = 0; index < selected.length; index += 1) {
    if (!selected[index]) {
      const offset = index * 4;
      pixels[offset] = 244;
      pixels[offset + 1] = 245;
      pixels[offset + 2] = 240;
      continue;
    }
    const x = index % size;
    const y = Math.floor(index / size);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const subjectWidth = maxX - minX + 1;
  const subjectHeight = maxY - minY + 1;
  if (subjectWidth < size * 0.18 || subjectHeight < size * 0.18) return pixels;

  const padding = Math.max(4, Math.round(Math.max(subjectWidth, subjectHeight) * 0.14));
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(size, maxX + padding + 1);
  const bottom = Math.min(size, maxY + padding + 1);
  sourceContext.putImageData(imageData, 0, 0);

  const focusedCanvas = document.createElement('canvas');
  focusedCanvas.width = size;
  focusedCanvas.height = size;
  const focusedContext = focusedCanvas.getContext('2d', { willReadFrequently: true });
  focusedContext.fillStyle = '#f4f5f0';
  focusedContext.fillRect(0, 0, size, size);
  focusedContext.drawImage(sourceCanvas, left, top, right - left, bottom - top, 0, 0, size, size);
  return focusedContext.getImageData(0, 0, size, size).data;
}

async function analyzeImageOffline(file, cropType) {
  const crop = normalizeCropKey(cropType);
  if (hasNonCropFilenameContext(file.name)) {
    throw new Error(INVALID_CROP_IMAGE_MESSAGE);
  }

  const image = await loadImageElement(file);
  const size = 160;
  const pixels = subjectFocusedPixels(image, size);

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
  const fruitMask = new Uint8Array(size * size);
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
    if (isBananaFruit) {
      bananaFruit += 1;
      fruitMask[index] = 1;
    }
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

  const fruitVisited = new Uint8Array(size * size);
  let fruitComponentCount = 0;
  let maxFruitAreaRatio = 0;
  let maxFruitAspect = 1;
  const fruitStack = [];
  for (let start = 0; start < fruitMask.length; start += 1) {
    if (!fruitMask[start] || fruitVisited[start]) continue;
    let area = 0;
    let minX = size;
    let maxX = 0;
    let minY = size;
    let maxY = 0;
    fruitStack.push(start);
    fruitVisited[start] = 1;
    while (fruitStack.length) {
      const current = fruitStack.pop();
      area += 1;
      const x = current % size;
      const y = Math.floor(current / size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbors = [current - 1, current + 1, current - size, current + size];
      for (const next of neighbors) {
        if (next < 0 || next >= fruitMask.length || fruitVisited[next] || !fruitMask[next]) continue;
        const nx = next % size;
        const cx = current % size;
        if (Math.abs(nx - cx) > 1) continue;
        fruitVisited[next] = 1;
        fruitStack.push(next);
      }
    }
    if (area >= 32) {
      fruitComponentCount += 1;
      const width = Math.max(maxX - minX + 1, 1);
      const height = Math.max(maxY - minY + 1, 1);
      maxFruitAreaRatio = Math.max(maxFruitAreaRatio, area / fruitMask.length);
      maxFruitAspect = Math.max(maxFruitAspect, Math.max(width / height, height / width));
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
    fruitComponentCount,
    maxFruitAreaRatio,
    maxFruitAspect,
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

  validateSelectedCropAgainstImage(features, crop);

  if (shouldRejectNonCropForeground(features, crop)) {
    throw new Error(INVALID_CROP_IMAGE_MESSAGE);
  }

  const featureCrop = inferOfflineCrop(features, '');
  const possibleUnsupportedLabel = possibleUnsupportedCropLabel(features, {
    fileName: file.name,
    cropType,
    supportedInference: featureCrop,
  });
  if (possibleUnsupportedLabel) {
    return buildPossibleUnsupportedResult(features, possibleUnsupportedLabel);
  }

  const filenameContext = inferContextFromFilename(file.name, crop);
  const contextCrop = crop || filenameContext.crop;
  const cornEarIssue = looksLikeCornEarIssue(features, contextCrop);
  const healthyRicePanicle = (!contextCrop || contextCrop === 'rice') && looksLikeHealthyRicePanicle(features);
  const healthyBananaBunch = (!contextCrop || contextCrop === 'banana') && !cornEarIssue && looksLikeHealthyBananaBunch(features);
  const strongDiseaseSignal = hasStrongVisualDiseaseSignal(features, contextCrop);
  let analysisCrop = cornEarIssue ? 'corn' : healthyRicePanicle ? 'rice' : healthyBananaBunch ? 'banana' : contextCrop || inferOfflineCrop(features, file.name);
  let key = pickOfflineDiseaseKey(analysisCrop, features);
  if (healthyRicePanicle || healthyBananaBunch) {
    key = 'healthy';
  } else if (filenameContext.key) {
    key = strongDiseaseSignal ? filenameContext.key : 'review_needed';
  }
  const featureInferredOnly = !contextCrop && Boolean(analysisCrop);
  const keyCrop = Object.keys(cropDisplayNamesByKey).find((cropKey) => key.startsWith(`${cropKey}_`));
  const cropSpecificDisease = Boolean(keyCrop && !key.endsWith('_healthy'));
  if (featureInferredOnly && cropSpecificDisease && key !== 'corn_ear_pest_damage') {
    key = 'leaf_spot_or_blight';
  }
  const guide = offlineDiseaseGuide[key] || offlineDiseaseGuide.healthy;
  const usedFilenameDisease = Boolean(filenameContext.key && key === filenameContext.key);
  const confidence =
    key === 'review_needed'
      ? 0.52
      : (usedFilenameDisease ? filenameContext.confidence : 0) || (key === 'healthy' ? (analysisCrop ? 0.76 : 0.68) : computeOfflineConfidence(features, analysisCrop));
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
    analysis_mode:
      key === 'review_needed'
        ? 'uncertain browser visual review'
        : healthyRicePanicle
          ? 'rice panicle browser analysis'
          : healthyBananaBunch
            ? 'banana bunch browser analysis'
            : usedFilenameDisease
              ? 'filename-guided browser analysis'
              : crop
                ? 'offline browser analysis'
                : analysisCrop
                  ? 'offline browser crop-inferred analysis'
                  : 'offline browser visual analysis',
    reference_url: null,
    reference_title: null,
    created_at: new Date().toISOString(),
  };
}

function getYoloDetections(result) {
  if (!Array.isArray(result?.detections)) return [];
  return result.detections.filter((detection) => detection?.box && Number.isFinite(Number(detection.confidence)));
}

function ResultPanel({ result, previewUrl, t, panelRef, onFeedbackApplied }) {
  const confidence = result ? Math.round(result.confidence * 100) : 0;
  const cropLabel = result ? resolveCropLabel(result) : '--';
  const translatedCropLabel = translateCropLabel(cropLabel, t);
  const displayPreviewUrl = previewUrl || getScanImageUrl(result);
  const yoloDetections = getYoloDetections(result);
  const cropVerified = Boolean(result?.crop_label || result?.crop_type || inferCropLabel(result)) && cropLabel !== 'General crop leaf';
  const needsReview = /review/i.test(result?.disease_name || '');
  const statusClass = needsReview ? 'bg-amber-50 text-amber-700' : 'bg-leaf-50 text-leaf-700';
  const confidenceClass = !result ? 'border-stone-200 bg-white' : needsReview ? 'border-amber-100 bg-amber-50' : 'border-leaf-100 bg-leaf-50';
  const confidenceLabelClass = !result ? 'text-stone-500' : needsReview ? 'text-amber-700' : 'text-leaf-700';
  const confidenceTextClass = !result ? 'text-stone-400' : needsReview ? 'text-amber-900' : 'text-leaf-900';
  const confidenceBarClass = needsReview ? 'bg-amber-500' : 'bg-leaf-600';
  const canGiveFeedback = Boolean(result?.id) && result?.image_path !== 'manual-entry' && result?.image_path !== 'offline-browser-analysis';
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCrop, setFeedbackCrop] = useState('');
  const [feedbackCondition, setFeedbackCondition] = useState('Healthy crop');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const feedbackConditionOptions = getCorrectionConditionOptions(feedbackCrop || cropLabel);
  const isNotCropCorrection = feedbackCondition === 'Not a crop image';

  useEffect(() => {
    const currentCrop = cropLabel && cropLabel !== 'General crop leaf' && cropLabel !== '--' ? cropLabel : '';
    const currentDisease = result?.disease_name || '';
    const nextOptions = getCorrectionConditionOptions(currentCrop);
    setFeedbackOpen(false);
    setFeedbackCrop(currentCrop);
    setFeedbackCondition(/healthy/i.test(currentDisease) ? nextOptions[1] || 'Leaf spot or blight symptoms' : 'Healthy crop');
    setFeedbackNote('');
    setFeedbackMessage('');
    setFeedbackError('');
  }, [cropLabel, result?.disease_name, result?.id, result?.local_id]);

  useEffect(() => {
    if (!feedbackConditionOptions.includes(feedbackCondition)) {
      setFeedbackCondition(feedbackConditionOptions[0] || 'Healthy crop');
    }
  }, [feedbackCondition, feedbackConditionOptions]);

  async function submitFeedback(event) {
    event.preventDefault();
    if (!canGiveFeedback || (!feedbackCrop && !isNotCropCorrection) || !feedbackCondition) return;
    setFeedbackSubmitting(true);
    setFeedbackMessage('');
    setFeedbackError('');
    try {
      const response = await api.post(`/scans/${result.id}/feedback`, {
        corrected_crop_label: feedbackCrop || 'General crop',
        corrected_condition: feedbackCondition,
        user_note: feedbackNote || null,
      });
      const feedback = response.data;
      if (feedback.verification_status === 'verified') {
        const updatedResult = {
          ...result,
          crop_label: feedback.corrected_crop_label,
          disease_name: feedback.applied_disease_name || feedback.corrected_disease_name,
          confidence: feedback.applied_confidence ?? result.confidence,
          cause: feedback.applied_cause || result.cause,
          treatment: feedback.applied_treatment || result.treatment,
          analysis_mode: feedback.applied_analysis_mode || result.analysis_mode,
          status: isNotCropCorrection ? 'rejected' : 'corrected',
        };
        onFeedbackApplied?.(updatedResult);
        setFeedbackMessage(t('correctionVerifiedLearned'));
        setFeedbackOpen(false);
        return;
      }
      setFeedbackMessage(feedback.verification_reason || t('correctionSavedForReview'));
    } catch (feedbackRequestError) {
      setFeedbackError(getApiErrorMessage(feedbackRequestError, t('correctionSaveFailed')));
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  return (
    <section ref={panelRef} className="surface scroll-mt-20 overflow-hidden rounded-lg sm:scroll-mt-24 lg:scroll-mt-28">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold sm:px-4 ${statusClass}`}>
              <FlaskConical className="h-4 w-4" />
              {needsReview ? t('reviewNeeded') : t('analysisReady')}
            </span>
            {cropLabel !== '--' && (
              <span className="rounded-full bg-stone-100 px-3 py-2 text-sm font-bold text-stone-700 sm:px-4">
                {translatedCropLabel}
              </span>
            )}
          </div>

          <h2 className="mt-5 break-words text-2xl font-bold text-stone-950 sm:text-3xl">
            {result?.disease_name ? translateDiseaseName(result.disease_name, t) : t('readyForDiseaseAnalysis')}
          </h2>
          {!result ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 sm:text-base">
              {t('diseaseAnalysisPrompt')}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('detectedCrop')}</p>
              <p className="mt-2 text-lg font-bold text-stone-950">{translatedCropLabel}</p>
              <p className="mt-1 text-sm text-stone-500">
                {!result ? t('diseaseAnalysisPrompt') : cropVerified ? t('estimatedFromUploadedCropImage') : t('analyzedGeneralCropLeaf')}
              </p>
            </article>
            <article className={`rounded-lg border p-4 ${confidenceClass}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${confidenceLabelClass}`}>{needsReview ? t('scanCertainty') : t('confidence')}</p>
              <p className={`mt-2 text-3xl font-bold ${confidenceTextClass}`}>{confidence || '--'}%</p>
              <div className="mt-3 h-2 rounded-full bg-stone-100">
                <div className={`h-2 rounded-full ${confidenceBarClass}`} style={{ width: result ? `${confidence}%` : '0%' }} />
              </div>
            </article>
          </div>

          {result && (
            <div className="mt-6 space-y-4">
              <article className="rounded-lg border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('likelyCause')}</p>
                <TranslatedText as="p" className="mt-2 text-sm leading-6 text-stone-700" text={result.cause} />
              </article>
              <article className="rounded-lg border border-stone-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('treatmentSuggestion')}</p>
                <TranslatedText as="p" className="mt-2 text-sm leading-6 text-stone-700" text={result.treatment} />
              </article>
              <article className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{t('modelBasis')}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  {yoloDetections.length > 0
                    ? t('yoloModelBasis')
                    : isLocalVisualAnalysisMode(result.analysis_mode)
                    ? t('localVisualModelBasis')
                    : t('modelBasisBody')}
                </p>
                {result.reference_url && (
                  <a className="mt-3 inline-flex text-sm font-bold text-sky-700 hover:text-sky-900" href={result.reference_url} rel="noreferrer" target="_blank">
                    {result.reference_title || t('openCropDiseaseReference')}
                  </a>
                )}
              </article>
              {canGiveFeedback && (
                <article className="rounded-lg border border-stone-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('correctionLearning')}</p>
                      <p className="mt-1 text-sm leading-6 text-stone-600">
                        {t('correctionLearningBody')}
                      </p>
                    </div>
                    <button
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-bold text-stone-700 transition hover:border-leaf-300 hover:bg-leaf-50"
                      type="button"
                      onClick={() => setFeedbackOpen((open) => !open)}
                    >
                      <Flag className="h-4 w-4" />
                      {t('flagWrong')}
                    </button>
                  </div>

                  {feedbackOpen && (
                    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitFeedback}>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('correctCrop')}</span>
                        <select
                          className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-100"
                          disabled={isNotCropCorrection}
                          value={feedbackCrop}
                          onChange={(event) => setFeedbackCrop(event.target.value)}
                        >
                          <option value="">{isNotCropCorrection ? t('notApplicable') : t('selectCrop')}</option>
                          {quickCropOptions.map((crop) => (
                            <option key={crop} value={crop}>
                              {crop}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('correctResult')}</span>
                        <select
                          className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-100"
                          value={feedbackCondition}
                          onChange={(event) => setFeedbackCondition(event.target.value)}
                        >
                          {feedbackConditionOptions.map((condition) => (
                            <option key={condition} value={condition}>
                              {translateDiseaseName(condition, t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('note')}</span>
                        <textarea
                          className="mt-2 min-h-20 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-100"
                          maxLength={500}
                          value={feedbackNote}
                          onChange={(event) => setFeedbackNote(event.target.value)}
                          placeholder={t('correctionExample')}
                        />
                      </label>
                      <button
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-leaf-700 px-4 text-sm font-bold text-white transition hover:bg-leaf-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-fit"
                        disabled={(!feedbackCrop && !isNotCropCorrection) || !feedbackCondition || feedbackSubmitting}
                        type="submit"
                      >
                        {feedbackSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('submitCorrection')}
                      </button>
                    </form>
                  )}
                  {feedbackMessage && <p className="mt-3 rounded-lg bg-leaf-50 p-3 text-sm font-semibold text-leaf-700">{feedbackMessage}</p>}
                  {feedbackError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{feedbackError}</p>}
                </article>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-stone-100 bg-stone-50 p-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('uploadCropImage')}</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
            {displayPreviewUrl ? (
              <div className="relative h-52 w-full bg-stone-950 sm:h-64">
                <img src={displayPreviewUrl} alt={t('uploadCropImage')} className="h-full w-full object-fill" />
                {yoloDetections.map((detection, index) => {
                  const box = detection.box;
                  return (
                    <div
                      key={`${detection.raw_label || detection.label}-${index}`}
                      className={`absolute border-2 ${detection.selected ? 'border-leaf-300' : 'border-amber-300'} bg-stone-950/10`}
                      style={{
                        left: `${Number(box.x) * 100}%`,
                        top: `${Number(box.y) * 100}%`,
                        width: `${Number(box.width) * 100}%`,
                        height: `${Number(box.height) * 100}%`,
                      }}
                    >
                      <span className={`absolute left-0 top-0 max-w-full truncate px-2 py-1 text-[10px] font-bold text-stone-950 ${detection.selected ? 'bg-leaf-300' : 'bg-amber-300'}`}>
                        {translateDiseaseName(detection.label, t)} {Math.round(Number(detection.confidence) * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative h-52 overflow-hidden bg-leaf-50 sm:h-64">
                <img src={diseaseDetectorImage} alt={t('uploadCropImage')} className="h-full w-full object-cover opacity-25" />
                <div className="absolute inset-0 grid place-items-center bg-white/45 p-5 text-stone-600">
                  <div className="max-w-56 text-center">
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-stone-200 bg-white/90 text-leaf-700 shadow-sm">
                      <ImagePlus className="h-7 w-7" />
                    </span>
                    <p className="mt-3 text-sm font-semibold leading-6">{t('diseaseAnalysisPrompt')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          {result?.image_name && <p className="mt-3 break-all text-sm font-semibold text-stone-700">{result.image_name}</p>}
          {yoloDetections.length > 0 && (
            <div className="mt-4 space-y-2">
              {yoloDetections.slice(0, 4).map((detection, index) => (
                <div key={`${detection.raw_label || detection.label}-summary-${index}`} className="rounded-lg border border-stone-200 bg-white p-3">
                  <p className="truncate text-sm font-bold text-stone-900">{translateDiseaseName(detection.label, t)}</p>
                  <p className="mt-1 text-xs font-semibold text-stone-500">{Math.round(Number(detection.confidence) * 100)}% {t('confidence')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HistoryList({ history, onSelect, t }) {
  const visibleHistory = history.filter((scan) => scan?.status !== 'rejected' && scan?.disease_name !== 'Invalid crop or leaf image');
  const [showAll, setShowAll] = useState(false);
  const displayedHistory = showAll ? visibleHistory : visibleHistory.slice(0, 6);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-950">{t('recentDiseaseScans')}</h2>
          <p className="text-sm text-stone-500">{t('savedDiseaseDetections')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {visibleHistory.length > 6 && (
            <button
              className="btn-secondary h-10 px-4 text-sm"
              onClick={() => setShowAll((current) => !current)}
              type="button"
            >
              {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAll ? t('showLess') : t('showAll')}
            </button>
          )}
          <span className="w-fit rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700">
            {visibleHistory.length} {t('total')}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {displayedHistory.map((scan) => (
          <button
            key={scan.local_id}
            className="surface min-h-[132px] rounded-lg p-4 text-left transition hover:border-leaf-200 hover:bg-leaf-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300"
            onClick={() => onSelect(scan)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{translateCropLabel(resolveCropLabel(scan), t)}</p>
                <h3 className="mt-2 text-lg font-bold text-stone-950">{translateDiseaseName(scan.disease_name, t)}</h3>
                <p className="mt-1 text-sm text-stone-500">{new Date(scan.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
                {Math.round(scan.confidence * 100)}%
              </span>
            </div>
          </button>
        ))}

        {visibleHistory.length === 0 && (
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
  const resultPanelRef = useRef(null);
  const pendingResultRevealRef = useRef(false);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [showImageSourcePicker, setShowImageSourcePicker] = useState(false);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCrop, setSelectedCrop] = useState('');
  const [customCrop, setCustomCrop] = useState('');
  const [detectorConnection, setDetectorConnection] = useState(() => ({
    browserOnline: window.navigator.onLine,
    backendOnline: null,
    checking: false,
  }));

  const activeCropInput = selectedCrop === CUSTOM_CROP_OPTION ? customCrop.trim() : selectedCrop;
  const canSubmit = Boolean(imageFile) && (selectedCrop !== CUSTOM_CROP_OPTION || customCrop.trim().length >= 2);
  const detectorMode = !detectorConnection.browserOnline
    ? 'offline'
    : detectorConnection.backendOnline === false
      ? 'offline'
      : detectorConnection.backendOnline === true
        ? 'online'
        : 'checking';

  useEffect(() => {
    let active = true;
    let localHistory = [];
    try {
      localHistory = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]').map(normalizeHistoryScan);
    } catch {
      localHistory = [];
    }
    setHistory(localHistory);

    api.get('/scans')
      .then((response) => {
        if (!active) return;
        const merged = mergeHistory(Array.isArray(response.data) ? response.data : [], localHistory);
        setHistory(merged);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(merged));
      })
      .catch(() => {
        if (active) {
          setHistory(localHistory);
        }
      });

    return () => {
      active = false;
    };
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

  useEffect(() => {
    if (!result || !pendingResultRevealRef.current) return;
    pendingResultRevealRef.current = false;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    resultPanelRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [result]);

  function saveHistory(scan) {
    const normalizedScan = normalizeHistoryScan(scan);
    setHistory((current) => {
      const next = [normalizedScan, ...current.filter((item) => historyKey(item) !== historyKey(normalizedScan))].slice(0, 12);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleFeedbackApplied(updatedScan) {
    setResult(updatedScan);
    saveHistory(updatedScan);
  }

  function queueResultReveal() {
    pendingResultRevealRef.current = true;
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

    let preflightOfflineResult = null;
    let preflightValidationError = null;
    const cropInput = activeCropInput;
    try {
      preflightOfflineResult = await analyzeImageOffline(imageFile, cropInput);
    } catch (validationError) {
      if (validationError?.name === 'CropTypeMismatchError') {
        setResult(null);
        setError(validationError.message);
        setLoading(false);
        return;
      }
      preflightValidationError = validationError;
    }

    try {
      const backendReady = await detectOnlineMode();
      const useOfflineAnalysis = !window.navigator.onLine || !backendReady;
      if (useOfflineAnalysis && preflightValidationError) {
        setResult(null);
        setError(preflightValidationError?.message || INVALID_CROP_IMAGE_MESSAGE);
        return;
      }
      const uploadImageFile = useOfflineAnalysis ? imageFile : await prepareImageForUpload(imageFile);
      const preflightDiseaseName = (preflightOfflineResult?.disease_name || '').toLowerCase();
      const preflightAnalysisMode = (preflightOfflineResult?.analysis_mode || '').toLowerCase();
      const preflightCropKey = normalizeCropKey(preflightOfflineResult?.crop_label);
      const preflightSupportedCropLabel = cropDisplayNamesByKey[preflightCropKey] || '';
      const canTrustPreflightCrop =
        Boolean(preflightSupportedCropLabel) &&
        !preflightDiseaseName.includes('review') &&
        preflightOfflineResult.confidence >= 0.72 &&
        (
          preflightDiseaseName !== 'healthy crop' ||
          preflightAnalysisMode.includes('rice panicle') ||
          preflightAnalysisMode.includes('banana bunch') ||
          preflightAnalysisMode.includes('filename-guided')
        );
      const inferredCropType =
        !cropInput && canTrustPreflightCrop
          ? preflightSupportedCropLabel
          : '';
      const requestCropType = cropInput || inferredCropType;
      const payload = new FormData();
      payload.append('image', uploadImageFile, uploadImageFile.name);
      payload.append('crop_type', requestCropType);
      payload.append('offline_mode', useOfflineAnalysis ? 'true' : 'false');

      if (useOfflineAnalysis) {
        const nextResult = normalizeHistoryScan({
          ...preflightOfflineResult,
          local_id: makeHistoryId(),
          image_name: imageFile.name,
        });
        queueResultReveal();
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

      const nextResult = normalizeHistoryScan({
        ...response.data,
        local_id: makeHistoryId(),
        created_at: new Date().toISOString(),
        crop_type: response.data.crop_type || requestCropType,
        crop_label: response.data.crop_label || requestCropType || inferCropLabel(response.data),
        image_name: imageFile.name,
      });

      queueResultReveal();
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
        const offlineResult = await analyzeImageOffline(imageFile, cropInput);
        const nextResult = normalizeHistoryScan({
          ...offlineResult,
          local_id: makeHistoryId(),
          image_name: imageFile.name,
          analysis_mode: 'offline browser fallback',
        });
        queueResultReveal();
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
    queueResultReveal();
    setResult(normalizeHistoryScan(scan));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{t('imageDiagnosis')}</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-normal text-stone-950 sm:text-3xl">
            {t('plantDiseaseDetector')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            {t('plantDiseaseDetectorBody')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="status-pill border border-stone-200 bg-white text-stone-700">{quickCropOptions.length} {t('crops')}</span>
          <span className={`status-pill ${detectorMode === 'online' ? 'bg-leaf-50 text-leaf-800' : detectorMode === 'offline' ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-700'}`}>
            {detectorMode === 'online' ? t('mlOnline') : detectorMode === 'offline' ? t('deviceMode') : t('checkingStatus')}
          </span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] xl:gap-6">
        <form onSubmit={submit} className="surface rounded-lg p-4 sm:p-5 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-950">{t('uploadCropImage')}</h2>
              <p className="mt-1 text-sm text-stone-500">{t('uploadClearCropImage')}</p>
            </div>
            <button className="btn-icon" type="button" onClick={resetForm} title={t('resetForm')}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-stone-700">{t('cropType')}</span>
              <select
                className="field mt-2 h-12"
                value={selectedCrop}
                onChange={(event) => {
                  setSelectedCrop(event.target.value);
                  if (event.target.value !== CUSTOM_CROP_OPTION) setCustomCrop('');
                }}
              >
                <option value="">{t('autoDetectCrop')}</option>
                {quickCropOptions.map((crop) => (
                  <option key={crop} value={crop}>{crop}</option>
                ))}
                <option value={CUSTOM_CROP_OPTION}>{t('otherNotListed')}</option>
              </select>
              {selectedCrop === CUSTOM_CROP_OPTION && (
                <input
                  className="field mt-3 h-12"
                  maxLength={80}
                  placeholder={t('cropName')}
                  value={customCrop}
                  onChange={(event) => setCustomCrop(event.target.value)}
                />
              )}
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
                  <img src={previewUrl} alt={t('uploadCropImage')} className="h-48 w-full rounded-lg object-cover sm:h-56" />
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-leaf-600" />
                    <p className="mt-4 text-base font-bold text-stone-900">{t('takeOrUploadPhoto')}</p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">
                      {t('takeClearCropPhoto')}
                    </p>
                  </>
                )}
              </button>

              {showImageSourcePicker && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" role="dialog" aria-label={t('chooseImageSource')}>
                  <button
                    className="flex min-h-20 items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left transition hover:border-leaf-300 hover:bg-leaf-50 focus:outline-none focus:ring-2 focus:ring-leaf-500 focus:ring-offset-2"
                    type="button"
                    onClick={() => chooseImageSource('gallery')}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-leaf-50 text-leaf-700">
                      <ImagePlus className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-stone-950">{t('uploadFromGallery')}</span>
                      <span className="mt-1 block text-xs font-medium text-stone-500">{t('chooseExistingPhoto')}</span>
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
                      <span className="block text-sm font-bold text-stone-950">{t('useCamera')}</span>
                      <span className="mt-1 block text-xs font-medium text-stone-500">{t('takeNewPhoto')}</span>
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
          <ResultPanel
            panelRef={resultPanelRef}
            result={result}
            previewUrl={previewUrl}
            t={t}
            onFeedbackApplied={handleFeedbackApplied}
          />

          <HistoryList history={history} onSelect={handleHistorySelect} t={t} />
        </div>
      </div>
    </div>
  );
}
