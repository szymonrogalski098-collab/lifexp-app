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
  /** v1's Tabler icon id (v1 draws it; v2 names it, PLAN.md 7.1); null when missing. */
  icon: string | null;
  /** v1's colour for the type; null when missing. */
  color: string | null;
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

// ── Activity types (v1 Settings → Aktywności; stage 4c) ──

/** v1 input#ad-name maxlength. */
export const ACTIVITY_NAME_MAX = 60;
/** v1 input#ad-points max. */
export const ACTIVITY_POINTS_MAX = 10_000;

/** v1 ACTIVITY_ICON_PRESETS, in v1's order; the first is v1's default. */
export const ACTIVITY_ICONS = [
  'ti-book',
  'ti-code',
  'ti-run',
  'ti-school',
  'ti-book-2',
  'ti-music',
  'ti-palette',
  'ti-language',
  'ti-bike',
  'ti-dumbbell',
  'ti-pencil',
  'ti-brain',
] as const;

/** v1 ACTIVITY_COLOR_PRESETS, in v1's order; the first is v1's default. */
export const ACTIVITY_COLORS = ['#6c63ff', '#4ecca3', '#ffd700', '#ff6b6b', '#8a8fa8', '#ff9f43', '#00d2d3', '#feca57'] as const;

export interface ActivityDefDraft {
  name: string;
  /** Points per hour; null = the field is empty. */
  points: number | null;
  icon: string;
  color: string;
}

export type ActivityDefProblem = 'nameRequired' | 'pointsRequired' | 'pointsTooMany';

export const NEW_ACTIVITY_DEF: ActivityDefDraft = { name: '', points: null, icon: ACTIVITY_ICONS[0], color: ACTIVITY_COLORS[0] };

/** v1 addActivityDef(): a name and whole points above zero; v1's field stops at 10 000. */
export function activityDefProblem(draft: ActivityDefDraft): ActivityDefProblem | null {
  if (!draft.name.trim()) return 'nameRequired';
  if (draft.points === null || !Number.isInteger(draft.points) || draft.points <= 0) return 'pointsRequired';
  if (draft.points > ACTIVITY_POINTS_MAX) return 'pointsTooMany';
  return null;
}

/** v1 addActivityDef(): after the last one (max order + 1), or 0 for the first. */
export function nextActivityOrder(defs: readonly ActivityDef[]): number {
  const orders = defs.map((d) => (d.order === Number.MAX_SAFE_INTEGER ? 0 : d.order));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

/** The sheet's starting point for an existing type; a missing icon or colour gets v1's default. */
export function activityDefDraft(def: ActivityDef): ActivityDefDraft {
  return { name: def.name, points: def.points, icon: def.icon ?? ACTIVITY_ICONS[0], color: def.color ?? ACTIVITY_COLORS[0] };
}

/** The same type with the sheet's changes (v2 only; v1 adds and deletes). Call activityDefProblem() first. */
export function editedActivityDef(def: ActivityDef, draft: ActivityDefDraft): ActivityDef {
  return { ...def, name: draft.name.trim(), points: draft.points ?? 0, icon: draft.icon, color: draft.color };
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
  /** activityDefs id, or GENERATED_TYPE for a pick from the generator's pool; null = none chosen yet. */
  type: string | null;
  /** null = the field is empty. */
  minutes: number | null;
  desc: string;
  /** The generator's pick when `type` is GENERATED_TYPE. */
  generated?: GeneratedActivity | null;
}

// ── "Co teraz?" (v1 generator) ──

/** v1's type for an activity picked from the generator's own pool (saved with typeName). */
export const GENERATED_TYPE = '__generated__';

/** An activity from the generator's pool (v1 i18n genActivities): a name and points per hour. */
export interface GeneratedActivity {
  name: string;
  points: number;
}

export interface GeneratorPick extends GeneratedActivity {
  /** The definition it is, or null for one of the pool's own. */
  defId: string | null;
}

/** v1 generate(): the pool of 33 in the app's language, then the person's own definitions. */
export function generatorPool(pool: readonly GeneratedActivity[], defs: readonly ActivityDef[]): GeneratorPick[] {
  return [
    ...pool.map((item) => ({ name: item.name, points: item.points, defId: null })),
    ...defs.map((def) => ({ name: def.name, points: def.points, defId: def.id })),
  ];
}

/** One pick, every entry as likely as any other (v1: Math.random over the pool). */
export function pickActivity(pool: readonly GeneratorPick[], random: () => number = Math.random): GeneratorPick | null {
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
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
