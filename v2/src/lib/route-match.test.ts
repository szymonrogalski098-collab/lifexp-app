import { describe, expect, test } from 'vitest';
import { matchPath, pathFromHash } from './route-match';

describe('pathFromHash', () => {
  test.each([
    ['#/today', '/today'],
    ['#/tasks/', '/tasks'],
    ['#/notes/abc?focus=1', '/notes/abc'],
    ['#/', '/'],
    ['', ''],
    ['#', ''],
    ['#today', ''],
  ])('%s → %s', (hash, path) => {
    expect(pathFromHash(hash)).toBe(path);
  });
});

describe('matchPath', () => {
  test('static paths', () => {
    expect(matchPath('/today', '/today')).toEqual({});
    expect(matchPath('/today', '/tasks')).toBeNull();
    expect(matchPath('/money', '/money/loans')).toBeNull();
  });

  test('required params', () => {
    expect(matchPath('/notes/:id', '/notes/a%20b')).toEqual({ id: 'a b' });
    expect(matchPath('/notes/:id', '/notes')).toBeNull();
  });

  test('optional params', () => {
    expect(matchPath('/settings/:section?', '/settings')).toEqual({});
    expect(matchPath('/settings/:section?', '/settings/theme')).toEqual({ section: 'theme' });
    expect(matchPath('/settings/:section?', '/settings/theme/extra')).toBeNull();
  });
});
