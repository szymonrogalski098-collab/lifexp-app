// What v2 needs to know about the signed-in person. Grows module by module;
// everything here is read from users/{uid} through data/converters/profile.ts.
import type { ChoresCardSettings } from './chores';
import type { Goal } from './goals';
import type { PcBuild } from './tasks';

export type Language = 'pl' | 'en';

/** v1 accountMode: alone, or with a parent who gets weekly reports. */
export type AccountMode = 'solo' | 'supervised';

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
  /** null = not chosen, or a value v1 never writes. */
  accountMode: AccountMode | null;
  /** The parent's verified or unverified e-mail (v1 parentEmail); '' = none. */
  parentEmail: string;
  /** v1's first-run module survey (enabledModules) is done. */
  modulesChosen: boolean;
  /** v1 module ids the person turned on (chores, money, notes, games, stats, aichat, …); null = not chosen. */
  enabledModules: readonly string[] | null;
  /** Modules turned off, written by v2 (M3, domain/modules); null = not written yet. */
  disabledModules: readonly string[] | null;
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
  /** users.goals (G7), at most three. */
  goals: readonly Goal[];
  /** Grosze ever received in Money; null until v1 or v2 backfills it (M2). */
  moneyIncomeAllTime: number | null;
  /** What Today's chore card shows (v2 only; v1 ignores the field). */
  choresCard: ChoresCardSettings;
  /** Ids of the badges earned (G4), never taken away. */
  achievements: readonly string[];
  /** ISO time of the day's bug report (v1 lastBugReportAt); null = never. */
  lastBugReportAt: string | null;
}

/** users.points — v1 keeps all three in step. */
export interface PointsTotals {
  /** Spendable balance. */
  total: number;
  earnedAllTime: number;
  spentAllTime: number;
}
