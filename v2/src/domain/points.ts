// Points, levels and the daily limit as v1 shows them (docs/v2/GOLDEN.md G1, G2).

/** users.dailyLimit when absent (v1 core.js DAILY_LIMIT_DEFAULT). */
export const DAILY_LIMIT_DEFAULT = 150;

/** v1 rateGeneral(): złoty per point, 1 zł / 10 pkt unless both profile fields are set. */
export function generalRate(zloty: number | null, points: number | null): number {
  return zloty && points ? zloty / points : 1 / 10;
}

/** v1 formatPLN(): the złoty value of points, in grosze. */
export function pointsToGrosze(points: number, rate: number): number {
  return Math.round(points * rate * 100);
}

export const XP_PER_LEVEL = 500;

export interface Level {
  /** 1-based. */
  level: number;
  /** XP gathered inside the current level, 0 … XP_PER_LEVEL − 1. */
  intoLevel: number;
}

/** G2: the level grows with points earned all time, never falls when points are spent. */
export function levelOf(earnedAllTime: number): Level {
  const xp = Math.max(0, earnedAllTime);
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, intoLevel: xp % XP_PER_LEVEL };
}

/** v1 has eight titles; every level from the eighth on keeps the last one. */
export const LEVEL_TITLE_COUNT = 8;

/** 1-based index into the level titles. */
export function levelTitleIndex(level: number): number {
  return Math.min(Math.max(level, 1), LEVEL_TITLE_COUNT);
}

export interface DailyProgress {
  earned: number;
  limit: number;
  /** 0 … 1, for a progress bar. */
  ratio: number;
}

/** G1: points earned today (UTC day) against the profile's limit. */
export function dailyProgress(earnedToday: number, limit: number | null): DailyProgress {
  const cap = limit || DAILY_LIMIT_DEFAULT;
  return { earned: earnedToday, limit: cap, ratio: Math.min(1, Math.max(0, earnedToday / cap)) };
}
