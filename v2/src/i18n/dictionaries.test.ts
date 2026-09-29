import { describe, expect, test } from 'vitest';
import en from './en.json';
import pl from './pl.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function placeholders(obj: object): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of keys(obj)) {
    const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
    out[key] = [...String(value).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '').sort();
  }
  return out;
}

describe('dictionaries', () => {
  test('English has exactly the Polish keys', () => {
    expect(keys(en).sort()).toEqual(keys(pl).sort());
  });

  test('both languages use the same {{placeholders}}', () => {
    expect(placeholders(en)).toEqual(placeholders(pl));
  });

  test('no empty strings', () => {
    for (const dict of [pl, en]) expect(JSON.stringify(dict)).not.toMatch(/:\s*""/);
  });
});
