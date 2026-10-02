// Chore use cases (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8). Logging, deleting and
// the definitions touch single documents (plus a one-time definition in the same
// batch), so they are queued offline like any write and return at once with a
// `saved` promise. The payout moves money, so it is one transaction, awaited, and
// needs the server.
import {
  addChoreDef,
  addChoreEntry,
  removeChoreDef,
  removeChoreEntry,
  restoreChoreDef,
  restoreChoreEntry,
  seedChoreDefsIfEmpty,
  setChoresCard,
  settleChoreEntries,
  undoChoreEntry,
  updateChoreDef,
} from '@/data/repos/chores';
import {
  choreDefProblem,
  editedChoreDef,
  newChoreDef,
  type ChoreDef,
  type ChoreDefDraft,
  type ChoreDefProblem,
  type ChoreEntry,
  type ChoresCardSettings,
  type PayoutPlan,
} from '@/domain/chores';
import { utcDayKey } from '@/lib/dates';

/** v1 addChore() for the day already decided (today, or yesterday after asking). */
export function logChore(
  uid: string,
  def: ChoreDef,
  dateISO: string,
  now = new Date(),
): { saved: Promise<void>; undo: () => Promise<void> } {
  const { id, saved } = addChoreEntry(uid, def, dateISO, now);
  return { saved, undo: () => undoChoreEntry(uid, id, def) };
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

export type ChoreDefSaveResult = { ok: true; id: string; saved: Promise<void> } | { ok: false; problem: ChoreDefProblem };

/** v1 addChoreDef(): checked, then written after the last one. */
export function createChoreDef(uid: string, draft: ChoreDefDraft, defs: readonly ChoreDef[]): ChoreDefSaveResult {
  const problem = choreDefProblem(draft);
  if (problem) return { ok: false, problem };
  return { ok: true, ...addChoreDef(uid, newChoreDef(draft, defs)) };
}

/**
 * A changed definition (v2 only; v1 can only add and delete). Entries logged before
 * keep their own name and points; `undo` writes the old fields back.
 */
export function editChoreDef(
  uid: string,
  def: ChoreDef,
  draft: ChoreDefDraft,
): { ok: true; saved: Promise<void>; undo: () => Promise<void> } | { ok: false; problem: ChoreDefProblem } {
  const problem = choreDefProblem(draft);
  if (problem) return { ok: false, problem };
  return { ok: true, saved: updateChoreDef(uid, editedChoreDef(def, draft)), undo: () => updateChoreDef(uid, def) };
}

/** v1 deleteChoreDef() (there behind a confirmation; here with undo, D8). History stays. */
export function deleteChoreDef(uid: string, def: ChoreDef): { saved: Promise<void>; undo: () => Promise<void> } {
  return { saved: removeChoreDef(uid, def.id), undo: () => restoreChoreDef(uid, def) };
}

/** Accounts already checked since the app started (v1: once per page load). */
const seedChecked = new Set<string>();

/**
 * v1 ensureChoreDefsSeeded(), which runs when Chores or Settings open: an account
 * with no definitions gets v1's list. Once per account per app start, like v1, so
 * deleting the last definition does not bring the list straight back; a failure
 * (offline) leaves it for the next time.
 */
export async function ensureChoreDefs(uid: string): Promise<void> {
  if (seedChecked.has(uid)) return;
  seedChecked.add(uid);
  try {
    await seedChoreDefsIfEmpty(uid);
  } catch (error) {
    seedChecked.delete(uid);
    throw error;
  }
}

/** What Today's chore card shows (owner's request 2026-10-02); "chosen" needs at least one chore. */
export function saveChoresCard(
  uid: string,
  settings: ChoresCardSettings,
): { ok: true; saved: Promise<void> } | { ok: false; problem: 'noneChosen' } {
  if (settings.mode === 'chosen' && settings.ids.length === 0) return { ok: false, problem: 'noneChosen' };
  return { ok: true, saved: setChoresCard(uid, settings) };
}
