// Hash router (docs/v2/PLAN.md 4.7): GitHub Pages has no SPA fallback, and hash
// URLs work offline without server rules. The current path is a signal; views
// re-render when it changes.
import { signal } from '@preact/signals';
import { pathFromHash } from '@/lib/route-match';

export const currentPath = signal(pathFromHash(location.hash));

function syncFromLocation() {
  currentPath.value = pathFromHash(location.hash);
}

export function startRouter(): () => void {
  addEventListener('hashchange', syncFromLocation);
  addEventListener('popstate', syncFromLocation);
  return () => {
    removeEventListener('hashchange', syncFromLocation);
    removeEventListener('popstate', syncFromLocation);
  };
}

/**
 * Go to `path`. `replace` overwrites the current history entry instead of adding
 * one — used when a menu choice replaces the "drawer open" entry, so Back from
 * the new screen returns to the previous screen, not to an open drawer.
 */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const url = `#${path}`;
  if (options.replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  currentPath.value = path;
}
