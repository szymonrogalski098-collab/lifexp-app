import { expect, test } from 'vitest';
import { formatInteger, splitMinutes } from './format';

test('points are grouped per language', () => {
  expect(formatInteger(12450, 'en-GB')).toBe('12,450');
  expect(formatInteger(12450, 'pl-PL').replace(/\s/g, ' ')).toBe('12 450');
});

test('minutes split into hours and the rest', () => {
  expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
  expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
  expect(splitMinutes(-3)).toEqual({ hours: 0, minutes: 0 });
});
