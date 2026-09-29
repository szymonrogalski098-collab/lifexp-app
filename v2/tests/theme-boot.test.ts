// index.html applies the theme with a small inline script before the app loads
// (no flash of the wrong theme). It cannot import src/lib/theme.ts, so this test
// runs it against the same inputs and requires identical results.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  parseStoredPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  V1_THEME_STORAGE_KEY,
} from '../src/lib/theme';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1] ?? '')
  .find((code) => code.includes(THEME_STORAGE_KEY));

function runBootScript(storage: Record<string, string>, systemDark: boolean) {
  const attributes: Record<string, string> = {};
  const env = {
    localStorage: { getItem: (key: string) => storage[key] ?? null },
    matchMedia: () => ({ matches: systemDark }),
    document: { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
  };
  new Function('localStorage', 'matchMedia', 'document', bootScript ?? '')(env.localStorage, env.matchMedia, env.document);
  return { family: attributes['data-theme'], mode: attributes['data-mode'] };
}

const V2_VALUES = [
  null,
  '{"family":"lifexp","mode":"light"}',
  '{"family":"lifexp","mode":"system"}',
  '{"family":"ios","mode":"dark"}',
  '{"family":"ios"}',
  '{"family":"gold","mode":"light"}',
  '{"family":"apple"}',
  '{broken',
  '"lifexp"',
];
const V1_VALUES = [null, 'lifexp', 'apple', 'gold', 'unknown'];

describe('pre-paint theme script in index.html', () => {
  test('exists', () => {
    expect(bootScript).toBeTruthy();
  });

  for (const v2 of V2_VALUES) {
    for (const v1 of V1_VALUES) {
      for (const systemDark of [true, false]) {
        test(`v2=${v2} v1=${v1} systemDark=${systemDark}`, () => {
          const storage: Record<string, string> = {};
          if (v2 !== null) storage[THEME_STORAGE_KEY] = v2;
          if (v1 !== null) storage[V1_THEME_STORAGE_KEY] = v1;
          const expected = resolveTheme(parseStoredPreference(v2, v1), systemDark);
          expect(runBootScript(storage, systemDark)).toEqual(expected);
        });
      }
    }
  }
});
