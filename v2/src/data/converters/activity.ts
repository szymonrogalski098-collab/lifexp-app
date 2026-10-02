// activities, activityDefs and dailyLog documents → domain values
// (docs/v2/INVENTORY.md: 37 activities, 29 definitions, 29 day logs).
import type { DocumentData } from 'firebase/firestore';
import type { Activity, ActivityDef, DayLog } from '@/domain/activity';
import { dateOrNull, nonEmptyStringOrNull, numberOr, stringOr } from './fields';

export function dayLogFromData(data: DocumentData): DayLog {
  return { pointsEarned: numberOr(data.pointsEarned), gamingMinutes: numberOr(data.gamingMinutes) };
}

/** null when the entry has no usable timestamp (none in production; v1 would show "Invalid Date"). */
export function activityFromData(id: string, data: DocumentData): Activity | null {
  const at = dateOrNull(data.timestamp);
  if (!at) return null;
  return {
    id,
    type: stringOr(data.type),
    typeName: nonEmptyStringOrNull(data.typeName),
    desc: stringOr(data.desc).trim(),
    duration: numberOr(data.duration),
    points: numberOr(data.points),
    at,
  };
}

/** activityDefs → the name shown for its id; icon and color are not rendered in v2 (PLAN.md 7.1). */
export function activityDefName(data: DocumentData): string | null {
  return nonEmptyStringOrNull(data.name);
}

/** A definition that can be logged; null without a name. Without `order` it goes last. */
export function activityDefFromData(id: string, data: DocumentData): ActivityDef | null {
  const name = activityDefName(data);
  if (!name) return null;
  return {
    id,
    name,
    points: numberOr(data.points),
    order: numberOr(data.order, Number.MAX_SAFE_INTEGER),
    icon: typeof data.icon === 'string' && data.icon !== '' ? data.icon : null,
    color: typeof data.color === 'string' && data.color !== '' ? data.color : null,
  };
}

export interface NewActivity {
  type: string;
  /** Only for an activity without a definition (v1's generator). */
  typeName: string | null;
  minutes: number;
  points: number;
  desc: string;
  now: Date;
}

/** v1 persistActivity(): the entry as v1 writes it. */
export function newActivityData(activity: NewActivity): DocumentData {
  const data: DocumentData = {
    type: activity.type,
    duration: activity.minutes,
    points: activity.points,
    desc: activity.desc,
    timestamp: activity.now,
  };
  if (activity.typeName) data.typeName = activity.typeName;
  return data;
}
