// choreDefs and chores documents → domain values (docs/v2/INVENTORY.md: 36
// definitions, all seeds, `desc` always ""; 14 entries, 2 pointing at a deleted
// definition).
import type { DocumentData } from 'firebase/firestore';
import type { ChoreDef, ChoreEntry } from '@/domain/chores';
import { dayKeyOrNull, numberOr, stringOr } from './fields';

export function choreDefFromData(id: string, data: DocumentData): ChoreDef {
  return {
    id,
    name: stringOr(data.name, id),
    emoji: stringOr(data.emoji),
    points: numberOr(data.points),
    oneTime: data.oneTime === true,
    order: numberOr(data.order),
  };
}

/** null without a valid local day: it could not be placed on any day (none in production). */
export function choreEntryFromData(id: string, data: DocumentData): ChoreEntry | null {
  const dateISO = dayKeyOrNull(data.dateISO);
  if (!dateISO) return null;
  return {
    id,
    choreId: stringOr(data.choreId),
    name: stringOr(data.choreName),
    emoji: stringOr(data.choreEmoji),
    points: numberOr(data.points),
    dateISO,
  };
}
