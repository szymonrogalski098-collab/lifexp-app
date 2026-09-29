// Translations (docs/v2/PLAN.md 4.9). Keys are typed from pl.json (see
// i18next.d.ts), so a misspelled key is a compile error. Strings are added here
// as v2 screens need them, reusing the wording of v1's i18n-resources.js.
import { signal } from '@preact/signals';
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

/** The active language. Reading it subscribes a component, so a change re-renders the app. */
export const language = signal<Language>('pl');

export function initI18n(lng: Language): void {
  language.value = lng;
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

/** Switch language at runtime (the profile's choice wins over the device's, as in v1). */
export function setLanguage(lng: Language): void {
  // peek(): callable from an effect without subscribing it to the language.
  if (language.peek() === lng) return;
  void i18next.changeLanguage(lng);
  language.value = lng;
}

export const t = i18next.t.bind(i18next);
