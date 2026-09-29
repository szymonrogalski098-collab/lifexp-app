// Streak of active days and the streak freeze (docs/v2/GOLDEN.md G3). A day is
// active when its dailyLog has pointsEarned > 0; keys are UTC days (G13).
//
// v1 saves "freeze used" while rendering the dashboard (B15). v2 only computes:
// the number shown is the same, and nothing is written until the streak moves
// into a service (stage 3e).
import { addDays } from '@/lib/dates';

/** The freeze comes back 7 days after it was last used. */
export const FREEZE_COOLDOWN_DAYS = 7;

/** v1 isStreakFreezeAvailable(): never used, or last used more than 7 days before `now`. */
export function isFreezeAvailable(lastUsed: string | null, now: Date): boolean {
  if (!lastUsed) return true;
  const cooldownStart = new Date(now);
  cooldownStart.setDate(cooldownStart.getDate() - FREEZE_COOLDOWN_DAYS);
  return new Date(lastUsed) < cooldownStart;
}

export interface Streak {
  days: number;
  /** A gap was bridged with the freeze (v1 would save it now). */
  freezeUsed: boolean;
}

/**
 * v1 calculateStreakDays(): count active days back from today — or from
 * yesterday while today is still empty, so a streak does not break in the
 * morning. One gap may be skipped with the freeze, once the streak has started;
 * the skipped day does not count.
 */
export function calculateStreak(activeDays: ReadonlySet<string>, today: string, freezeAvailable: boolean): Streak {
  let days = 0;
  let freezeUsed = false;
  let cursor = activeDays.has(today) ? today : addDays(today, -1);
  for (;;) {
    if (activeDays.has(cursor)) {
      days += 1;
    } else if (!freezeUsed && freezeAvailable && days > 0) {
      freezeUsed = true;
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }
  return { days, freezeUsed };
}
