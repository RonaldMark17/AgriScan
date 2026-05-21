import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Droplets,
  Filter,
  FlaskConical,
  Gauge,
  Leaf,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Sprout,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Thermometer,
  TrendingUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client.js';
import TranslatedText from '../components/shared/TranslatedText.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useVoice } from '../context/VoiceContext.jsx';
import { reverseGeocodeLocation } from '../utils/openStreetMap.js';
import { buildDetailedAlert, getApiErrorMessage } from '../utils/apiErrors.js';

const initialForm = {
  soil_type: 'Loam',
  ph_level: '',
  moisture_percent: '',
  soil_temperature_c: '',
  nitrogen_level: 'medium',
  phosphorus_level: 'medium',
  potassium_level: 'medium',
  nitrogen_ppm: '',
  phosphorus_ppm: '',
  potassium_ppm: '',
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

function soilScanRequestErrorMessage(error, fallback = 'Soil scan failed.') {
  const apiMessage = getApiErrorMessage(error, '');
  const status = error?.response?.status;

  if (status === 401) {
    return buildDetailedAlert(
      'Manual Scan was blocked.',
      'Your login session is missing, expired, or no longer valid.',
      'Sign in again, then return to Manual Scan and submit the soil readings.'
    );
  }

  if (status === 403) {
    return buildDetailedAlert(
      'Your account is not allowed to create Manual Scan recommendations.',
      apiMessage || 'Your current account does not have the required farm access.',
      manualScanPermissionAction(apiMessage)
    );
  }

  if (status >= 400 && status < 500) {
    return buildDetailedAlert(
      'Manual Scan could not create a recommendation.',
      apiMessage || fallback,
      'Check the soil readings, farm access, and account permissions, then try again.'
    );
  }

  return buildDetailedAlert(
    'Manual Scan could not create a recommendation.',
    apiMessage || fallback,
    'Check your connection and retry. If you are offline, AgriScan will use saved device rules.'
  );
}

function manualScanPermissionAction(apiMessage = '') {
  const reason = apiMessage.toLowerCase();
  if (reason.includes('farm') && reason.includes('register')) {
    return 'Open Farms, register your farm details, save the farm record, then return to Manual Scan. If admin review is required, wait for approval before relying on official records.';
  }
  if (reason.includes('mfa')) {
    return 'Complete MFA verification, then retry the Manual Scan.';
  }
  if (reason.includes('insufficient')) {
    return 'Ask an administrator to grant the correct role or permission for Manual Scan.';
  }
  return 'Use a farmer account with farm access, or ask an administrator to update your account permissions.';
}
const categories = ['All Crops', 'Vegetables', 'Grains', 'Fruits', 'Root Crops', 'Field Crops'];
const sortModes = ['Suitability', 'Crop Name', 'Planting Window'];
const soilInputLimits = {
  ph_level: { min: 3.5, max: 9.5, label: 'pH must be between 3.5 and 9.5.', key: 'phRangeError' },
  moisture_percent: { min: 5, max: 100, label: 'Moisture must be between 5% and 100%.', key: 'moistureRangeError' },
  soil_temperature_c: { min: 10, max: 45, label: 'Soil temperature must be between 10C and 45C.', key: 'soilTemperatureRangeError' },
  nitrogen_ppm: { min: 0, max: 300, label: 'Nitrogen ppm must be between 0 and 300.', key: 'nitrogenPpmRangeError' },
  phosphorus_ppm: { min: 0, max: 300, label: 'Phosphorus ppm must be between 0 and 300.', key: 'phosphorusPpmRangeError' },
  potassium_ppm: { min: 0, max: 500, label: 'Potassium ppm must be between 0 and 500.', key: 'potassiumPpmRangeError' },
};
const offlineCropTemplates = [
  {
    crop: 'Rice',
    base: 72,
    reason: 'Performs well in clay or alluvial soils with reliable water supply.',
    planting_window: 'Best at the start of the rainy season or when irrigation is available.',
    watering: 'Keep soil consistently moist during establishment.',
    fertilizer: 'Use split nitrogen application and avoid excess nitrogen during humid periods.',
  },
  {
    crop: 'Corn',
    base: 70,
    reason: 'Fits well-drained loam to sandy loam soils with good sunlight.',
    planting_window: 'Plant when soil is moist but not waterlogged.',
    watering: 'Water during tasseling and grain filling if rainfall is low.',
    fertilizer: 'Side-dress nitrogen during vegetative growth.',
  },
  {
    crop: 'Tomato',
    base: 68,
    reason: 'Needs well-drained loam soil with balanced moisture and near-neutral pH.',
    planting_window: 'Plant during cooler dry months or protected rainy-season production.',
    watering: 'Use consistent watering and avoid wetting leaves.',
    fertilizer: 'Support calcium and potassium to reduce fruit disorders.',
  },
  {
    crop: 'Eggplant',
    base: 67,
    reason: 'Adaptable to loam and clay loam soils with warm Philippine conditions.',
    planting_window: 'Suitable for year-round planting with pest monitoring.',
    watering: 'Maintain steady moisture without flooding.',
    fertilizer: 'Apply compost and balanced NPK before flowering.',
  },
  {
    crop: 'Pechay',
    base: 64,
    reason: 'Fast-growing leafy vegetable for fertile loam soils.',
    planting_window: 'Plant in short cycles when heavy rain is manageable.',
    watering: 'Water lightly and regularly.',
    fertilizer: 'Use nitrogen-rich organic fertilizer for leaf growth.',
  },
  {
    crop: 'Cassava',
    base: 63,
    reason: 'Tolerates sandy or light soils and lower moisture better than many vegetables.',
    planting_window: 'Plant at the beginning of rains for establishment.',
    watering: 'Needs little irrigation after establishment.',
    fertilizer: 'Add potassium support for root development.',
  },
  {
    crop: 'Mung Bean',
    base: 62,
    reason: 'Good legume option for sandy loam and lower nitrogen soils.',
    planting_window: 'Best after rice or during a drier window.',
    watering: 'Avoid waterlogging and irrigate lightly during flowering.',
    fertilizer: 'Use inoculant or compost; avoid heavy nitrogen.',
  },
  {
    crop: 'Sweet Potato',
    base: 61,
    reason: 'Works well in loose sandy loam soils with moderate fertility.',
    planting_window: 'Plant when soil is warm and rainfall is steady.',
    watering: 'Keep moist during vine establishment, then reduce watering.',
    fertilizer: 'Avoid excess nitrogen; support potassium for tuber growth.',
  },
  {
    crop: 'Gabi / Taro',
    base: 60,
    reason: 'Suitable for moist clay soils and areas that stay wet.',
    planting_window: 'Plant during rainy months or in irrigated plots.',
    watering: 'Maintain high soil moisture.',
    fertilizer: 'Use compost and balanced nutrients before corm expansion.',
  },
  {
    crop: 'Banana',
    base: 66,
    reason: 'Fits warm loam to alluvial soils with steady moisture and good drainage.',
    planting_window: 'Plant at the start of rains or with dependable irrigation.',
    watering: 'Maintain even moisture, especially during bunch development.',
    fertilizer: 'Apply organic matter and potassium-rich fertilizer in split applications.',
  },
  {
    crop: 'Coconut',
    base: 63,
    reason: 'Perennial crop for warm coastal or lowland areas with deep, well-drained soil.',
    planting_window: 'Plant seedlings when rainfall is reliable and field access is stable.',
    watering: 'Keep young palms watered during dry spells until roots establish.',
    fertilizer: 'Use potassium, chloride, and organic matter based on local soil testing.',
  },
  {
    crop: 'Pineapple',
    base: 59,
    reason: 'Tolerates acidic sandy loam and needs open sun with good drainage.',
    planting_window: 'Plant slips or crowns when rainfall can support early rooting.',
    watering: 'Irrigate lightly during long dry spells and avoid standing water.',
    fertilizer: 'Apply nitrogen and potassium in small scheduled doses.',
  },
  {
    crop: 'Onion',
    base: 56,
    reason: 'Performs best in loose, well-drained soil during cooler dry periods.',
    planting_window: 'Plant during the dry season or a low-rainfall window.',
    watering: 'Use shallow, regular irrigation and reduce water near bulb maturity.',
    fertilizer: 'Balance nitrogen early with phosphorus and potassium for bulb formation.',
  },
  {
    crop: 'Mango',
    base: 58,
    reason: 'Tree crop for warm well-drained soil and drier flowering windows.',
    planting_window: 'Plant grafted seedlings at the beginning of the rainy season.',
    watering: 'Water young trees regularly, then reduce excess moisture before flowering.',
    fertilizer: 'Use compost and balanced tree fertilizer, avoiding excess nitrogen before flowering.',
  },
  {
    crop: 'Cacao',
    base: 55,
    reason: 'Tree crop for warm, humid, organic-rich soil with partial shade when young.',
    planting_window: 'Plant when rainfall is reliable and shade trees are ready.',
    watering: 'Keep soil moist but well-drained, especially during establishment.',
    fertilizer: 'Use organic matter plus balanced nutrients based on soil analysis.',
  },
];
const offlineCropTraits = {
  clay: new Set(['rice', 'gabi taro', 'eggplant', 'pechay']),
  sandy: new Set(['corn', 'cassava', 'mung bean', 'sweet potato', 'pineapple']),
  loam: new Set(['corn', 'tomato', 'eggplant', 'pechay', 'onion', 'banana', 'mango', 'cacao']),
  alluvial: new Set(['rice', 'corn', 'banana', 'coconut', 'gabi taro']),
  acid: new Set(['rice', 'cassava', 'sweet potato', 'pineapple', 'coconut', 'cacao', 'banana']),
  neutral: new Set(['tomato', 'eggplant', 'pechay', 'corn', 'onion', 'mung bean']),
  highMoisture: new Set(['rice', 'gabi taro', 'coconut', 'banana', 'cacao']),
  lowMoisture: new Set(['cassava', 'mung bean', 'sweet potato', 'pineapple', 'corn', 'mango']),
  moderateMoisture: new Set(['corn', 'tomato', 'eggplant', 'pechay', 'onion', 'mango']),
  warm: new Set(['corn', 'eggplant', 'cassava', 'mung bean', 'sweet potato', 'pineapple', 'banana', 'mango', 'coconut', 'cacao']),
  cool: new Set(['pechay', 'onion', 'tomato']),
  fullSun: new Set(['corn', 'tomato', 'eggplant', 'cassava', 'mung bean', 'banana', 'mango', 'pineapple', 'coconut']),
  partialShade: new Set(['pechay', 'gabi taro', 'cacao']),
  drySeason: new Set(['corn', 'cassava', 'mung bean', 'sweet potato', 'onion', 'tomato', 'mango', 'pineapple']),
  wetSeason: new Set(['rice', 'gabi taro', 'coconut', 'banana', 'cacao']),
};

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nutrientStatusFromValue(level, ppm, lowCutoff, highCutoff) {
  if (ppm !== null) {
    if (ppm < lowCutoff) return 'low';
    if (ppm > highCutoff) return 'high';
    return 'medium';
  }
  return (level || 'medium').toLowerCase();
}

function addScoreComponent(breakdown, label, value, detail = '') {
  if (Math.abs(value) < 0.01) return;
  breakdown.push({ label, value: Math.round(value * 10) / 10, detail });
}

function getSoilInputErrors(inputs, t = null) {
  const errors = [];
  const ph = parseOptionalNumber(inputs?.ph_level);
  const moisture = parseOptionalNumber(inputs?.moisture_percent);
  const soilTemperature = parseOptionalNumber(inputs?.soil_temperature_c);
  const nitrogenPpm = parseOptionalNumber(inputs?.nitrogen_ppm);
  const phosphorusPpm = parseOptionalNumber(inputs?.phosphorus_ppm);
  const potassiumPpm = parseOptionalNumber(inputs?.potassium_ppm);

  [
    [ph, soilInputLimits.ph_level],
    [moisture, soilInputLimits.moisture_percent],
    [soilTemperature, soilInputLimits.soil_temperature_c],
    [nitrogenPpm, soilInputLimits.nitrogen_ppm],
    [phosphorusPpm, soilInputLimits.phosphorus_ppm],
    [potassiumPpm, soilInputLimits.potassium_ppm],
  ].forEach(([value, limits]) => {
    if (value !== null && (value < limits.min || value > limits.max)) {
      errors.push(t ? t(limits.key) : limits.label);
    }
  });

  return errors;
}

function normalizeCropName(value) {
  return (value || '').toLowerCase().replace(/[/_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasCrop(trait, crop) {
  return offlineCropTraits[trait].has(normalizeCropName(crop));
}

function offlineSoilGuardrail(phLevel, moisturePercent, soilTemperatureC) {
  let cap = 98;
  let penalty = 0;
  const warnings = [];

  if (phLevel !== null) {
    if (phLevel < 4.5 || phLevel > 8.8) {
      cap = Math.min(cap, 55);
      penalty += 18;
      warnings.push('The pH is outside the safe range for most crops; correct soil pH before planting.');
    } else if (phLevel < 5.2 || phLevel > 8.2) {
      cap = Math.min(cap, 72);
      penalty += 8;
      warnings.push('The pH is stressful for many crops and lowers suitability.');
    }
  }

  if (moisturePercent !== null) {
    if (moisturePercent < 15) {
      cap = Math.min(cap, 58);
      penalty += 12;
      warnings.push('Soil moisture is very low, so water-demanding crops should be delayed.');
    } else if (moisturePercent > 85) {
      cap = Math.min(cap, 65);
      penalty += 10;
      warnings.push('Soil moisture is high and may reduce crops that dislike waterlogging.');
    }
  }

  if (soilTemperatureC !== null && (soilTemperatureC < 18 || soilTemperatureC > 38)) {
    cap = Math.min(cap, 60);
    penalty += 12;
    warnings.push('Soil temperature is stressful and lowers planting suitability.');
  }

  return { cap, penalty, warnings };
}

function buildOfflineSoilSummary(payload) {
  const details = [`${payload.soil_type} soil`];
  if (payload.ph_level !== null) details.push(`pH ${payload.ph_level}`);
  if (payload.moisture_percent !== null) details.push(`${payload.moisture_percent}% moisture`);
  if (payload.soil_temperature_c !== null) details.push(`${payload.soil_temperature_c}C soil temperature`);
  return details.join(', ');
}

function buildOfflineSoilActions(payload, warnings) {
  if (warnings.length > 0) return warnings;

  const actions = ['Confirm the recommendation with local field conditions before planting.'];
  if (payload.ph_level !== null && payload.ph_level < 5.6) {
    actions.push('Consider lime or organic matter based on a soil test before planting sensitive crops.');
  }
  if (payload.moisture_percent !== null && payload.moisture_percent <= 35) {
    actions.push('Irrigate before planting water-demanding crops.');
  }
  if ((payload.drainage || '').includes('water')) {
    actions.push('Open drainage channels before planting crops that dislike standing water.');
  }
  return actions;
}

function buildOfflineCropRecommendation(payload, t) {
  const soil = (payload.soil_type || '').toLowerCase();
  const drainage = (payload.drainage || 'moderate').toLowerCase();
  const sunlight = (payload.sunlight || 'full sun').toLowerCase();
  const season = (payload.season || 'regular season').toLowerCase();
  const nitrogen = nutrientStatusFromValue(payload.nitrogen_level, payload.nitrogen_ppm, 40, 85);
  const phosphorus = nutrientStatusFromValue(payload.phosphorus_level, payload.phosphorus_ppm, 25, 70);
  const potassium = nutrientStatusFromValue(payload.potassium_level, payload.potassium_ppm, 80, 190);
  const guardrail = offlineSoilGuardrail(payload.ph_level, payload.moisture_percent, payload.soil_temperature_c);

  const recommendations = offlineCropTemplates
    .map((candidate) => {
      let score = candidate.base;
      const breakdown = [{ label: 'Base crop fit', value: candidate.base, detail: candidate.reason }];
      const riskFlags = [];

      const soilBefore = score;
      if (soil.includes('clay')) score += hasCrop('clay', candidate.crop) ? 12 : -4;
      if (soil.includes('sandy')) score += hasCrop('sandy', candidate.crop) ? 12 : -5;
      if (soil.includes('loam')) score += hasCrop('loam', candidate.crop) ? 10 : 4;
      if (soil.includes('alluvial')) score += hasCrop('alluvial', candidate.crop) ? 12 : 5;
      addScoreComponent(breakdown, 'Soil texture', score - soilBefore);

      const phBefore = score;
      if (payload.ph_level !== null) {
        if (payload.ph_level < 5.6) score += hasCrop('acid', candidate.crop) ? 8 : -10;
        else if (payload.ph_level <= 7.2) score += hasCrop('neutral', candidate.crop) ? 9 : 4;
      }
      addScoreComponent(breakdown, 'pH match', score - phBefore);

      const moistureBefore = score;
      if (payload.moisture_percent !== null) {
        if (payload.moisture_percent >= 65) score += hasCrop('highMoisture', candidate.crop) ? 12 : -6;
        else if (payload.moisture_percent <= 35) score += hasCrop('lowMoisture', candidate.crop) ? 10 : -5;
        else score += hasCrop('moderateMoisture', candidate.crop) ? 8 : 3;
      }
      addScoreComponent(breakdown, 'Moisture fit', score - moistureBefore);

      const temperatureBefore = score;
      if (payload.soil_temperature_c !== null) {
        if (payload.soil_temperature_c >= 30) score += hasCrop('warm', candidate.crop) ? 8 : 0;
        else if (payload.soil_temperature_c < 22) score += hasCrop('cool', candidate.crop) ? 5 : -4;
      }
      addScoreComponent(breakdown, 'Soil temperature', score - temperatureBefore);

      const fieldBefore = score;
      if (drainage.includes('poor') || drainage.includes('water')) score += hasCrop('highMoisture', candidate.crop) ? 13 : -8;
      else if (drainage.includes('good')) score += hasCrop('lowMoisture', candidate.crop) || hasCrop('moderateMoisture', candidate.crop) ? 9 : 1;

      if (sunlight.includes('partial')) score += hasCrop('partialShade', candidate.crop) ? 6 : -3;
      else score += hasCrop('fullSun', candidate.crop) ? 6 : 2;

      if (season.includes('rain') || season.includes('wet')) score += hasCrop('wetSeason', candidate.crop) ? 8 : -2;
      else if (season.includes('dry')) score += hasCrop('drySeason', candidate.crop) ? 8 : -3;
      addScoreComponent(breakdown, 'Field conditions', score - fieldBefore);

      const nutrientBefore = score;
      if (nitrogen === 'low') score += normalizeCropName(candidate.crop) === 'mung bean' ? 7 : -2;
      if (phosphorus === 'low' && ['tomato', 'corn', 'sweet potato', 'onion'].includes(normalizeCropName(candidate.crop))) score -= 3;
      if (potassium === 'low' && ['tomato', 'cassava', 'sweet potato', 'banana', 'coconut', 'pineapple'].includes(normalizeCropName(candidate.crop))) score -= 4;
      addScoreComponent(breakdown, 'NPK nutrients', score - nutrientBefore);

      if (guardrail.penalty) {
        addScoreComponent(breakdown, 'Reading guardrails', -guardrail.penalty);
      }
      if ((payload.moisture_percent ?? 0) >= 65 && ['tomato', 'onion'].includes(normalizeCropName(candidate.crop))) {
        riskFlags.push('Current soil moisture may be too wet without raised beds or drainage.');
      }

      return {
        ...candidate,
        suitability: Math.max(20, Math.min(guardrail.cap, Math.round(score - guardrail.penalty))),
        suitability_cap: guardrail.cap,
        score_breakdown: breakdown,
        risk_flags: riskFlags,
      };
    })
    .sort((first, second) => second.suitability - first.suitability)
    .slice(0, 4);
  const best = recommendations[0];
  const locationLabel = payload.location_label || payload.province || null;

  return {
    generated_on: new Date().toISOString().slice(0, 10),
    province: payload.province,
    soil_type: payload.soil_type,
    ph_level: payload.ph_level,
    moisture_percent: payload.moisture_percent,
    soil_temperature_c: payload.soil_temperature_c,
    nitrogen_ppm: payload.nitrogen_ppm,
    phosphorus_ppm: payload.phosphorus_ppm,
    potassium_ppm: payload.potassium_ppm,
    best_crop: best.crop,
    confidence: Number((best.suitability / 100).toFixed(2)),
    soil_summary: buildOfflineSoilSummary(payload),
    recommendations,
    soil_warnings: guardrail.warnings,
    scan_valid: guardrail.warnings.length === 0,
    soil_actions: buildOfflineSoilActions(payload, guardrail.warnings),
    location: {
      label: locationLabel,
      latitude: payload.latitude,
      longitude: payload.longitude,
    },
    weather: null,
    weather_summary: null,
    recommendation_basis: [t('offlineRecommendationBasis')],
    recommendation_model: {
      source: 'offline-browser-rules',
      version: 'offline-rule-based-v2',
      accuracy: null,
      f1_score: null,
      top_3_accuracy: null,
      features: null,
    },
    offline: true,
  };
}

function hasUsableSoilScan(scan) {
  return getSoilInputErrors(scan?.inputs || scan).length === 0;
}

function makeHistoryId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildGpsErrorMessage(error, t) {
  if (!error) return t('couldNotAccessLocation');
  if (error.code === error.PERMISSION_DENIED) return t('locationAccessBlocked');
  if (error.code === error.POSITION_UNAVAILABLE) return t('locationUnavailable');
  if (error.code === error.TIMEOUT) return t('locationTimedOut');
  return t('couldNotAccessLocation');
}

function formatLocationMeta(location, t) {
  if (location?.latitude == null || location?.longitude == null) return t('allowGpsOrRegisterFarm');
  const coords = `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
  if (location.accuracy_m) {
    return `${coords} | +/-${Math.round(location.accuracy_m)}m`;
  }
  return coords;
}

function getCropCategory(cropName) {
  const crop = cropName.toLowerCase();
  if (crop.includes('rice') || crop.includes('corn')) return 'Grains';
  if (crop.includes('cassava') || crop.includes('sweet potato') || crop.includes('potato') || crop.includes('taro') || crop.includes('gabi')) return 'Root Crops';
  if (
    crop.includes('calamansi') ||
    crop.includes('banana') ||
    crop.includes('mango') ||
    crop.includes('coconut') ||
    crop.includes('pineapple') ||
    crop.includes('guava') ||
    crop.includes('cacao') ||
    crop.includes('coffee')
  ) return 'Fruits';
  if (crop.includes('sugarcane') || crop.includes('abaca')) return 'Field Crops';
  return 'Vegetables';
}

function translatedCategory(category, t) {
  const keys = {
    'All Crops': 'allCrops',
    Vegetables: 'vegetables',
    Grains: 'grains',
    Fruits: 'fruits',
    'Root Crops': 'rootCrops',
    'Field Crops': 'fieldCrops',
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
    modelConfidence: item.model_confidence,
    ruleSuitability: item.rule_suitability,
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
    return Array.isArray(scans) ? scans.filter(hasUsableSoilScan) : [];
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
    nitrogen_ppm: inputs.nitrogen_ppm ?? '',
    phosphorus_ppm: inputs.phosphorus_ppm ?? '',
    potassium_ppm: inputs.potassium_ppm ?? '',
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

function ResultPanel({ result, t }) {
  const confidence = result ? Math.round(result.confidence * 100) : 0;
  const topRecommendations = result?.recommendations || [];
  const warnings = result?.soil_warnings || [];

  return (
    <section className="surface overflow-hidden rounded-lg w-full">
      <div className="flex flex-col gap-5 border-b border-stone-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row items-start gap-4 w-full">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
            {result ? <CheckCircle2 className="h-6 w-6" /> : <Sprout className="h-6 w-6" />}
          </div>
          <div className="flex-1 w-full">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('bestCropForSoil')}</p>
            <h2 className="mt-1 text-2xl font-bold text-stone-950 sm:text-3xl">
              {result?.best_crop || t('readyToRecommend')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              {result?.soil_summary ? <TranslatedText text={result.soil_summary} /> : t('soilReadingsPrompt')}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-leaf-100 bg-leaf-50 px-5 py-3 text-center sm:w-auto w-full">
          <p className="text-3xl font-bold text-leaf-800">{confidence || '--'}%</p>
          <p className="text-xs font-bold uppercase tracking-wide text-leaf-700">{t('suitability')}</p>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mx-5 mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">{t('recheckSoilReadings')}</p>
          <ul className="mt-2 space-y-1">
            {warnings.map((warning) => <li key={warning}><TranslatedText text={warning} /></li>)}
          </ul>
        </div>
      )}

      <div className="p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('topMatches')}</h3>
        <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {topRecommendations.length > 0 ? (
            topRecommendations.slice(0, 3).map((item) => (
              <article key={item.crop} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold text-stone-950 truncate">{item.crop}</p>
                    <TranslatedText as="p" className="mt-1 text-sm leading-6 text-stone-600 line-clamp-2" text={item.planting_window} />
                  </div>
                  <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700 shrink-0">
                    {item.suitability}%
                  </span>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm font-semibold text-stone-500 md:col-span-3">
              {t('soilSuggestionsEmpty')}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SoilActions({ result, t }) {
  const actions = result?.soil_actions || [t('runSoilScanActions')];

  return (
    <section className="rounded-lg border border-leaf-100 bg-leaf-50 p-4 sm:p-5 w-full mt-6">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-leaf-700">
          <CalendarClock className="h-6 w-6" />
        </div>
        <div className="flex-1 w-full">
          <h2 className="text-xl font-bold text-leaf-950">{t('nextSoilActions')}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-leaf-900">
            {actions.map((action) => (
              <li key={action} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-700" />
                <TranslatedText text={action} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function HistoryList({ history, onSelect, t }) {
  const [showAll, setShowAll] = useState(false);
  const displayedHistory = showAll ? history : history.slice(0, 6);

  return (
    <section className="mt-8 w-full">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-950">{t('recentSoilScans')}</h2>
          <p className="text-sm text-stone-500">{t('savedForComparison')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {history.length >= 6 && (
            <button
              className="btn-secondary h-10 px-4 text-sm w-full sm:w-auto flex-1 sm:flex-none justify-center"
              onClick={() => setShowAll((current) => !current)}
              type="button"
            >
              {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showAll ? t('showLess') : t('showAll')}
            </button>
          )}
          <span className="w-fit rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-700 text-center">
            {history.length} {t('total')}
          </span>
        </div>
      </div>

      <div className="history-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        {displayedHistory.map((scan) => (
          <button
            key={scan.id}
            className="surface min-h-[132px] rounded-lg p-4 text-left transition hover:border-leaf-200 hover:bg-leaf-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300 w-full"
            onClick={() => onSelect(scan)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3 w-full">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400 truncate">{scan.soil_type}</p>
                <h3 className="mt-2 break-words text-lg font-bold text-stone-950 line-clamp-1">{scan.best_crop}</h3>
                <p className="mt-1 text-sm text-stone-500 truncate">{new Date(scan.created_at).toLocaleString()}</p>
                {(scan.location?.label || scan.province) && (
                  <p className="mt-1 text-xs font-semibold text-stone-500 truncate">{scan.location?.label || scan.province}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
                {Math.round(scan.confidence * 100)}%
              </span>
            </div>
          </button>
        ))}

        {history.length === 0 && (
          <div className="surface rounded-lg border-dashed p-6 text-center sm:col-span-2 lg:col-span-3 w-full">
            <ClipboardList className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-sm font-semibold text-stone-500">{t('noSoilScans')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function NutrientControl({ label, value, onChange, t }) {
  return (
    <div className="nutrient-control mb-4 w-full">
      <p className="nutrient-label text-sm font-bold text-stone-700 mb-2">{label}</p>
      <div className="nutrient-segmented flex flex-col sm:flex-row w-full rounded-lg border border-stone-200 overflow-hidden" role="group" aria-label={label}>
        {nutrientLevels.map(([level, text]) => (
          <button
            key={level}
            className={`nutrient-option flex-1 px-3 py-2.5 text-sm font-semibold text-center transition-colors border-b sm:border-b-0 sm:border-r last:border-0 border-stone-200 ${
              value === level ? 'nutrient-option-active bg-leaf-50 text-leaf-800' : 'nutrient-option-idle bg-white text-stone-600 hover:bg-stone-50'
            }`}
            onClick={() => onChange(level)}
            type="button"
            aria-pressed={value === level}
          >
            {t(level) || text}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldHelp({ children }) {
  return <p className="text-wrap-anywhere mt-1.5 text-xs leading-5 text-stone-500">{children}</p>;
}

function ManualFormSection({ title, body, children, className = '' }) {
  return (
    <section className={`manual-field-section space-y-4 mb-6 w-full ${className}`}>
      {(title || body) && (
        <div className="manual-section-heading mb-4">
          {title && <h3 className="text-base sm:text-lg font-bold text-stone-900">{title}</h3>}
          {body && <p className="mt-1 text-sm text-stone-500">{body}</p>}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}

function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number > 0 ? `+${number}` : `${number}`;
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
              <p className="mt-1 text-sm leading-6 text-stone-500">
                {translatedCategory(crop.variety, t)} | <TranslatedText text={crop.window} />
              </p>
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
      className={`surface flex h-full flex-col overflow-hidden rounded-[1rem] border w-full transition-shadow ${
        crop.isBestMatch
          ? 'crop-card-best-match border-leaf-300 bg-gradient-to-br from-leaf-50 via-white to-white ring-1 ring-leaf-100'
          : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex flex-1 flex-col p-4 sm:p-5 w-full">
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

        <div className="flex flex-col gap-4 min-[440px]:flex-row min-[440px]:items-start min-[440px]:justify-between w-full">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4 flex-1">
            <div className={`grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl ${crop.isBestMatch ? 'bg-leaf-100 text-leaf-700' : 'bg-leaf-50 text-leaf-600'}`}>
              <Leaf className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-lg sm:text-xl font-bold leading-tight tracking-tight text-stone-950 truncate">{crop.name}</h2>
              <p className="mt-0.5 text-xs sm:text-sm font-medium text-stone-500 truncate">{translatedCategory(crop.variety, t)}</p>
            </div>
          </div>
          <div className="text-left min-[440px]:text-right shrink-0">
            <p className={`text-2xl sm:text-3xl font-bold leading-none ${crop.isBestMatch ? 'text-leaf-700' : 'text-leaf-600'}`}>{crop.score}%</p>
            <p className="mt-1 text-[10px] sm:text-xs font-bold uppercase text-stone-500">{t('suitability')}</p>
          </div>
        </div>

        <div className="mt-5 sm:mt-6 h-2 rounded-full bg-leaf-50 w-full">
          <div className={`h-2 rounded-full ${crop.isBestMatch ? 'bg-leaf-700' : 'bg-leaf-500'}`} style={{ width: `${crop.score}%` }} />
        </div>

        <div className="mt-4 sm:mt-5 flex flex-wrap gap-2 w-full">
          {crop.tags.map((tag, index) => (
            <span
              key={tag}
              className={`rounded-full px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-semibold ${
                index === 0 ? 'bg-leaf-50 text-leaf-800' : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >
                {translatedTag(tag, t)}
            </span>
          ))}
        </div>

        <div className="my-4 sm:my-5 border-t border-dashed border-stone-200 w-full" />
        <div className="grid gap-2 text-xs sm:text-sm font-semibold text-stone-600 grid-cols-1 min-[460px]:grid-cols-[120px_minmax(0,1fr)] w-full">
          <span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4 shrink-0" /> {t('plantingWindow')}</span>
          <TranslatedText as="span" className="min-w-0 break-words min-[460px]:text-right" text={crop.window} />
        </div>

        <div className={`mt-4 sm:mt-5 rounded-xl p-3 sm:p-4 w-full ${crop.isBestMatch ? 'bg-leaf-50/80' : 'bg-leaf-50/60'}`}>
          <TranslatedText as="p" className="text-xs sm:text-sm leading-6 text-stone-700 line-clamp-3 sm:line-clamp-none" text={crop.guide} />
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-stone-100 px-4 py-3 sm:py-4 text-xs sm:text-sm min-[460px]:flex-row min-[460px]:items-center min-[460px]:justify-between sm:px-5 w-full bg-stone-50/50">
        <span className="inline-flex min-w-0 items-center gap-2 text-stone-500 flex-1">
          <Droplets className="h-4 w-4 shrink-0" />
          <span className="truncate">{weatherSummary ? <TranslatedText text={weatherSummary} /> : t('waitingLiveWeather')}</span>
        </span>
        <button className="inline-flex shrink-0 items-center gap-2 font-bold text-leaf-700 hover:text-leaf-800 justify-center w-full min-[460px]:w-auto" onClick={() => onGuide(crop)} type="button">
          {t('viewGuide')} <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </article>
  );
}

function RecommendationFeedback({ result, status, onFeedback, t }) {
  if (!result) return null;
  const disabled = !result.prediction_id || result.offline;

  return (
    <section className="surface rounded-lg p-4 sm:p-5 w-full mt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wide text-leaf-700">{t('recommendationFeedback')}</p>
          <h2 className="mt-1 text-lg sm:text-xl font-bold text-stone-950">{t('didRecommendationHelp')}</h2>
          <p className="mt-1 text-xs sm:text-sm leading-6 text-stone-500">
            {disabled ? t('feedbackNeedsSavedPrediction') : t('feedbackImprovesRecommendations')}
          </p>
          {status && <p className="mt-2 whitespace-pre-line text-sm font-semibold text-leaf-700">{status}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row w-full lg:w-auto shrink-0">
          <button
            className="btn-secondary h-10 px-4 text-sm w-full sm:w-auto justify-center"
            disabled={disabled}
            onClick={() => onFeedback('good')}
            type="button"
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            {t('workedWell')}
          </button>
          <button
            className="btn-secondary h-10 px-4 text-sm w-full sm:w-auto justify-center"
            disabled={disabled}
            onClick={() => onFeedback('poor')}
            type="button"
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            {t('poorFit')}
          </button>
        </div>
      </div>
    </section>
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
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All Crops');
  const [sortMode, setSortMode] = useState('Suitability');
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [audioStatus, setAudioStatus] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [locationState, setLocationState] = useState({
    locating: false,
    error: '',
    attempted: false,
    label: '',
    coords: null,
  });

  useEffect(() => {
    const handleOnlineChange = () => setOnline(navigator.onLine);

    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);
    return () => {
      window.removeEventListener('online', handleOnlineChange);
      window.removeEventListener('offline', handleOnlineChange);
    };
  }, []);

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

  const inputErrors = useMemo(() => getSoilInputErrors(form, t), [form, t]);
  const canSubmit = useMemo(() => Boolean(form.soil_type && inputErrors.length === 0), [form.soil_type, inputErrors.length]);

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
    setError('');
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
      nitrogen_ppm: parseOptionalNumber(form.nitrogen_ppm),
      phosphorus_ppm: parseOptionalNumber(form.phosphorus_ppm),
      potassium_ppm: parseOptionalNumber(form.potassium_ppm),
      drainage: form.drainage,
      sunlight: form.sunlight,
      season: form.season,
      province: form.province.trim() || null,
      latitude: locationState.coords?.latitude ?? null,
      longitude: locationState.coords?.longitude ?? null,
      location_label: locationState.coords ? locationState.label || t('currentDeviceLocation') : null,
    };
  }

  const requestCurrentLocation = useCallback((silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) {
        setLocationState((current) => ({
          ...current,
          locating: false,
          attempted: true,
          error: t('geolocationUnsupported'),
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
          label: t('currentDeviceLocation'),
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
          error: buildGpsErrorMessage(gpsError, t),
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [t]);

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
  }, [requestCurrentLocation]);

  function resetForm() {
    setForm(initialForm);
    setResult(null);
    setError('');
    setSelectedCrop(null);
    setAudioStatus('');
    setFeedbackStatus('');
    setActiveCategory('All Crops');
    setSortMode('Suitability');
  }

  function saveHistory(scan) {
    const next = [scan, ...history.filter((item) => item.id !== scan.id)].slice(0, 12);
    setHistory(next);
    localStorage.setItem('agriscan_soil_scans', JSON.stringify(next));
  }

  async function createOfflineRecommendation(payload) {
    setOfflineLoading(true);
    setAudioStatus(t('offlineSoilLoading'));

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      const scan = { ...buildOfflineCropRecommendation(payload, t), id: makeHistoryId(), created_at: new Date().toISOString(), inputs: payload };
      setResult(scan);
      setFeedbackStatus('');
      saveHistory(scan);
      setAudioStatus(t('offlineCropRecommendationReady'));
      return scan;
    } finally {
      setOfflineLoading(false);
    }
  }

  async function runRecommendation(payload) {
    setError('');
    if (!navigator.onLine) {
      setOnline(false);
      return createOfflineRecommendation(payload);
    }

    setLoading(true);
    setAudioStatus('');

    try {
      const response = await api.post('/predictions/soil-scan', payload);
      const scan = { ...response.data, id: makeHistoryId(), created_at: new Date().toISOString(), inputs: payload };
      setResult(scan);
      setFeedbackStatus('');
      saveHistory(scan);
      return scan;
    } catch (requestError) {
      if (!navigator.onLine || requestError?.code === 'ERR_NETWORK') {
        setOnline(navigator.onLine);
        return createOfflineRecommendation(payload);
      }
      setError(soilScanRequestErrorMessage(requestError, t('soilScanFailed')));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) {
      setError(buildDetailedAlert(
        'Manual Scan needs valid soil readings.',
        inputErrors[0] || t('enterValidSoilReadings'),
        'Correct the highlighted soil value, then submit the recommendation again.'
      ));
      return;
    }
    await runRecommendation(buildPayload());
  }

  function handleHistorySelect(scan) {
    setResult(scan);
    setForm(buildFormFromInputs(scan.inputs || scan));
    setLocationState(buildLocationStateFromScan(scan));
    setSelectedCrop(null);
    setAudioStatus('');
    setFeedbackStatus('');
  }

  async function submitRecommendationFeedback(outcome) {
    if (!result?.prediction_id || result?.offline) {
      setFeedbackStatus(t('feedbackNeedsSavedPrediction'));
      return;
    }

    const payload = {
      crop_name: result.best_crop,
      planted: outcome === 'good',
      outcome,
      rating: outcome === 'good' ? 5 : 2,
      notes: outcome === 'good' ? 'Recommendation worked well from Manual Scan.' : 'Recommendation was a poor fit from Manual Scan.',
    };

    try {
      await api.post(`/predictions/${result.prediction_id}/feedback`, payload);
      setFeedbackStatus(t('feedbackSaved'));
    } catch (feedbackError) {
      setFeedbackStatus(buildDetailedAlert(
        'Recommendation feedback could not be saved.',
        getApiErrorMessage(feedbackError, t('feedbackSaveFailed')),
        'Make sure this recommendation was saved online, then retry the feedback.'
      ));
    }
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

  const locationLabel = result?.location?.label || locationState.label || t('savedFarmLocationIfAvailable');
  const recommendationIntro = result?.soil_summary
    ? `Based on ${result.soil_summary.toLowerCase()}`
    : t('basedOnLatestSoilScan');
  const recommendationBusy = loading || offlineLoading;
  const recommendationLoadingText = offlineLoading ? t('offlineSoilLoading') : t('checkingSoil');

  return (
    <div className="page-stack flex flex-col gap-6 sm:gap-8 w-full">
      <CropGuideModal
        crop={selectedCrop}
        weatherSummary={result?.weather_summary}
        onClose={() => setSelectedCrop(null)}
        onPlayAudio={() => playAudioGuide(selectedCrop)}
        t={t}
      />

      <header className="manual-scan-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 w-full">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{t('manualSoilScan')}</p>
          <h1 className="mt-1 break-words text-2xl font-bold leading-tight tracking-normal text-stone-950 sm:text-3xl">
            {t('manualScanRecommendationsTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-stone-600 sm:text-base sm:leading-6">
            {t('manualScanRecommendationsBody')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
          <span className="status-pill border border-stone-200 bg-white text-stone-700">{form.soil_type}</span>
          <span className="status-pill bg-leaf-50 text-leaf-800">{result?.best_crop || t('ready')}</span>
        </div>
      </header>

      <div className="split-layout flex flex-col lg:flex-row gap-6 lg:gap-8 w-full items-start">
        <form
          onSubmit={submit}
          className="manual-scan-form surface flex flex-col overflow-hidden rounded-lg w-full lg:w-[420px] shrink-0 border border-stone-200 lg:self-start"
        >
          <div className="manual-scan-form-title flex items-start justify-between p-4 sm:p-5 border-b border-stone-100 bg-stone-50/50">
            <div className="flex min-w-0 items-start gap-3 flex-1">
              <span className="manual-scan-form-icon grid place-items-center h-10 w-10 shrink-0 bg-white border border-stone-200 rounded-lg text-stone-600">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="text-lg font-bold leading-tight text-stone-950 sm:text-xl">{t('soilDetails')}</h2>
                <p className="mt-1 text-xs sm:text-sm leading-5 text-stone-500">{t('soilDetailsBody')}</p>
              </div>
            </div>
            <button className="btn-icon shrink-0 p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors" type="button" onClick={resetForm} title={t('resetForm')}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="manual-scan-form-body">
            <ManualFormSection>
            <label className="block w-full">
              <span className="text-sm font-bold text-stone-700">{t('soilType')}</span>
              <select className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3" value={form.soil_type} onChange={(event) => updateField('soil_type', event.target.value)}>
                {soilOptions.map((soil) => <option key={soil}>{soil}</option>)}
              </select>
              <FieldHelp>{t('soilTypeHelp')}</FieldHelp>
            </label>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 w-full">
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('phLevel')}</span>
                <input
                  className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3"
                  inputMode="decimal"
                  max={soilInputLimits.ph_level.max}
                  min={soilInputLimits.ph_level.min}
                  placeholder="e.g. 6.5"
                  step="0.1"
                  type="number"
                  value={form.ph_level}
                  onChange={(event) => updateField('ph_level', event.target.value)}
                />
                <FieldHelp>{t('phHelp')}</FieldHelp>
              </label>
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('moisturePercent')}</span>
                <input
                  className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3"
                  inputMode="decimal"
                  max="100"
                  min={soilInputLimits.moisture_percent.min}
                  placeholder="e.g. 45"
                  step="1"
                  type="number"
                  value={form.moisture_percent}
                  onChange={(event) => updateField('moisture_percent', event.target.value)}
                />
                <FieldHelp>{t('moistureHelp')}</FieldHelp>
              </label>
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('soilTempShort')}</span>
                <input
                  className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3"
                  inputMode="decimal"
                  max={soilInputLimits.soil_temperature_c.max}
                  min={soilInputLimits.soil_temperature_c.min}
                  placeholder="e.g. 28"
                  step="0.1"
                  type="number"
                  value={form.soil_temperature_c}
                  onChange={(event) => updateField('soil_temperature_c', event.target.value)}
                />
                <FieldHelp>{t('soilTempHelp')}</FieldHelp>
              </label>
            </div>
            </ManualFormSection>

            <ManualFormSection title={t('nutrientLevel')}>
            <NutrientControl label={t('nitrogen')} value={form.nitrogen_level} onChange={(value) => updateField('nitrogen_level', value)} t={t} />
            <FieldHelp>{t('nitrogenHelp')}</FieldHelp>
            <NutrientControl label={t('phosphorus')} value={form.phosphorus_level} onChange={(value) => updateField('phosphorus_level', value)} t={t} />
            <FieldHelp>{t('phosphorusHelp')}</FieldHelp>
            <NutrientControl label={t('potassium')} value={form.potassium_level} onChange={(value) => updateField('potassium_level', value)} t={t} />
            <FieldHelp>{t('potassiumHelp')}</FieldHelp>

            <section className="manual-lab-panel mt-6 pt-5 border-t border-stone-100 w-full">
              <div>
                <p className="text-sm font-bold text-stone-900">{t('labNpkValues')}</p>
                <FieldHelp>{t('labNpkHelp')}</FieldHelp>
              </div>
              <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-3 w-full">
                <label className="block w-full">
                  <span className="text-xs font-bold uppercase tracking-wide text-stone-500">N ppm</span>
                  <input
                    className="field mt-1 h-11 w-full bg-white border border-stone-300 rounded-lg px-3"
                    inputMode="decimal"
                    min="0"
                    max="300"
                    placeholder="e.g. 55"
                    type="number"
                    value={form.nitrogen_ppm}
                    onChange={(event) => updateField('nitrogen_ppm', event.target.value)}
                  />
                </label>
                <label className="block w-full">
                  <span className="text-xs font-bold uppercase tracking-wide text-stone-500">P ppm</span>
                  <input
                    className="field mt-1 h-11 w-full bg-white border border-stone-300 rounded-lg px-3"
                    inputMode="decimal"
                    min="0"
                    max="300"
                    placeholder="e.g. 45"
                    type="number"
                    value={form.phosphorus_ppm}
                    onChange={(event) => updateField('phosphorus_ppm', event.target.value)}
                  />
                </label>
                <label className="block w-full">
                  <span className="text-xs font-bold uppercase tracking-wide text-stone-500">K ppm</span>
                  <input
                    className="field mt-1 h-11 w-full bg-white border border-stone-300 rounded-lg px-3"
                    inputMode="decimal"
                    min="0"
                    max="500"
                    placeholder="e.g. 120"
                    type="number"
                    value={form.potassium_ppm}
                    onChange={(event) => updateField('potassium_ppm', event.target.value)}
                  />
                </label>
              </div>
            </section>
            </ManualFormSection>

            <ManualFormSection title={t('fieldNotes')}>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 w-full">
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('drainage')}</span>
                <select className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3" value={form.drainage} onChange={(event) => updateField('drainage', event.target.value)}>
                  {drainageOptions.map(([value, label]) => <option key={value} value={value}>{t(value) || label}</option>)}
                </select>
                <FieldHelp>{t('drainageHelp')}</FieldHelp>
              </label>
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('sunlight')}</span>
                <select className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3" value={form.sunlight} onChange={(event) => updateField('sunlight', event.target.value)}>
                  {sunlightOptions.map(([value, label]) => <option key={value} value={value}>{value === 'full sun' ? t('fullSun') : value === 'partial shade' ? t('partialShade') : label}</option>)}
                </select>
                <FieldHelp>{t('sunlightHelp')}</FieldHelp>
              </label>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 w-full">
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('season')}</span>
                <select className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3" value={form.season} onChange={(event) => updateField('season', event.target.value)}>
                  {seasonOptions.map(([value, label]) => <option key={value} value={value}>{value === 'regular season' ? t('regular') : value === 'wet season' ? t('wetSeason') : value === 'dry season' ? t('drySeason') : label}</option>)}
                </select>
                <FieldHelp>{t('seasonHelp')}</FieldHelp>
              </label>
              <label className="block w-full">
                <span className="text-sm font-bold text-stone-700">{t('province')}</span>
                <input
                  className="field mt-2 h-12 w-full bg-white border border-stone-300 rounded-lg px-3"
                  placeholder="e.g. Nueva Ecija"
                  value={form.province}
                  onChange={(event) => updateField('province', event.target.value)}
                />
                <FieldHelp>{t('provinceGpsHelp')}</FieldHelp>
              </label>
            </div>

            <section className="manual-location-panel mt-6 pt-5 border-t border-stone-100 w-full">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between w-full">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-900">{t('currentLocation')}</p>
                  <p className="mt-1 text-sm text-stone-600 truncate">
                    {locationState.label || result?.location?.label || t('currentGpsNotCaptured')}
                  </p>
                  <p className="mt-1 text-xs text-stone-500 truncate">
                    {formatLocationMeta(locationState.coords || result?.location, t)}
                  </p>
                </div>
                <button className="btn-secondary h-10 px-4 text-sm w-full sm:w-auto shrink-0 justify-center" type="button" onClick={() => requestCurrentLocation()} disabled={locationState.locating}>
                  {locationState.locating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crosshair className="h-4 w-4 mr-2" />}
                  {locationState.locating ? t('locating') : t('useCurrentGps')}
                </button>
              </div>
              {locationState.error && <p className="mt-3 text-sm font-medium text-amber-700">{locationState.error}</p>}
            </section>
            </ManualFormSection>
          </div>

          <div className="manual-scan-submit mt-auto p-4 sm:p-5 bg-stone-50/50 border-t border-stone-100 space-y-4 w-full">
            {inputErrors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 w-full">
                <p className="font-bold">{t('checkSoilReadings')}</p>
                <ul className="mt-2 space-y-1 list-disc pl-4">
                  {inputErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}

            {error && <div className="w-full whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

            {offlineLoading ? (
              <div className="offline-loading-card w-full" role="status" aria-live="polite">
                <span className="offline-loading-pulse" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{t('offlineSoilLoading')}</p>
                  <p className="mt-1 text-xs leading-5">{t('offlineLoadingBody')}</p>
                </div>
              </div>
            ) : null}

            {!online && !offlineLoading && !error && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 w-full">
                {t('cropRecommendationOfflineMode')}
              </div>
            )}

            <button className="btn-primary h-12 w-full text-base justify-center font-bold" disabled={!canSubmit || recommendationBusy}>
              {recommendationBusy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sprout className="h-5 w-5 mr-2" />}
              {recommendationBusy ? recommendationLoadingText : t('recommendBestCrop')}
            </button>
          </div>
        </form>

        <div className="space-y-6 lg:space-y-8 flex-1 min-w-0 w-full">
          <ResultPanel result={result} t={t} />
          <RecommendationFeedback
            result={result}
            status={feedbackStatus}
            onFeedback={submitRecommendationFeedback}
            t={t}
          />

          <section className="rounded-lg border border-sky-100 bg-sky-50 p-4 sm:p-5 w-full">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wide text-sky-700">{t('locationAndWeather')}</p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-stone-900">
                  <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
                  <span className="truncate">{locationLabel}</span>
                </div>
                {result?.weather_summary ? (
                  <TranslatedText as="p" className="mt-1 text-xs sm:text-sm text-stone-600 line-clamp-2" text={result.weather_summary} />
                ) : (
                  <p className="mt-1 text-xs sm:text-sm text-stone-600">{t('currentLiveWeatherAfterSoil')}</p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
                <button className="btn-secondary h-10 w-full sm:w-auto px-4 text-sm justify-center" onClick={() => runRecommendation(buildPayload())} type="button" disabled={!canSubmit || recommendationBusy}>
                  {recommendationBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crosshair className="h-4 w-4 mr-2" />}
                  {recommendationBusy ? (offlineLoading ? t('offlineSoilLoading') : t('refreshing')) : t('refreshRecommendation')}
                </button>
                <button className="btn-secondary h-10 w-full sm:w-auto px-4 text-sm justify-center" onClick={cycleSortMode} type="button">
                  <Filter className="h-4 w-4 mr-2" />
                  {t('sort')}: {translatedSortMode(sortMode, t)}
                </button>
              </div>
            </div>
          </section>

          <section className="w-full">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wide text-leaf-700">{t('integratedRecommendations')}</p>
                <h2 className="mt-1 text-xl sm:text-2xl font-bold text-stone-950">{t('cropMatchesFromThisScan')}</h2>
                <TranslatedText
                  as="p"
                  className="mt-2 text-sm leading-6 text-stone-600"
                  text={`${recommendationIntro}. ${result?.weather_summary ? `${result.weather_summary}.` : ''} ${t('usingLocation', { location: locationLabel })}`}
                />
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full xl:w-auto shrink-0">
                <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 text-center w-full sm:w-auto truncate">
                  {result?.best_crop ? t('bestMatch', { crop: result.best_crop }) : t('runSoilScanPersonalize')}
                </span>
                <button className="btn-secondary h-10 px-4 text-sm w-full sm:w-auto justify-center" onClick={() => playAudioGuide()} type="button">
                  <Play className="h-4 w-4 mr-2" />
                  {t('playAudioGuide')}
                </button>
              </div>
            </div>

            <div className="pill-strip mb-6 flex overflow-x-auto gap-2 pb-2 w-full no-scrollbar snap-x">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`shrink-0 rounded-full px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold snap-start transition-all ${
                    activeCategory === item ? 'bg-leaf-600 text-white shadow-[0_8px_16px_rgba(22,163,74,0.18)]' : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                  onClick={() => setActiveCategory(item)}
                  type="button"
                >
                  {translatedCategory(item, t)}
                </button>
              ))}
            </div>

            {audioStatus && (
              <div className="mb-4 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800 w-full">
                {audioStatus}
              </div>
            )}

            {result ? (
              <div className="card-grid grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 w-full">
                {visibleCrops.map((crop) => (
                  <CropCard key={crop.id} crop={crop} onGuide={setSelectedCrop} weatherSummary={result?.weather_summary} t={t} />
                ))}
                {visibleCrops.length === 0 && (
                  <div className="surface rounded-lg p-8 text-center md:col-span-2 w-full">
                    <Leaf className="mx-auto h-10 w-10 text-stone-400" />
                    <p className="mt-3 font-bold text-stone-950">{t('noRecommendationsCategory')}</p>
                    <button className="btn-secondary mt-4 mx-auto" type="button" onClick={() => setActiveCategory('All Crops')}>{t('showAllCrops')}</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="surface rounded-lg border border-dashed border-leaf-200 bg-white p-6 sm:p-10 text-center w-full">
                <span className="mx-auto grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
                  <Sprout className="h-6 w-6 sm:h-7 sm:w-7" />
                </span>
                <p className="mt-4 text-base sm:text-lg font-bold text-stone-950">{t('recommendationsWillAppear')}</p>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-stone-500 px-4">{t('completeManualSoilScan')}</p>
              </div>
            )}
          </section>

          <SoilActions result={result} t={t} />

          <section className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-5 w-full mt-6">
            {[
              [FlaskConical, t('soilType'), form.soil_type],
              [Gauge, 'pH', form.ph_level || '--'],
              [Droplets, t('moisturePercent'), form.moisture_percent ? `${form.moisture_percent}%` : '--'],
              [Thermometer, t('soilTempShort'), form.soil_temperature_c ? `${form.soil_temperature_c}C` : '--'],
              [Sun, t('sunlight'), form.sunlight],
            ].map(([Icon, label, value]) => (
              <article key={label} className="surface rounded-lg p-4 sm:p-5 flex flex-col justify-between w-full h-full">
                <Icon className="h-5 w-5 text-leaf-600 shrink-0" />
                <div className="mt-3 sm:mt-4">
                  <p className="text-xs sm:text-sm font-bold uppercase tracking-wide text-stone-500 truncate">{label}</p>
                  <p className="mt-1 text-lg sm:text-xl font-bold capitalize text-stone-950 truncate">{value}</p>
                </div>
              </article>
            ))}
          </section>

          <HistoryList history={history} onSelect={handleHistorySelect} t={t} />
        </div>
      </div>
    </div>
  );
}
