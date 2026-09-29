// Translations (docs/v2/PLAN.md 4.9). Keys are typed from pl.json (see
// i18next.d.ts), so a misspelled key is a compile error. Strings are added here
// as v2 screens need them, reusing the wording of v1's i18n-resources.js.
import i18next from 'i18next';
import en from './en.json';
import pl from './pl.json';

export const LANGUAGES = ['pl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** v1 stores the chosen language under this key; v2 starts from it. */
export const V1_LANG_STORAGE_KEY = 'lifexp-lang';

export function pickLanguage(stored: string | null): Language {
  return stored === 'en' ? 'en' : 'pl';
}

export function initI18n(lng: Language): void {
  void i18next.init({
    lng,
    fallbackLng: 'pl',
    resources: { pl: { translation: pl }, en: { translation: en } },
    // Preact escapes text itself.
    interpolation: { escapeValue: false },
    // Resources are bundled: initialise synchronously, before the first render.
    initAsync: false,
  });
}

export const t = i18next.t.bind(i18next);
