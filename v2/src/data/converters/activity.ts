// activities, activityDefs and dailyLog documents → domain values
// (docs/v2/INVENTORY.md: 37 activities, 29 definitions, 29 day logs).
import type { DocumentData } from 'firebase/firestore';
import type { Activity, DayLog } from '@/domain/activity';
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
