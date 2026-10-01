// users/{uid} → Profile. Tolerates every shape found in production
// (docs/v2/INVENTORY.md): missing accountMode/enabledModules/lang, rates as int
// or float, empty strings. Read-only: it never writes a "fixed" document back
// (PLAN.md 5.1).
import type { DocumentData } from 'firebase/firestore';
import type { Profile } from '@/domain/profile';
import { pcBuildOrNull } from '@/domain/tasks';
import { goalsFromData } from './goals';
import { groszeFromZloty } from '@/lib/money';
import { dayKeyOrNull, numberOr, numberOrNull } from './fields';

/** v1's name for a profile without one (index.html, core.js). */
export const DEFAULT_NAME = 'Użytkownik';

export function profileFromData(data: DocumentData): Profile {
  const name = typeof data.name === 'string' && data.name.trim() !== '' ? data.name : DEFAULT_NAME;
  const points: Record<string, unknown> = typeof data.points === 'object' && data.points !== null ? data.points : {};
  return {
    name,
    email: typeof data.email === 'string' ? data.email : '',
    emailVerified: data.emailVerified === true,
    // v1 gates on `=== undefined` (core.js), so any stored value counts as chosen.
    accountModeChosen: data.accountMode !== undefined,
    modulesChosen: data.enabledModules !== undefined,
    enabledModules: Array.isArray(data.enabledModules)
      ? data.enabledModules.filter((m: unknown): m is string => typeof m === 'string')
      : null,
    lang: data.lang === 'pl' || data.lang === 'en' ? data.lang : null,
    points: {
      total: numberOr(points.total),
      earnedAllTime: numberOr(points.earnedAllTime),
      spentAllTime: numberOr(points.spentAllTime),
    },
    // v1 reads `dailyLimit || DEFAULT`, so 0 means "default" too.
    dailyLimit: numberOrNull(data.dailyLimit) || null,
    rateGeneral: { zloty: numberOrNull(data.pointsRateGeneralZl), points: numberOrNull(data.pointsRateGeneralPts) },
    rateChores: { zloty: numberOrNull(data.pointsRateChoresZl), points: numberOrNull(data.pointsRateChoresPts) },
    streakFreezeLastUsed: dayKeyOrNull(data.streakFreezeLastUsed),
    pcBuild: pcBuildOrNull(data.pcBuild),
    goals: goalsFromData(data.goals),
    moneyIncomeAllTime: typeof data.moneyIncomeAllTime === 'number' ? groszeFromZloty(data.moneyIncomeAllTime) : null,
  };
}
