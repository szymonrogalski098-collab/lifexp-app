// Chore use cases (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8). Logging and deleting
// touch single entries (plus a one-time definition in the same batch), so they are
// queued offline like any write and return at once with a `saved` promise. The
// payout moves money, so it is one transaction, awaited, and needs the server.
import { addChoreEntry, removeChoreEntry, restoreChoreEntry, settleChoreEntries } from '@/data/repos/chores';
import type { ChoreDef, ChoreEntry, PayoutPlan } from '@/domain/chores';
import { utcDayKey } from '@/lib/dates';

/** v1 addChore() for the day already decided (today, or yesterday after asking). */
export function logChore(uid: string, def: ChoreDef, dateISO: string, now = new Date()): { saved: Promise<void> } {
  return { saved: addChoreEntry(uid, def, dateISO, now) };
}

/** v1 deleteChoreEntry(); `undo` puts the same entry back. */
export function deleteChoreEntry(uid: string, entry: ChoreEntry): { saved: Promise<void>; undo: () => Promise<void> } {
  return { saved: removeChoreEntry(uid, entry.id), undo: () => restoreChoreEntry(uid, entry) };
}

/**
 * v1 settleChores(): pays every unpaid entry into Money in one transaction.
 * `category` is the income's category in the app's language, as v1 writes it
 * (G8.8). Resolves to what was paid; null when there was nothing left.
 */
export function settleChores(
  uid: string,
  entries: readonly ChoreEntry[],
  rate: number,
  category: string,
  now = new Date(),
): Promise<PayoutPlan | null> {
  return settleChoreEntries(uid, { entryIds: entries.map((e) => e.id), rate, category, day: utcDayKey(now), now });
}
