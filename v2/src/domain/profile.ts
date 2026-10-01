// What v2 needs to know about the signed-in person. Grows module by module;
// everything here is read from users/{uid} through data/converters/profile.ts.
import type { PcBuild } from './tasks';

export type Language = 'pl' | 'en';

/** The Firebase Auth side of the account. */
export interface SessionUser {
  uid: string;
  email: string;
  displayName: string | null;
  /** Firebase trusts Google accounts; email+password accounts verify with a code in v1. */
  emailVerified: boolean;
}

/** users/{uid} as v2 reads it. */
export interface Profile {
  name: string;
  email: string;
  emailVerified: boolean;
  /** v1 asks solo/supervised once (accountMode); until then the account is not set up. */
  accountModeChosen: boolean;
  /** v1's first-run module survey (enabledModules) is done. */
  modulesChosen: boolean;
  /** v1 module ids the person turned on (chores, money, notes, games, stats, aichat, …); null = not chosen. */
  enabledModules: readonly string[] | null;
  lang: Language | null;
  points: PointsTotals;
  /** Daily points cap; null = v1's default (domain/points DAILY_LIMIT_DEFAULT). */
  dailyLimit: number | null;
  /** Złoty and points of the general rate; v1 uses them only when both are set. */
  rateGeneral: { zloty: number | null; points: number | null };
  /** The same for chores (v1 rateChores). */
  rateChores: { zloty: number | null; points: number | null };
  /** UTC day key of the last streak freeze, if any (G3). */
  streakFreezeLastUsed: string | null;
  /** The PC built by doing tasks (G9); null until the first task, or when malformed. */
  pcBuild: PcBuild | null;
  /** Grosze put aside in money goals (v1 "W celach"); the goals themselves come in stage 3d. */
  savedInGoals: number;
  /** Grosze ever received in Money; null until v1 or v2 backfills it (M2). */
  moneyIncomeAllTime: number | null;
}

/** users.points — v1 keeps all three in step. */
export interface PointsTotals {
  /** Spendable balance. */
  total: number;
  earnedAllTime: number;
  spentAllTime: number;
}
