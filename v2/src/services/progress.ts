// The streak freeze and the badges (docs/v2/PLAN.md 9, stage 3e; GOLDEN G3, G4).
// v1 writes both while rendering its dashboard (B15); v2 computes them on Today and
// records them here, once, after the screen has shown them.
import { addAchievements, recordStreakFreeze } from '@/data/repos/profile';
import { newAchievements, type Achievement, type AchievementInput } from '@/domain/achievements';

/** G3: the freeze bridged a gap today (UTC day); resolves to whether this call recorded it. */
export function recordFreeze(uid: string, day: string, now = new Date()): Promise<boolean> {
  return recordStreakFreeze(uid, day, now);
}

/** G4: records the badges earned now; resolves to the ones this call added (for the toast). */
export async function awardAchievements(
  uid: string,
  held: readonly string[],
  input: AchievementInput,
): Promise<Achievement[]> {
  const due = newAchievements(held, input);
  if (due.length === 0) return [];
  const added = await addAchievements(
    uid,
    due.map((a) => a.id),
  );
  return due.filter((a) => added.includes(a.id));
}
