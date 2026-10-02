// Settings saved to the profile (v1 settings.js; docs/v2/PLAN.md 9, stage 4). Each
// is one document update: the screen goes on at once and reports a failed `saved`,
// and offline the write waits in Firestore's queue like any other.
import { updateSettings } from '@/data/repos/profile';
import type { Language } from '@/domain/profile';
import {
  dailyLimitProblem,
  nameProblem,
  rateProblem,
  type DailyLimitProblem,
  type NameProblem,
  type RateDraft,
  type RateProblem,
} from '@/domain/settings';
import { zlotyFromGrosze } from '@/lib/money';

export type SettingsSave<P> = { ok: true; saved: Promise<void> } | { ok: false; problem: P };

/** v1 saveSettings(), the name part. */
export function saveName(uid: string, name: string): SettingsSave<NameProblem> {
  const problem = nameProblem(name);
  if (problem) return { ok: false, problem };
  return { ok: true, saved: updateSettings(uid, { name: name.trim() }) };
}

/** v1 saveSettings(), the daily limit part. */
export function saveDailyLimit(uid: string, limit: number | null): SettingsSave<DailyLimitProblem> {
  const problem = dailyLimitProblem(limit);
  if (problem || limit === null) return { ok: false, problem: problem ?? 'outOfRange' };
  return { ok: true, saved: updateSettings(uid, { dailyLimit: limit }) };
}

/** v1 saveEconomyGeneral() / saveEconomyChores(): złoty as a number, as v1 stores it. */
export function saveRate(uid: string, kind: 'general' | 'chores', draft: RateDraft): SettingsSave<RateProblem> {
  const problem = rateProblem(draft);
  if (problem || draft.grosze === null || draft.points === null) return { ok: false, problem: problem ?? 'zlotyRequired' };
  const zloty = zlotyFromGrosze(draft.grosze);
  const fields =
    kind === 'general'
      ? { pointsRateGeneralZl: zloty, pointsRateGeneralPts: draft.points }
      : { pointsRateChoresZl: zloty, pointsRateChoresPts: draft.points };
  return { ok: true, saved: updateSettings(uid, fields) };
}

/** v1 saveLangToProfile(): the profile carries the choice to other devices. */
export function saveLanguage(uid: string, lang: Language): Promise<void> {
  return updateSettings(uid, { lang });
}
