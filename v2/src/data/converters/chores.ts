// choreDefs and chores documents → domain values (docs/v2/INVENTORY.md: 36
// definitions, all seeds, `desc` always ""; 14 entries, 2 pointing at a deleted
// definition).
import type { DocumentData } from 'firebase/firestore';
import type { ChoreDef, ChoreEntry, ChorePayout } from '@/domain/chores';
import { groszeFromZloty } from '@/lib/money';
import { dateOrNull, dayKeyOrNull, numberOr, stringOr } from './fields';

export function choreDefFromData(id: string, data: DocumentData): ChoreDef {
  return {
    id,
    name: stringOr(data.name, id),
    desc: stringOr(data.desc),
    emoji: stringOr(data.emoji),
    points: numberOr(data.points),
    oneTime: data.oneTime === true,
    order: numberOr(data.order),
  };
}

/** A definition as v1 addChoreDef() and the seed write it (the id is the document's). */
export function choreDefData(def: Omit<ChoreDef, 'id'>): DocumentData {
  return { name: def.name, desc: def.desc, emoji: def.emoji, points: def.points, oneTime: def.oneTime, order: def.order };
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
    // Every entry in production has it (INVENTORY.md); derived only as a fallback.
    monthKey: typeof data.monthKey === 'string' && /^\d{4}-\d{2}$/.test(data.monthKey) ? data.monthKey : dateISO.slice(0, 7),
    createdAt: dateOrNull(data.createdAt),
  };
}

/** v1 addChore(): the definition is copied into the entry, so the entry outlives it. */
export function newChoreEntryData(def: ChoreDef, dateISO: string, now: Date): DocumentData {
  return {
    choreId: def.id,
    choreName: def.name,
    choreEmoji: def.emoji || '',
    points: def.points,
    dateISO,
    monthKey: dateISO.slice(0, 7),
    createdAt: now,
  };
}

/** Undo of a delete: the same entry back, as v1 wrote it. */
export function choreEntryData(entry: ChoreEntry): DocumentData {
  return {
    choreId: entry.choreId,
    choreName: entry.name,
    choreEmoji: entry.emoji,
    points: entry.points,
    dateISO: entry.dateISO,
    monthKey: entry.monthKey,
    createdAt: entry.createdAt ?? new Date(),
  };
}

/** chorePayouts (INVENTORY.md: 6, amountPln int or float złoty). */
export function chorePayoutFromData(id: string, data: DocumentData): ChorePayout {
  return {
    id,
    points: numberOr(data.points),
    grosze: groszeFromZloty(numberOr(data.amountPln)),
    fromISO: dayKeyOrNull(data.fromISO),
    toISO: dayKeyOrNull(data.toISO),
    createdAt: dateOrNull(data.createdAt),
  };
}
