import { describe, expect, test } from 'vitest';
import pl from '@/i18n/pl.json';
import { DEFAULT_PATH, FEATURES, navItems, resolveRoute } from './registry';

describe('module registry', () => {
  test('every route of PLAN.md 4.7 resolves to its module', () => {
    const expected: Record<string, string> = {
      '/today': 'today',
      '/tasks': 'tasks',
      '/goals': 'goals',
      '/chores': 'chores',
      '/money': 'money',
      '/money/loans': 'money',
      '/notes': 'notes',
      '/notes/abc': 'notes',
      '/stats': 'stats',
      '/stats/history': 'stats',
      '/reports': 'reports',
      '/settings': 'settings',
      '/settings/theme': 'settings',
      '/exus': 'exus',
      '/games': 'games',
    };
    for (const [path, id] of Object.entries(expected)) expect(resolveRoute(path)?.feature.id, path).toBe(id);
  });

  test('unknown paths do not resolve', () => {
    expect(resolveRoute('/nope')).toBeNull();
    expect(resolveRoute('')).toBeNull();
  });

  test('the default path is a real route', () => {
    expect(resolveRoute(DEFAULT_PATH)?.feature.id).toBe('today');
  });

  test('menu order matches the drawer in PLAN.md 7.4', () => {
    expect(navItems('main').map((f) => f.id)).toEqual(['today', 'tasks', 'goals', 'chores', 'money', 'notes', 'stats', 'games']);
    expect(navItems('secondary').map((f) => f.id)).toEqual(['reports', 'settings']);
  });

  test('ids and labels are unique and translated', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    for (const f of FEATURES) expect(pl.nav[f.id], f.id).toBeTruthy();
  });
});
