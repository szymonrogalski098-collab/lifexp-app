// Chore use cases (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8). Logging and deleting
// touch single entries (plus a one-time definition in the same batch), so they are
// queued offline like any write and return at once with a `saved` promise.
import { addChoreEntry, removeChoreEntry, restoreChoreEntry } from '@/data/repos/chores';
import type { ChoreDef, ChoreEntry } from '@/domain/chores';

/** v1 addChore() for the day already decided (today, or yesterday after asking). */
export function logChore(uid: string, def: ChoreDef, dateISO: string, now = new Date()): { saved: Promise<void> } {
  return { saved: addChoreEntry(uid, def, dateISO, now) };
}

/** v1 deleteChoreEntry(); `undo` puts the same entry back. */
export function deleteChoreEntry(uid: string, entry: ChoreEntry): { saved: Promise<void>; undo: () => Promise<void> } {
  return { saved: removeChoreEntry(uid, entry.id), undo: () => restoreChoreEntry(uid, entry) };
}
