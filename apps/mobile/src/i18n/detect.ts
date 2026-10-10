import type { Language } from '@/stores/preferences';

/** Turkish is the default (APP.md §0); English is used only when the device asks for it. */
export function detectLanguage(languageCode: string | null | undefined): Language {
  return languageCode === 'en' ? 'en' : 'tr';
}
