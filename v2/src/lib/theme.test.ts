import { describe, expect, test } from 'vitest';
import {
  DEFAULT_THEME,
  fromV1Theme,
  normalizePreference,
  parseStoredPreference,
  resolveTheme,
  serializePreference,
} from './theme';

describe('migration from v1', () => {
  test.each([
    ['lifexp', { family: 'lifexp', mode: 'dark' }],
    ['apple', { family: 'ios', mode: 'system' }],
    ['gold', { family: 'gold', mode: 'dark' }],
    [null, DEFAULT_THEME],
    ['something-else', DEFAULT_THEME],
  ])('v1 %s → %o', (v1, expected) => {
    expect(fromV1Theme(v1)).toEqual(expected);
  });
});

describe('stored preference', () => {
  test('v2 value wins over v1', () => {
    expect(parseStoredPreference(serializePreference({ family: 'lifexp', mode: 'light' }), 'gold')).toEqual({
      family: 'lifexp',
      mode: 'light',
    });
  });

  test('without a v2 value the v1 value is migrated', () => {
    expect(parseStoredPreference(null, 'apple')).toEqual({ family: 'ios', mode: 'system' });
  });

  test.each(['{not json', '"lifexp"', '{"family":"apple"}', '{}', 'null'])('corrupt v2 value %s falls back to v1', (raw) => {
    expect(parseStoredPreference(raw, 'gold')).toEqual({ family: 'gold', mode: 'dark' });
  });

  test('a mode the family does not have becomes the family default', () => {
    expect(parseStoredPreference('{"family":"gold","mode":"light"}', null)).toEqual({ family: 'gold', mode: 'dark' });
    expect(normalizePreference('ios', 'sepia')).toEqual({ family: 'ios', mode: 'system' });
  });
});

describe('resolving the mode', () => {
  test('system follows the device setting', () => {
    expect(resolveTheme({ family: 'ios', mode: 'system' }, true)).toEqual({ family: 'ios', mode: 'dark' });
    expect(resolveTheme({ family: 'ios', mode: 'system' }, false)).toEqual({ family: 'ios', mode: 'light' });
  });

  test('an explicit mode ignores the device setting', () => {
    expect(resolveTheme({ family: 'lifexp', mode: 'dark' }, false)).toEqual({ family: 'lifexp', mode: 'dark' });
    expect(resolveTheme({ family: 'lifexp', mode: 'light' }, true)).toEqual({ family: 'lifexp', mode: 'light' });
  });
});
