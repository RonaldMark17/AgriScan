import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useI18n } from './I18nContext.jsx';

const VoiceContext = createContext(null);

const STORAGE_KEYS = {
  voiceAssistant: 'agriscan_voice_assistant',
  voiceTutorials: 'agriscan_voice_tutorials',
};

function readStoredBoolean(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === 'true';
}

function speechLanguage(language) {
  return language === 'fil' ? 'fil-PH' : 'en-US';
}

function preferredVoice(language) {
  const voices = window.speechSynthesis.getVoices();
  const preferredCodes = language === 'fil' ? ['fil-ph', 'tl-ph', 'fil', 'tl'] : ['en-us', 'en'];
  return (
    voices.find((voice) => preferredCodes.includes(voice.lang.toLowerCase())) ||
    voices.find((voice) => preferredCodes.some((code) => voice.lang.toLowerCase().startsWith(code)))
  );
}

export function VoiceProvider({ children }) {
  const { language } = useI18n();
  const [settings, setSettings] = useState(() => ({
    voiceAssistant: readStoredBoolean(STORAGE_KEYS.voiceAssistant, true),
    voiceTutorials: readStoredBoolean(STORAGE_KEYS.voiceTutorials, true),
  }));

  const updateVoiceSetting = useCallback((key, value) => {
    const nextValue = Boolean(value);
    setSettings((current) => ({ ...current, [key]: nextValue }));
    window.localStorage.setItem(STORAGE_KEYS[key], String(nextValue));
    window.dispatchEvent(new CustomEvent('agriscan:voice-settings-changed', { detail: { key, value: nextValue } }));
  }, []);

  useEffect(() => {
    function syncFromStorage(event) {
      if (event.type === 'storage' && !Object.values(STORAGE_KEYS).includes(event.key)) return;
      setSettings({
        voiceAssistant: readStoredBoolean(STORAGE_KEYS.voiceAssistant, true),
        voiceTutorials: readStoredBoolean(STORAGE_KEYS.voiceTutorials, true),
      });
    }

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('agriscan:voice-settings-changed', syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('agriscan:voice-settings-changed', syncFromStorage);
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speak = useCallback(
    (message, options = {}) => {
      const kind = options.kind || 'assistant';
      const enabled = kind === 'tutorial' ? settings.voiceTutorials : settings.voiceAssistant;
      if (!enabled && !options.force) return { ok: false, reason: 'disabled' };
      if (!message || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
        return { ok: false, reason: 'unsupported' };
      }

      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(message);
      const voice = preferredVoice(language);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.lang = voice?.lang || speechLanguage(language);
      utterance.rate = options.rate || 0.95;
      utterance.pitch = options.pitch || 1;
      utterance.onstart = options.onStart || null;
      utterance.onend = options.onEnd || null;
      utterance.onerror = options.onError || null;
      window.speechSynthesis.speak(utterance);
      return { ok: true };
    },
    [language, settings.voiceAssistant, settings.voiceTutorials]
  );

  const value = useMemo(
    () => ({
      voiceAssistantEnabled: settings.voiceAssistant,
      voiceTutorialsEnabled: settings.voiceTutorials,
      speechSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
      setVoiceAssistantEnabled: (enabled) => updateVoiceSetting('voiceAssistant', enabled),
      setVoiceTutorialsEnabled: (enabled) => updateVoiceSetting('voiceTutorials', enabled),
      speak,
      stopSpeaking,
    }),
    [settings.voiceAssistant, settings.voiceTutorials, speak, stopSpeaking, updateVoiceSetting]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  return useContext(VoiceContext);
}
