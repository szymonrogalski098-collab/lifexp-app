// Writes for users/{uid}/chores, choreDefs and chorePayouts (docs/v2/PLAN.md 9, stage
// 3b; GOLDEN G8). Definitions and entries are read in repos/today.ts. Single-document
// writes resolve when the server has them; offline Firestore queues them and the
// listeners show them at once. The payout and the seed need the server.
import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CHORE_SEEDS,
  payoutPlan,
  type ChoreDef,
  type ChoreEntry,
  type ChorePayout,
  type ChoresCardSettings,
  type PayoutPlan,
} from '@/domain/chores';
import { groszeFromZloty, zlotyFromGrosze } from '@/lib/money';
import {
  choreDefData,
  choreEntryData,
  choreEntryFromData,
  chorePayoutFromData,
  newChoreEntryData,
} from '../converters/chores';
import { numberOr } from '../converters/fields';
import { choresCardData } from '../converters/profile';
import { db } from '../firebase';

type OnError = (error: unknown) => void;

const entriesOf = (uid: string) => collection(db, 'users', uid, 'chores');
const defsOf = (uid: string) => collection(db, 'users', uid, 'choreDefs');
const payoutsOf = (uid: string) => collection(db, 'users', uid, 'chorePayouts');

/**
 * v1 addChore(): the entry, and for a one-time chore the removal of its
 * definition (G8.4) — in one batch, so neither can happen without the other
 * (v1 writes them one after another and swallows a failed delete).
 */
export function addChoreEntry(uid: string, def: ChoreDef, dateISO: string, now: Date): { id: string; saved: Promise<void> } {
  const ref = doc(entriesOf(uid));
  const batch = writeBatch(db);
  batch.set(ref, newChoreEntryData(def, dateISO, now));
  if (def.oneTime) batch.delete(doc(defsOf(uid), def.id));
  return { id: ref.id, saved: batch.commit() };
}

/** Undo of addChoreEntry in one batch: the entry goes, a one-time definition comes back. */
export function undoChoreEntry(uid: string, entryId: string, def: ChoreDef): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(entriesOf(uid), entryId));
  if (def.oneTime) {
    const { id, ...data } = def;
    batch.set(doc(defsOf(uid), id), choreDefData(data));
  }
  return batch.commit();
}

export function removeChoreEntry(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(entriesOf(uid), id));
}

export function restoreChoreEntry(uid: string, entry: ChoreEntry): Promise<void> {
  return setDoc(doc(entriesOf(uid), entry.id), choreEntryData(entry));
}

/** v1 addChoreDef(): a new document under a generated id. */
export function addChoreDef(uid: string, def: Omit<ChoreDef, 'id'>): { id: string; saved: Promise<void> } {
  const ref = doc(defsOf(uid));
  return { id: ref.id, saved: setDoc(ref, choreDefData(def)) };
}

/** v1 deleteChoreDef(): entries keep their own copy of the name, so they are left alone. */
export function removeChoreDef(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(defsOf(uid), id));
}

/** Writes a definition's fields over the stored ones; fields v2 does not know stay. */
export function updateChoreDef(uid: string, def: ChoreDef): Promise<void> {
  const { id, ...data } = def;
  return updateDoc(doc(defsOf(uid), id), choreDefData(data));
}

export function restoreChoreDef(uid: string, def: ChoreDef): Promise<void> {
  const { id, ...data } = def;
  return setDoc(doc(defsOf(uid), id), choreDefData(data));
}

/**
 * v1 ensureChoreDefsSeeded(): an account without a single definition gets v1's
 * list. Asked of the server only — an empty cache offline says nothing about
 * the account, so offline this rejects and seeds nothing. Resolves to whether
 * it seeded.
 */
export async function seedChoreDefsIfEmpty(uid: string): Promise<boolean> {
  const snap = await getDocsFromServer(query(defsOf(uid), limit(1)));
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  for (const { id, ...data } of CHORE_SEEDS) batch.set(doc(defsOf(uid), id), choreDefData(data));
  await batch.commit();
  return true;
}

/** users/{uid}/chorePayouts, newest first. */
export function watchChorePayouts(uid: string, onChange: (payouts: ChorePayout[]) => void, onError: OnError) {
  return onSnapshot(
    query(payoutsOf(uid), orderBy('createdAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => chorePayoutFromData(d.id, d.data()))),
    onError,
  );
}

export interface SettleInput {
  /** The unpaid entries the person saw; each is read again inside the transaction. */
  entryIds: readonly string[];
  /** Złoty per point (choresRate), current at the time of paying (G8.7). */
  rate: number;
  /** Money category of the income, in the app's language (G8.8). */
  category: string;
  /** UTC day of the income (v1 todayStr()). */
  day: string;
  now: Date;
}

/**
 * v1 settleChores() as one transaction: the payout record, every entry deleted,
 * the balance, the income transaction and moneyIncomeAllTime change together or
 * not at all. v1 writes them one by one (a failure half-way leaves entries paid
 * but not deleted, or money without a record — B3), and reads the balance outside
 * any transaction (B4). Entries another device already paid are skipped; entries
 * logged meanwhile stay for the next payout. Resolves to what was paid, or null
 * when nothing was left.
 */
export function settleChoreEntries(uid: string, input: SettleInput): Promise<PayoutPlan | null> {
  return runTransaction(db, async (tx) => {
    const balanceRef = doc(db, 'users', uid, 'money', 'balance');
    const balance = await tx.get(balanceRef);
    const snaps = [];
    for (const id of input.entryIds) snaps.push(await tx.get(doc(entriesOf(uid), id)));
    const entries = snaps.flatMap((s) => (s.exists() ? (choreEntryFromData(s.id, s.data()) ?? []) : []));
    const plan = payoutPlan(entries, input.rate);
    if (!plan) return null;

    const amount = zlotyFromGrosze(plan.grosze);
    tx.set(doc(payoutsOf(uid)), {
      points: plan.points,
      amountPln: amount,
      fromISO: plan.fromISO,
      toISO: plan.toISO,
      createdAt: input.now,
    });
    for (const entry of entries) tx.delete(doc(entriesOf(uid), entry.id));
    // v1 updateMoneyCurrent(): round2(current + amount), or a new document with just `current`.
    if (balance.exists()) {
      const current = groszeFromZloty(numberOr(balance.data().current));
      tx.update(balanceRef, { current: zlotyFromGrosze(current + plan.grosze) });
    } else {
      tx.set(balanceRef, { current: amount });
    }
    tx.set(doc(collection(db, 'users', uid, 'moneyTransactions')), {
      type: 'income',
      amount,
      category: input.category,
      note: '',
      date: input.day,
      source: 'chore_payout',
      createdAt: input.now,
    });
    tx.update(doc(db, 'users', uid), { moneyIncomeAllTime: increment(amount) });
    return plan;
  });
}

/** users.choresCard (v2 only): what Today's chore card shows. Queued offline like any single write. */
export function setChoresCard(uid: string, settings: ChoresCardSettings): Promise<void> {
  return updateDoc(doc(db, 'users', uid), { choresCard: choresCardData(settings) });
}
