// Logged activities and the per-day log (docs/v2/GOLDEN.md G1, G10, G11): as read, and the rules for logging and deleting one.
import { DAILY_LIMIT_DEFAULT } from './points';

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

// ── Logging and deleting (stage 3e; G1, G11) ──

/** v1 logActivity(): shorter sessions are refused. */
export const ACTIVITY_MIN_MINUTES = 5;

/** users/{uid}/activityDefs/{id}: a kind of activity and what an hour of it earns. */
export interface ActivityDef {
  id: string;
  name: string;
  /** Points per hour. */
  points: number;
  order: number;
}

/** v1 ensureActivityDefsSeeded(): the same ids, so history written before keeps its names. */
export const ACTIVITY_SEEDS: readonly (ActivityDef & { color: string; icon: string })[] = [
  { id: 'learning', name: 'Nauka (JS, Unity, C#)', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 },
  { id: 'project', name: 'Praca nad projektem', points: 35, color: '#4ecca3', icon: 'ti-code', order: 1 },
  { id: 'reading', name: 'Czytanie / kurs', points: 25, color: '#ffd700', icon: 'ti-book-2', order: 2 },
  { id: 'exercise', name: 'Ćwiczenia fizyczne', points: 30, color: '#ff6b6b', icon: 'ti-run', order: 3 },
  { id: 'school', name: 'Zadania szkolne', points: 20, color: '#8a8fa8', icon: 'ti-school', order: 4 },
];

/** v1's list order: by `order`; definitions without one (v1 never lists them) go last, by name. */
export function sortActivityDefs(defs: readonly ActivityDef[]): ActivityDef[] {
  return [...defs].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** G1: an hour earns the definition's points; the result is rounded half up, as Math.round. */
export function earnedPoints(minutes: number, pointsPerHour: number): number {
  return Math.round((minutes / 60) * pointsPerHour);
}

export interface ActivityCredit {
  /** What the time is worth. */
  earned: number;
  /** What is credited: no more than what is left of today's limit. */
  points: number;
  limit: number;
}

/** G1: the points credited for an activity, against the UTC day's points and the profile's limit. */
export function creditActivity(
  minutes: number,
  pointsPerHour: number,
  earnedToday: number,
  dailyLimit: number | null,
): ActivityCredit {
  const limit = dailyLimit || DAILY_LIMIT_DEFAULT;
  const earned = earnedPoints(minutes, pointsPerHour);
  return { earned, points: Math.min(earned, Math.max(0, limit - earnedToday)), limit };
}

export interface ActivityDraft {
  /** activityDefs id; null = none chosen yet. */
  type: string | null;
  /** null = the field is empty. */
  minutes: number | null;
  desc: string;
}

export type ActivityProblem = 'typeRequired' | 'minMinutes';

/** v1 logActivity()'s checks, in its order. */
export function activityProblem(draft: ActivityDraft): ActivityProblem | null {
  if (!draft.type) return 'typeRequired';
  if (draft.minutes === null || draft.minutes < ACTIVITY_MIN_MINUTES) return 'minMinutes';
  return null;
}

export interface PointsState {
  /** The activity's UTC day in dailyLog; null when there is no such document. */
  dayPoints: number | null;
  total: number;
  earnedAllTime: number;
}

/**
 * G11 (v1 revertActivityPoints): the activity's points come off its UTC day, the
 * spendable points and the points earned all time, none of them below zero.
 * spentAllTime stays.
 */
export function revertActivity(points: number, state: PointsState): PointsState {
  const minus = (value: number) => Math.max(0, value - points);
  return {
    dayPoints: state.dayPoints === null ? null : minus(state.dayPoints),
    total: minus(state.total),
    earnedAllTime: minus(state.earnedAllTime),
  };
}
