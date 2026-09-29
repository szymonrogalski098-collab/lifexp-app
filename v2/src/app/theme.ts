// Applies the theme preference to <html> and keeps it in sync with the device
// setting. The same rules run once before first paint in index.html.
import { effect, signal } from '@preact/signals';
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

export function setThemePreference(pref: ThemePreference): void {
  themePreference.value = pref;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, serializePreference(pref));
  } catch {
    // not persisted; the choice still applies for this session
  }
}

/** Keeps data-theme/data-mode and the browser UI color up to date. Returns a stop function. */
export function startThemeSync(root: HTMLElement = document.documentElement): () => void {
  return effect(() => {
    const { family, mode } = resolveTheme(themePreference.value, systemPrefersDark.value);
    root.dataset.theme = family;
    root.dataset.mode = mode;
    const background = getComputedStyle(root).getPropertyValue('--color-bg').trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  });
}
