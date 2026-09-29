// Applies the theme (stores/theme.ts) to <html> and the browser UI color. The same
// rules run once before first paint in index.html.
import { effect } from '@preact/signals';
import { resolvedTheme } from '@/stores/theme';

/** Keeps data-theme/data-mode and <meta name="theme-color"> up to date. Returns a stop function. */
export function startThemeSync(root: HTMLElement = document.documentElement): () => void {
  return effect(() => {
    const { family, mode } = resolvedTheme.value;
    root.dataset.theme = family;
    root.dataset.mode = mode;
    const background = getComputedStyle(root).getPropertyValue('--color-bg').trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  });
}
