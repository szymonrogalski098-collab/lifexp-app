// Writes for users/{uid}/chores and choreDefs (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8).
// Reads live in repos/today.ts (watchChoreDefs, watchChoreEntries). Writes resolve
// when the server has them; offline Firestore queues them and the listeners show
// them at once.
import { collection, deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import type { ChoreDef, ChoreEntry } from '@/domain/chores';
import { choreEntryData, newChoreEntryData } from '../converters/chores';
import { db } from '../firebase';

const entriesOf = (uid: string) => collection(db, 'users', uid, 'chores');
const defsOf = (uid: string) => collection(db, 'users', uid, 'choreDefs');

/**
 * v1 addChore(): the entry, and for a one-time chore the removal of its
 * definition (G8.4) — in one batch, so neither can happen without the other
 * (v1 writes them one after another and swallows a failed delete).
 */
export function addChoreEntry(uid: string, def: ChoreDef, dateISO: string, now: Date): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(entriesOf(uid)), newChoreEntryData(def, dateISO, now));
  if (def.oneTime) batch.delete(doc(defsOf(uid), def.id));
  return batch.commit();
}

export function removeChoreEntry(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(entriesOf(uid), id));
}

export function restoreChoreEntry(uid: string, entry: ChoreEntry): Promise<void> {
  return setDoc(doc(entriesOf(uid), entry.id), choreEntryData(entry));
}
