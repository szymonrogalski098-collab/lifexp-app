import { describe, expect, it } from 'vitest';
import {
  RATE_CHORES_DEFAULT,
  RATE_GENERAL_DEFAULT,
  dailyLimitProblem,
  nameProblem,
  rateDraft,
  rateProblem,
} from './settings';

describe('nameProblem', () => {
  it('takes up to 30 characters once trimmed, and an empty name (v1 then shows its default)', () => {
    expect(nameProblem('')).toBeNull();
    expect(nameProblem(`  ${'a'.repeat(30)}  `)).toBeNull();
    expect(nameProblem('a'.repeat(31))).toBe('tooLong');
  });
});

describe('dailyLimitProblem', () => {
  it('takes whole numbers from 50 to 500 (v1 input range)', () => {
    expect(dailyLimitProblem(50)).toBeNull();
    expect(dailyLimitProblem(500)).toBeNull();
    expect(dailyLimitProblem(150)).toBeNull();
  });

  it('refuses anything else instead of saving the default as v1 does', () => {
    expect(dailyLimitProblem(null)).toBe('outOfRange');
    expect(dailyLimitProblem(49)).toBe('outOfRange');
    expect(dailyLimitProblem(501)).toBe('outOfRange');
    expect(dailyLimitProblem(120.5)).toBe('outOfRange');
  });
});

describe('rateProblem', () => {
  it('needs more than 0 zł and at least one whole point', () => {
    expect(rateProblem({ grosze: 100, points: 10 })).toBeNull();
    expect(rateProblem({ grosze: 1, points: 1 })).toBeNull();
    expect(rateProblem({ grosze: null, points: 10 })).toBe('zlotyRequired');
    expect(rateProblem({ grosze: 0, points: 10 })).toBe('zlotyRequired');
    expect(rateProblem({ grosze: 100, points: null })).toBe('pointsRequired');
    expect(rateProblem({ grosze: 100, points: 0 })).toBe('pointsRequired');
    expect(rateProblem({ grosze: 100, points: 1.5 })).toBe('pointsRequired');
  });

  it('caps both sides at 100 000', () => {
    expect(rateProblem({ grosze: 10_000_000, points: 100_000 })).toBeNull();
    expect(rateProblem({ grosze: 10_000_001, points: 10 })).toBe('tooLarge');
    expect(rateProblem({ grosze: 100, points: 100_001 })).toBe('tooLarge');
  });
});

describe('rateDraft', () => {
  it('starts from the profile when both sides are set', () => {
    expect(rateDraft({ zloty: 2.5, points: 10 }, RATE_GENERAL_DEFAULT)).toEqual({ grosze: 250, points: 10 });
    expect(rateDraft({ zloty: 0.45, points: 1 }, RATE_CHORES_DEFAULT)).toEqual({ grosze: 45, points: 1 });
  });

  it("starts from v1's default otherwise, the rate v1 then uses", () => {
    expect(rateDraft({ zloty: null, points: null }, RATE_GENERAL_DEFAULT)).toEqual({ grosze: 100, points: 10 });
    expect(rateDraft({ zloty: 3, points: null }, RATE_CHORES_DEFAULT)).toEqual({ grosze: 45, points: 1 });
  });
});
