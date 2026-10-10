import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { Language } from '@/stores/preferences';
import en from './en.json';
import tr from './tr.json';

export { detectLanguage } from './detect';

export const resources = { tr: { translation: tr }, en: { translation: en } } as const;

export function initI18n(language: Language) {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: 'tr',
      interpolation: { escapeValue: false },
      initAsync: false,
    });
  }
  return i18n;
}

export default i18n;
