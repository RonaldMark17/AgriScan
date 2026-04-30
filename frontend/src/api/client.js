import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
const ACCESS_STORAGE_KEY = 'agriscan_access';
let publicConfigPromise = null;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function setAccessToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

if (typeof window !== 'undefined') {
  setAccessToken(window.localStorage.getItem(ACCESS_STORAGE_KEY));
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function getPublicConfig() {
  if (!publicConfigPromise) {
    publicConfigPromise = api
      .get('/system/public-config')
      .then(({ data }) => data || {})
      .catch(() => ({}));
  }
  return publicConfigPromise;
}

export async function getVapidPublicKey() {
  if (import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY;
  }
  const config = await getPublicConfig();
  return config.vapid_public_key || '';
}
