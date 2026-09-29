// Logged activities and the per-day log (docs/v2/GOLDEN.md G1, G10), as read.

/** users/{uid}/dailyLog/{UTC day}. */
export interface DayLog {
  pointsEarned: number;
  gamingMinutes: number;
}

/** users/{uid}/activities/{id}. */
export interface Activity {
  id: string;
  /** activityDefs id; v1 also stores ids of deleted or generated types. */
  type: string;
  /** Name saved with the entry (3 of 37 in production); wins over the definition. */
  typeName: string | null;
  desc: string;
  /** Minutes. */
  duration: number;
  points: number;
  at: Date;
}

/**
 * v1 activityRowHTML(): the saved name, else the definition's name, else the raw
 * type id (what v1 shows for a deleted definition).
 */
export function activityName(activity: Activity, definitionNames: ReadonlyMap<string, string>): string {
  return activity.typeName ?? definitionNames.get(activity.type) ?? activity.type;
}

/** Days with points keep the streak alive (G3). */
export function activeDays(days: ReadonlyMap<string, DayLog>): Set<string> {
  return new Set([...days].filter(([, log]) => log.pointsEarned > 0).map(([key]) => key));
}
