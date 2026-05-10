const GENERIC_DEVICE_NAMES = new Set(['agriscan pwa', 'pwa', 'unknown device']);

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isGenericDeviceName(value) {
  const normalized = cleanText(value).toLowerCase();
  return !normalized || GENERIC_DEVICE_NAMES.has(normalized);
}

function browserFromBrands(brands = []) {
  const brandNames = brands.map((brand) => cleanText(brand?.brand).toLowerCase()).filter(Boolean);
  if (brandNames.some((brand) => brand.includes('microsoft edge'))) return 'Microsoft Edge';
  if (brandNames.some((brand) => brand.includes('google chrome'))) return 'Chrome';
  if (brandNames.some((brand) => brand === 'chromium')) return 'Chromium';
  return '';
}

function browserFromUserAgent(userAgent = '', brands = []) {
  const brandName = browserFromBrands(brands);
  if (brandName) return brandName;
  if (!userAgent) return '';

  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/OPR\//.test(userAgent) || /Opera/.test(userAgent)) return 'Opera';
  if (/CriOS\//.test(userAgent) || /Chrome\//.test(userAgent)) return 'Chrome';
  if (/FxiOS\//.test(userAgent) || /Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Browser';
}

function osFromUserAgent(userAgent = '', platform = '') {
  const source = `${platform} ${userAgent}`.toLowerCase();
  if (source.includes('iphone')) return 'iPhone';
  if (source.includes('ipad')) return 'iPad';
  if (source.includes('android')) return 'Android';
  if (source.includes('windows')) return 'Windows';
  if (source.includes('macintosh') || source.includes('mac os')) return 'macOS';
  if (source.includes('linux')) return 'Linux';
  return '';
}

function deviceNameFromParts({ userAgent = '', platform = '', model = '', brands = [] } = {}) {
  const modelName = cleanText(model);
  const browserName = browserFromUserAgent(userAgent, brands);
  const osName = osFromUserAgent(userAgent, platform);

  if (modelName && browserName && osName) return `${modelName} (${browserName} on ${osName})`;
  if (modelName) return modelName;
  if (browserName && osName) return `${browserName} on ${osName}`;
  if (osName) return `${osName} device`;
  return browserName;
}

export function deviceNameFromUserAgent(userAgent) {
  return deviceNameFromParts({ userAgent });
}

export function getFallbackDeviceName() {
  if (typeof navigator === 'undefined') return 'Unknown device';
  return deviceNameFromParts({
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    brands: navigator.userAgentData?.brands || [],
  }) || 'Unknown device';
}

export async function getCurrentDeviceName() {
  if (typeof navigator === 'undefined') return 'Unknown device';

  const userAgentData = navigator.userAgentData;
  let platform = navigator.platform || '';
  let model = '';
  let brands = userAgentData?.brands || [];

  if (userAgentData?.getHighEntropyValues) {
    try {
      const values = await userAgentData.getHighEntropyValues(['platform', 'model']);
      platform = values.platform || platform;
      model = values.model || model;
      brands = values.brands || brands;
    } catch {
      // The browser may block high-entropy values; the user agent fallback is enough.
    }
  }

  return deviceNameFromParts({
    userAgent: navigator.userAgent || '',
    platform,
    model,
    brands,
  }) || 'Unknown device';
}
