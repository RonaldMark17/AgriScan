import { getApps, initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { api } from '../api/client.js';

const FIREBASE_PHONE_APP_NAME = 'agriscan-firebase-phone';
const RECAPTCHA_CONTAINER_ID = 'firebase-phone-recaptcha';

let recaptchaVerifier = null;
let confirmationResult = null;

async function getFirebaseConfig() {
  const { data } = await api.get('/notifications/push/config');
  const firebaseConfig = data?.firebase_config || null;
  if (!firebaseConfig || !data?.enabled) {
    const error = new Error('Firebase is not configured.');
    error.code = 'FIREBASE_NOT_CONFIGURED';
    throw error;
  }
  return firebaseConfig;
}

function getFirebaseApp(firebaseConfig) {
  const existing = getApps().find((app) => app.name === FIREBASE_PHONE_APP_NAME);
  return existing || initializeApp(firebaseConfig, FIREBASE_PHONE_APP_NAME);
}

function resetRecaptcha() {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // Firebase may already have disposed of the verifier.
    }
  }
  recaptchaVerifier = null;
}

function getRecaptchaVerifier(auth) {
  const container = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (!container) {
    throw new Error('Firebase reCAPTCHA container is missing.');
  }

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, {
      size: 'invisible',
    });
  }
  return recaptchaVerifier;
}

export function firebasePhoneRecaptchaContainerId() {
  return RECAPTCHA_CONTAINER_ID;
}

export function firebasePhoneAuthTroubleshootingAction(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code.includes('configuration-not-found') || message.includes('configuration-not-found')) {
    return 'Firebase Authentication is not initialized for this project. Enable billing/Blaze, then enable Authentication > Sign-in method > Phone in Firebase Console.';
  }
  if (code.includes('operation-not-allowed') || message.includes('operation-not-allowed')) {
    return 'Enable Authentication > Sign-in method > Phone in Firebase Console, then retry.';
  }
  if (code.includes('billing') || message.includes('BILLING_NOT_ENABLED')) {
    return 'Link a Cloud Billing account to this Firebase project, then retry Firebase Phone Auth.';
  }
  return 'Check Firebase Phone sign-in, billing, SMS region policy, reCAPTCHA, and the phone format, then try again.';
}

export async function sendFirebasePhoneVerificationCode(phone) {
  const firebaseConfig = await getFirebaseConfig();
  const auth = getAuth(getFirebaseApp(firebaseConfig));
  auth.useDeviceLanguage();

  try {
    confirmationResult = await signInWithPhoneNumber(auth, phone, getRecaptchaVerifier(auth));
    return true;
  } catch (error) {
    resetRecaptcha();
    throw error;
  }
}

export async function confirmFirebasePhoneVerificationCode(code) {
  if (!confirmationResult) {
    throw new Error('Send a Firebase verification code first.');
  }

  const credential = await confirmationResult.confirm(code);
  confirmationResult = null;
  return credential.user.getIdToken();
}
