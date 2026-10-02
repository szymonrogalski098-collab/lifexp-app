// What Settings may save to users/{uid} (v1 settings.js; docs/v2/PLAN.md 9, stage 4).
// v1 takes the inputs' min/max only as a hint and falls back to its defaults on
// anything it cannot parse; v2 checks the same ranges and says what is wrong instead
// of saving something else. The fields and their types stay v1's, so v1 reads them.

/** v1 input#set-name maxlength. */
export const NAME_MAX = 30;

/** v1 input#set-daily-limit min/max. */
export const DAILY_LIMIT_MIN = 50;
export const DAILY_LIMIT_MAX = 500;

/** v1 economy inputs: up to 100 000 on either side. */
export const RATE_ZLOTY_MAX_GROSZE = 100_000 * 100;
export const RATE_POINTS_MAX = 100_000;

/** v1 RATE_GENERAL_ZL_DEFAULT / RATE_GENERAL_PTS_DEFAULT: 1 zł for 10 points. */
export const RATE_GENERAL_DEFAULT = { grosze: 100, points: 10 } as const;
/** v1 RATE_CHORES_ZL_DEFAULT / RATE_CHORES_PTS_DEFAULT: 0,45 zł for 1 point. */
export const RATE_CHORES_DEFAULT = { grosze: 45, points: 1 } as const;

export type NameProblem = 'tooLong';

export function nameProblem(name: string): NameProblem | null {
  return name.trim().length > NAME_MAX ? 'tooLong' : null;
}

export type DailyLimitProblem = 'outOfRange';

export function dailyLimitProblem(limit: number | null): DailyLimitProblem | null {
  if (limit === null || !Number.isInteger(limit) || limit < DAILY_LIMIT_MIN || limit > DAILY_LIMIT_MAX) {
    return 'outOfRange';
  }
  return null;
}

/** "X zł for Y points", the złoty side in grosze. */
export interface RateDraft {
  grosze: number | null;
  points: number | null;
}

export type RateProblem = 'zlotyRequired' | 'pointsRequired' | 'tooLarge';

export function rateProblem({ grosze, points }: RateDraft): RateProblem | null {
  if (grosze === null || grosze <= 0) return 'zlotyRequired';
  if (points === null || !Number.isInteger(points) || points < 1) return 'pointsRequired';
  if (grosze > RATE_ZLOTY_MAX_GROSZE || points > RATE_POINTS_MAX) return 'tooLarge';
  return null;
}

/**
 * The rate the form starts from: the profile's when both sides are set (v1 uses
 * them only then), else v1's default.
 */
export function rateDraft(
  stored: { zloty: number | null; points: number | null },
  fallback: { grosze: number; points: number },
): RateDraft {
  return stored.zloty && stored.points
    ? { grosze: Math.round(stored.zloty * 100), points: stored.points }
    : { grosze: fallback.grosze, points: fallback.points };
}
