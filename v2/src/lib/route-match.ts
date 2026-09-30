// Hash route matching: "/notes/:id", "/settings/:section?". Pure; the router in
// app/router.ts owns history and the current-path signal.

export type RouteParams = Record<string, string>;

export type Navigate = (path: string, options?: { replace?: boolean }) => void;

/**
 * What a module's screen gets from the router: the current path, its params and
 * a way to move on (features cannot import the app layer, so it is passed in).
 */
export interface RouteProps {
  path: string;
  params: RouteParams;
  navigate: Navigate;
}

/** "#/tasks?x=1" → "/tasks"; anything without a leading slash → "". */
export function pathFromHash(hash: string): string {
  const raw = hash.replace(/^#/, '').split('?')[0] ?? '';
  if (!raw.startsWith('/')) return '';
  const trimmed = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  return trimmed || '/';
}

/** Params when `path` matches `pattern`, else null. */
export function matchPath(pattern: string, path: string): RouteParams | null {
  const want = pattern.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  const params: RouteParams = {};
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    const w = want[i];
    const g = got[i];
    if (w === undefined) return null; // path is longer than the pattern
    if (w.startsWith(':')) {
      const optional = w.endsWith('?');
      const name = w.slice(1, optional ? -1 : undefined);
      if (g === undefined) {
        if (!optional) return null;
        continue;
      }
      params[name] = decodeURIComponent(g);
    } else if (w !== g) {
      return null;
    }
  }
  return params;
}
