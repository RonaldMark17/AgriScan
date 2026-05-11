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
import { api } from '../api/client.js';
import TranslatedText from '../components/shared/TranslatedText.jsx';
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
    <section className="surface overflow-hidden rounded-lg">
      <div className="flex flex-col gap-5 border-b border-stone-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
            {result ? <CheckCircle2 className="h-6 w-6" /> : <Sprout className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{t('bestCropForSoil')}</p>
            <h2 className="mt-1 text-2xl font-bold text-stone-950 sm:text-3xl">
              {result?.best_crop || t('readyToRecommend')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              {result?.soil_summary ? <TranslatedText text={result.soil_summary} /> : t('soilReadingsPrompt')}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-leaf-100 bg-leaf-50 px-5 py-3 text-center">
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
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {topRecommendations.length > 0 ? (
            topRecommendations.slice(0, 3).map((item) => (
              <article key={item.crop} className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-stone-950">{item.crop}</p>
                    <TranslatedText as="p" className="mt-1 text-sm leading-6 text-stone-600" text={item.planting_window} />
                  </div>
                  <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
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
    <section className="rounded-lg border border-leaf-100 bg-leaf-50 p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-leaf-700">
          <CalendarClock className="h-6 w-6" />
        </div>
        <div>
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
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-950">{t('recentSoilScans')}</h2>
          <p className="text-sm text-stone-500">{t('savedForComparison')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {history.length >= 6 && (
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
            {history.length} {t('total')}
          </span>
        </div>
      </div>

      <div className="history-grid">
        {displayedHistory.map((scan) => (
          <button
            key={scan.id}
            className="surface min-h-[132px] rounded-lg p-4 text-left transition hover:border-leaf-200 hover:bg-leaf-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-300"
            onClick={() => onSelect(scan)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{scan.soil_type}</p>
                <h3 className="mt-2 break-words text-lg font-bold text-stone-950">{scan.best_crop}</h3>
                <p className="mt-1 text-sm text-stone-500">{new Date(scan.created_at).toLocaleString()}</p>
                {(scan.location?.label || scan.province) && (
                  <p className="mt-1 text-xs font-semibold text-stone-500">{scan.location?.label || scan.province}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
                {Math.round(scan.confidence * 100)}%
              </span>
            </div>
          </button>
        ))}

        {history.length === 0 && (
          <div className="surface rounded-lg border-dashed p-6 text-center md:col-span-2">
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
            {t(level) || text}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldHelp({ children }) {
  return <p className="text-wrap-anywhere mt-1 text-[11px] leading-4 text-stone-500">{children}</p>;
}

function formatScoreValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number > 0 ? `+${number}` : `${number}`;
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
            <p className="mt-2 text-sm text-stone-500">{translatedCategory(crop.variety, t)} | <TranslatedText text={crop.window} /></p>
          </div>
          <button className="btn-icon shrink-0" type="button" onClick={onClose} aria-label={t('closeCropGuide')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-110px)] overflow-y-auto p-5 sm:p-6">
          <div className="rounded-lg bg-leaf-50/70 p-4">
            <TranslatedText as="p" className="text-sm leading-7 text-stone-700" text={crop.guide} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('watering')}</p>
              <TranslatedText as="p" className="mt-2 text-sm leading-6 text-stone-700" text={crop.watering} />
            </div>
            <div className="rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('fertilizer')}</p>
              <TranslatedText as="p" className="mt-2 text-sm leading-6 text-stone-700" text={crop.fertilizer} />
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50 p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-sky-700">{t('liveWeatherContext')}</p>
            {weatherSummary ? <TranslatedText as="p" className="mt-2 text-sm text-stone-700" text={weatherSummary} /> : <p className="mt-2 text-sm text-stone-700">{t('refreshWeatherContext')}</p>}
          </div>

          {crop.scoreBreakdown?.length > 0 && (
            <div className="mt-5 rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-stone-500">{t('scoreBreakdown')}</p>
              <div className="mt-3 space-y-2">
                {crop.scoreBreakdown.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900">{item.label}</p>
                      {item.detail && <TranslatedText as="p" className="mt-0.5 text-xs leading-5 text-stone-500" text={item.detail} />}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${Number(item.value) >= 0 ? 'bg-leaf-50 text-leaf-700' : 'bg-amber-50 text-amber-700'}`}>
                      {formatScoreValue(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {crop.riskFlags?.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-amber-800">{t('riskFlags')}</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-900">
                {crop.riskFlags.map((flag) => <li key={flag}><TranslatedText text={flag} /></li>)}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {crop.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-leaf-100 bg-leaf-50 px-3 py-1 text-sm font-semibold text-leaf-800">
                {translatedTag(tag, t)}
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

function CropCard({ crop, onGuide, weatherSummary, t }) {
  return (
    <article className="surface flex h-full flex-col overflow-hidden rounded-lg">
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-col gap-4 min-[440px]:flex-row min-[440px]:items-start min-[440px]:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-leaf-50 text-leaf-600">
              <Leaf className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-xl font-bold leading-tight text-stone-950">{crop.name}</h2>
              <p className="mt-0.5 text-sm text-stone-500">{translatedCategory(crop.variety, t)}</p>
            </div>
          </div>
          <div className="text-left min-[440px]:text-right">
            <p className="text-3xl font-bold leading-none text-leaf-600">{crop.score}%</p>
            <p className="mt-1 text-xs font-bold uppercase text-stone-500">{t('suitability')}</p>
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
                {translatedTag(tag, t)}
            </span>
          ))}
        </div>

        <div className="my-5 border-t border-dashed border-stone-200" />
        <div className="grid gap-2 text-sm font-semibold text-stone-600 min-[460px]:grid-cols-[120px_minmax(0,1fr)]">
          <span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" /> {t('plantingWindow')}</span>
          <TranslatedText as="span" className="min-w-0 break-words min-[460px]:text-right" text={crop.window} />
        </div>

        <div className="mt-5 rounded-lg bg-leaf-50/60 p-4">
          <TranslatedText as="p" className="text-sm leading-6 text-stone-700" text={crop.guide} />
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-stone-100 px-4 py-4 text-sm min-[460px]:flex-row min-[460px]:items-center min-[460px]:justify-between sm:px-5">
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

function RecommendationFeedback({ result, status, onFeedback, t }) {
  if (!result) return null;
  const disabled = !result.prediction_id || result.offline;

  return (
    <section className="surface rounded-lg p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-leaf-700">{t('recommendationFeedback')}</p>
          <h2 className="mt-1 text-xl font-bold text-stone-950">{t('didRecommendationHelp')}</h2>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            {disabled ? t('feedbackNeedsSavedPrediction') : t('feedbackImprovesRecommendations')}
          </p>
          {status && <p className="mt-2 text-sm font-semibold text-leaf-700">{status}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="btn-secondary h-10 px-4 text-sm"
            disabled={disabled}
            onClick={() => onFeedback('good')}
            type="button"
          >
            <ThumbsUp className="h-4 w-4" />
            {t('workedWell')}
          </button>
          <button
            className="btn-secondary h-10 px-4 text-sm"
            disabled={disabled}
            onClick={() => onFeedback('poor')}
            type="button"
          >
            <ThumbsDown className="h-4 w-4" />
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

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSelectedCrop(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  async function runRecommendation(payload) {
    setError('');
    if (!navigator.onLine) {
      setOnline(false);
      const scan = { ...buildOfflineCropRecommendation(payload, t), id: makeHistoryId(), created_at: new Date().toISOString(), inputs: payload };
      setResult(scan);
      setFeedbackStatus('');
      saveHistory(scan);
      setAudioStatus(t('offlineCropRecommendationReady'));
      return scan;
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
        const scan = { ...buildOfflineCropRecommendation(payload, t), id: makeHistoryId(), created_at: new Date().toISOString(), inputs: payload };
        setResult(scan);
        setFeedbackStatus('');
        saveHistory(scan);
        setAudioStatus(t('offlineCropRecommendationReady'));
        return scan;
      }
      setError(getApiErrorMessage(requestError, t('soilScanFailed')));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) {
      setError(inputErrors[0] || t('enterValidSoilReadings'));
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
      setFeedbackStatus(getApiErrorMessage(feedbackError, t('feedbackSaveFailed')));
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

  return (
    <div className="page-stack">
      <CropGuideModal
        crop={selectedCrop}
        weatherSummary={result?.weather_summary}
        onClose={() => setSelectedCrop(null)}
        onPlayAudio={() => playAudioGuide(selectedCrop)}
        t={t}
      />

      <header className="manual-scan-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{t('manualSoilScan')}</p>
          <h1 className="mt-1 break-words text-[1.35rem] font-bold leading-tight tracking-normal text-stone-950 sm:text-3xl">
            {t('manualScanRecommendationsTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-5 text-stone-600 sm:text-sm sm:leading-6">
            {t('manualScanRecommendationsBody')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="status-pill border border-stone-200 bg-white text-stone-700">{form.soil_type}</span>
          <span className="status-pill bg-leaf-50 text-leaf-800">{result?.best_crop || t('ready')}</span>
        </div>
      </header>

      <div className="split-layout">
        <form onSubmit={submit} className="manual-scan-form surface rounded-lg p-3.5 sm:p-5 xl:sticky sticky-panel xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-stone-950 sm:text-xl">{t('soilDetails')}</h2>
              <p className="mt-1 text-sm text-stone-500">{t('soilDetailsBody')}</p>
            </div>
            <button className="btn-icon" type="button" onClick={resetForm} title={t('resetForm')}>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-stone-700">{t('soilType')}</span>
              <select className="field mt-2 h-12" value={form.soil_type} onChange={(event) => updateField('soil_type', event.target.value)}>
                {soilOptions.map((soil) => <option key={soil}>{soil}</option>)}
              </select>
              <FieldHelp>{t('soilTypeHelp')}</FieldHelp>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('phLevel')}</span>
                <input
                  className="field mt-2 h-12"
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
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('moisturePercent')}</span>
                <input
                  className="field mt-2 h-12"
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
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('soilTempShort')}</span>
                <input
                  className="field mt-2 h-12"
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

            <NutrientControl label={t('nitrogen')} value={form.nitrogen_level} onChange={(value) => updateField('nitrogen_level', value)} t={t} />
            <FieldHelp>{t('nitrogenHelp')}</FieldHelp>
            <NutrientControl label={t('phosphorus')} value={form.phosphorus_level} onChange={(value) => updateField('phosphorus_level', value)} t={t} />
            <FieldHelp>{t('phosphorusHelp')}</FieldHelp>
            <NutrientControl label={t('potassium')} value={form.potassium_level} onChange={(value) => updateField('potassium_level', value)} t={t} />
            <FieldHelp>{t('potassiumHelp')}</FieldHelp>

            <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <div>
                <p className="text-sm font-bold text-stone-900">{t('labNpkValues')}</p>
                <FieldHelp>{t('labNpkHelp')}</FieldHelp>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-stone-500">N ppm</span>
                  <input
                    className="field mt-1 h-11 bg-white"
                    inputMode="decimal"
                    min="0"
                    max="300"
                    placeholder="e.g. 55"
                    type="number"
                    value={form.nitrogen_ppm}
                    onChange={(event) => updateField('nitrogen_ppm', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-stone-500">P ppm</span>
                  <input
                    className="field mt-1 h-11 bg-white"
                    inputMode="decimal"
                    min="0"
                    max="300"
                    placeholder="e.g. 45"
                    type="number"
                    value={form.phosphorus_ppm}
                    onChange={(event) => updateField('phosphorus_ppm', event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-stone-500">K ppm</span>
                  <input
                    className="field mt-1 h-11 bg-white"
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('drainage')}</span>
                <select className="field mt-2 h-12" value={form.drainage} onChange={(event) => updateField('drainage', event.target.value)}>
                  {drainageOptions.map(([value, label]) => <option key={value} value={value}>{t(value) || label}</option>)}
                </select>
                <FieldHelp>{t('drainageHelp')}</FieldHelp>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('sunlight')}</span>
                <select className="field mt-2 h-12" value={form.sunlight} onChange={(event) => updateField('sunlight', event.target.value)}>
                  {sunlightOptions.map(([value, label]) => <option key={value} value={value}>{value === 'full sun' ? t('fullSun') : value === 'partial shade' ? t('partialShade') : label}</option>)}
                </select>
                <FieldHelp>{t('sunlightHelp')}</FieldHelp>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('season')}</span>
                <select className="field mt-2 h-12" value={form.season} onChange={(event) => updateField('season', event.target.value)}>
                  {seasonOptions.map(([value, label]) => <option key={value} value={value}>{value === 'regular season' ? t('regular') : value === 'wet season' ? t('wetSeason') : value === 'dry season' ? t('drySeason') : label}</option>)}
                </select>
                <FieldHelp>{t('seasonHelp')}</FieldHelp>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-stone-700">{t('province')}</span>
                <input
                  className="field mt-2 h-12"
                  placeholder="e.g. Nueva Ecija"
                  value={form.province}
                  onChange={(event) => updateField('province', event.target.value)}
                />
                <FieldHelp>{t('provinceGpsHelp')}</FieldHelp>
              </label>
            </div>

            <section className="rounded-lg border border-sky-100 bg-sky-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-stone-900">{t('currentLocation')}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {locationState.label || result?.location?.label || t('currentGpsNotCaptured')}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatLocationMeta(locationState.coords || result?.location, t)}
                  </p>
                </div>
                <button className="btn-secondary h-10 px-4 text-sm" type="button" onClick={() => requestCurrentLocation()} disabled={locationState.locating}>
                  {locationState.locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  {locationState.locating ? t('locating') : t('useCurrentGps')}
                </button>
              </div>
              {locationState.error && <p className="mt-3 text-sm font-medium text-amber-700">{locationState.error}</p>}
            </section>
          </div>

          {inputErrors.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
              <p className="font-bold">{t('checkSoilReadings')}</p>
              <ul className="mt-2 space-y-1">
                {inputErrors.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          )}

          {error && <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

          {!online && !error && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              {t('cropRecommendationOfflineMode')}
            </div>
          )}

          <button className="btn-primary mt-6 h-12 w-full text-base" disabled={!canSubmit || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
            {loading ? t('checkingSoil') : t('recommendBestCrop')}
          </button>
        </form>

        <div className="space-y-6">
          <ResultPanel result={result} t={t} />
          <RecommendationFeedback
            result={result}
            status={feedbackStatus}
            onFeedback={submitRecommendationFeedback}
            t={t}
          />

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
              <div className="flex flex-wrap gap-3">
                <button className="btn-secondary h-10 w-full px-4 text-sm sm:w-auto" onClick={() => runRecommendation(buildPayload())} type="button" disabled={!canSubmit || loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  {loading ? t('refreshing') : t('refreshRecommendation')}
                </button>
                <button className="btn-secondary h-10 w-full px-4 text-sm sm:w-auto" onClick={cycleSortMode} type="button">
                  <Filter className="h-4 w-4" />
                  {t('sort')}: {translatedSortMode(sortMode, t)}
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-leaf-700">{t('integratedRecommendations')}</p>
                <h2 className="mt-1 text-2xl font-bold text-stone-950">{t('cropMatchesFromThisScan')}</h2>
                <TranslatedText
                  as="p"
                  className="mt-2 text-sm leading-6 text-stone-600"
                  text={`${recommendationIntro}. ${result?.weather_summary ? `${result.weather_summary}.` : ''} ${t('usingLocation', { location: locationLabel })}`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700">
                  {result?.best_crop ? t('bestMatch', { crop: result.best_crop }) : t('runSoilScanPersonalize')}
                </span>
                <button className="btn-secondary h-10 px-4 text-sm" onClick={() => playAudioGuide()} type="button">
                  <Play className="h-4 w-4" />
                  {t('playAudioGuide')}
                </button>
              </div>
            </div>

            <div className="pill-strip mb-6">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`shrink-0 rounded-full px-6 py-3 text-sm font-semibold ${
                    activeCategory === item ? 'bg-leaf-600 text-white shadow-[0_8px_16px_rgba(22,163,74,0.18)]' : 'border border-stone-200 bg-white text-stone-600'
                  }`}
                  onClick={() => setActiveCategory(item)}
                  type="button"
                >
                  {translatedCategory(item, t)}
                </button>
              ))}
            </div>

            {audioStatus && (
              <div className="mb-4 rounded-lg border border-leaf-100 bg-leaf-50 px-4 py-3 text-sm font-semibold text-leaf-800">
                {audioStatus}
              </div>
            )}

            {result ? (
              <div className="card-grid">
                {visibleCrops.map((crop) => (
                  <CropCard key={crop.id} crop={crop} onGuide={setSelectedCrop} weatherSummary={result?.weather_summary} t={t} />
                ))}
                {visibleCrops.length === 0 && (
                  <div className="surface rounded-lg p-8 text-center xl:col-span-2">
                    <Leaf className="mx-auto h-10 w-10 text-stone-400" />
                    <p className="mt-3 font-bold text-stone-950">{t('noRecommendationsCategory')}</p>
                    <button className="btn-secondary mt-4" type="button" onClick={() => setActiveCategory('All Crops')}>{t('showAllCrops')}</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="surface rounded-lg border border-dashed border-leaf-200 bg-white p-8 text-center sm:p-10">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-leaf-50 text-leaf-700">
                  <Sprout className="h-7 w-7" />
                </span>
                <p className="mt-4 text-lg font-bold text-stone-950">{t('recommendationsWillAppear')}</p>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-stone-500">{t('completeManualSoilScan')}</p>
              </div>
            )}
          </section>

          <SoilActions result={result} t={t} />

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {[
              [FlaskConical, t('soilType'), form.soil_type],
              [Gauge, 'pH', form.ph_level || '--'],
              [Droplets, t('moisturePercent'), form.moisture_percent ? `${form.moisture_percent}%` : '--'],
              [Thermometer, t('soilTempShort'), form.soil_temperature_c ? `${form.soil_temperature_c}C` : '--'],
              [Sun, t('sunlight'), form.sunlight],
            ].map(([Icon, label, value]) => (
              <article key={label} className="surface rounded-lg p-5">
                <Icon className="h-5 w-5 text-leaf-600" />
                <p className="mt-4 text-sm font-bold uppercase tracking-wide text-stone-500">{label}</p>
                <p className="mt-1 text-xl font-bold capitalize text-stone-950">{value}</p>
              </article>
            ))}
          </section>

          <HistoryList history={history} onSelect={handleHistorySelect} t={t} />
        </div>
      </div>
    </div>
  );
}
