// Installs v2's Service Worker (src/sw.ts) and recovers from a deploy that happened
// while the page was open (docs/v2/PLAN.md 4.8, stage 1f).
import { t } from '@/i18n';
import { showToast } from '@/ui/toast';

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

/** At most this often, a page that comes back into view asks whether a deploy happened. */
const BUILD_CHECK_MS = 5 * 60_000;
/** The entry script of a built index.html; its file name changes with every build. */
const ENTRY_SCRIPT = /<script[^>]*type="module"[^>]*src="([^"]+)"/;

/**
 * A page keeps running the build it was opened with: moving between screens never
 * reloads it. When it comes back into view (and while it stays open), it compares
 * its own entry script with the deployed index.html and, if a newer build is out,
 * offers to reload. The service worker cannot tell this reliably: right after a
 * deploy it also updates under a page that already runs the new build.
 */
export function watchForNewBuild(): void {
  if (!import.meta.env.PROD) return;
  const own = document.querySelector('script[type="module"][src]')?.getAttribute('src');
  if (!own) return;
  let lastCheck = 0;
  const check = () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < BUILD_CHECK_MS) return;
    lastCheck = Date.now();
    // A query the precache does not know, so the request reaches the server.
    fetch(`./index.html?build-check=${lastCheck}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.text() : ''))
      .then((html) => {
        const deployed = ENTRY_SCRIPT.exec(html)?.[1];
        if (deployed && deployed !== own) {
          showToast({
            message: t('app.newVersion'),
            action: { label: t('app.reload'), onAction: () => location.reload() },
            durationMs: 12_000,
          });
        }
      })
      .catch(() => undefined);
  };
  document.addEventListener('visibilitychange', check);
  setInterval(check, BUILD_CHECK_MS);
}
