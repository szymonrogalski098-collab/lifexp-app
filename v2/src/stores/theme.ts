// The theme preference as app state: read once from storage (v2 key, else the v1
// choice), changed from settings, persisted per device. Applying it to the page
// is app/theme.ts's job.
import { computed, signal } from '@preact/signals';
import {
  parseStoredPreference,
  resolveTheme,
  serializePreference,
  THEME_STORAGE_KEY,
  V1_THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, policies)
  }
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const systemPrefersDark = signal(darkQuery.matches);
darkQuery.addEventListener('change', (e) => {
  systemPrefersDark.value = e.matches;
});

export const themePreference = signal<ThemePreference>(
  parseStoredPreference(readStorage(THEME_STORAGE_KEY), readStorage(V1_THEME_STORAGE_KEY)),
);

/** Family and the concrete light/dark mode currently shown. */
export const resolvedTheme = computed(() => resolveTheme(themePreference.value, systemPrefersDark.value));

export function setThemePreference(pref: ThemePreference): void {
  themePreference.value = pref;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, serializePreference(pref));
  } catch {
    // not persisted; the choice still applies for this session
  }
}
