// Installs v2's Service Worker (src/sw.ts) and recovers from a deploy that happened
// while the page was open (docs/v2/PLAN.md 4.8, stage 1f).

/** Production builds only: the dev server has no sw.js. Failure (private mode, blocked) is harmless. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Relative to this page, so the scope is /lifexp-app/v2/ (or the test server's folder).
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
}

const RELOADED_AT_KEY = 'lifexp-v2-stale-reload';
/** A reload that did not help within this window is not retried: the screen shows its own error. */
const RELOAD_GUARD_MS = 30_000;

/**
 * A deploy deletes the previous build's files. A page opened before it still
 * asks for its own chunk names when it opens a module for the first time; that
 * fails, so reload once into the new build instead of showing an error.
 */
export function reloadOnStaleChunk(): void {
  addEventListener('vite:preloadError', (event) => {
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
      if (Date.now() - last < RELOAD_GUARD_MS) return;
      sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
    } catch {
      return;
    }
    event.preventDefault();
    location.reload();
  });
}
