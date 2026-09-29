import { describe, expect, test } from 'vitest';
import { dailyProgress, generalRate, levelOf, levelTitleIndex, pointsToGrosze } from './points';

describe('G2 level', () => {
  test.each([
    ['G2.1', 0, 1, 0],
    ['G2.2', 499, 1, 499],
    ['G2.3', 500, 2, 0],
    ['G2.4', 620, 2, 120],
    ['G2.5', 5000, 11, 0],
  ])('%s: earnedAllTime %i → level %i, %i XP into it', (_case, earned, level, intoLevel) => {
    expect(levelOf(earned)).toEqual({ level, intoLevel });
  });

  test('titles stop at the eighth', () => {
    expect(levelTitleIndex(1)).toBe(1);
    expect(levelTitleIndex(8)).toBe(8);
    expect(levelTitleIndex(11)).toBe(8);
  });
});

describe('points in złoty (v1 formatPLN)', () => {
  test('default rate is 1 zł per 10 points', () => {
    expect(generalRate(null, null)).toBe(0.1);
    expect(pointsToGrosze(1234, generalRate(null, null))).toBe(12340);
  });

  test('a custom rate needs both fields, as in v1', () => {
    expect(generalRate(2, 10)).toBe(0.2);
    expect(generalRate(2, null)).toBe(0.1);
    expect(generalRate(0, 10)).toBe(0.1);
  });
});

describe('G1 daily limit', () => {
  test('progress against the profile limit, default 150', () => {
    expect(dailyProgress(95, null)).toEqual({ earned: 95, limit: 150, ratio: 95 / 150 });
    expect(dailyProgress(40, 80)).toEqual({ earned: 40, limit: 80, ratio: 0.5 });
  });

  test('the bar never overflows', () => {
    expect(dailyProgress(200, 150).ratio).toBe(1);
  });
});
