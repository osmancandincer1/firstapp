import { getLocales } from 'expo-localization';
import { create } from 'zustand';

import { detectLanguage } from '@/i18n/detect';

export type ThemePreference = 'system' | 'night' | 'day';
export type Language = 'tr' | 'en';
/** "system" follows the OS setting; "on"/"off" override it (APP.md §10, Görünüm). */
export type ReduceMotionPreference = 'system' | 'on' | 'off';

interface PreferencesState {
  theme: ThemePreference;
  language: Language;
  reduceMotion: ReduceMotionPreference;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Language) => void;
  setReduceMotion: (value: ReduceMotionPreference) => void;
}

/**
 * Device-local display preferences. Phase 0 keeps them in memory only;
 * server sync (AYR-01) arrives with the settings work in Phase 7.
 */
export const usePreferences = create<PreferencesState>((set) => ({
  // "Alev" is the app's only look for now (D-065); Day stays for the dev showcase.
  theme: 'night',
  language: detectLanguage(getLocales()[0]?.languageCode),
  reduceMotion: 'system',
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
}));
