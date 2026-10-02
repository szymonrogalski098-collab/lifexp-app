import { describe, expect, test } from 'vitest';
import { ACHIEVEMENTS, newAchievements, type AchievementInput } from './achievements';

const none: AchievementInput = {
  earnedAllTime: 0,
  spentAllTime: 0,
  streak: 0,
  pointsToday: 0,
  gamingMinutesToday: 0,
  dailyLimit: 150,
  moneyIncomeAllTime: null,
};
const ids = (held: string[], patch: Partial<AchievementInput>) => newAchievements(held, { ...none, ...patch }).map((a) => a.id);

describe('G4 achievements', () => {
  test('nothing yet: no badge', () => {
    expect(ids([], {})).toEqual([]);
  });

  test.each([
    ['first_activity', { earnedAllTime: 1 }],
    ['pts_1000', { earnedAllTime: 1000 }],
    ['pts_5000', { earnedAllTime: 5000 }],
    ['first_purchase', { spentAllTime: 1 }],
    ['streak_7', { streak: 7 }],
    ['streak_30', { streak: 30 }],
    ['gaming_hour', { gamingMinutesToday: 60 }],
    ['daily_limit', { pointsToday: 150 }],
    ['money_100', { moneyIncomeAllTime: 10000 }],
    ['money_10000', { moneyIncomeAllTime: 1000000 }],
  ] as const)('%s at its threshold', (id, patch) => {
    expect(ids([], patch)).toContain(id);
  });

  test('just under a threshold: not yet', () => {
    expect(ids([], { earnedAllTime: 999 })).toEqual(['first_activity']);
    expect(ids([], { moneyIncomeAllTime: 9999 })).toEqual([]);
    expect(ids([], { pointsToday: 149 })).toEqual([]);
  });

  test('held badges are not added again, and v1 order is kept', () => {
    expect(ids(['first_activity'], { earnedAllTime: 5000, streak: 7 })).toEqual(['pts_1000', 'pts_5000', 'streak_7']);
  });

  test('14 badges with v1 ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(14);
  });
});
