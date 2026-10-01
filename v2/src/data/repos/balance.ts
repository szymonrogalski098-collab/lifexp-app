// money/balance inside Firestore transactions, shared by everything that moves it
// (transactions, loans). v1 keeps `current` in złoty and creates the document with
// only that field when it is missing (updateMoneyCurrent).
import { doc, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase/firestore';
import { groszeFromZloty, zlotyFromGrosze } from '@/lib/money';
import { numberOr } from '../converters/fields';
import { db } from '../firebase';

export const moneyDoc = (uid: string, name: 'settings' | 'balance') => doc(db, 'users', uid, 'money', name);

/** The balance in grosze as read inside a transaction (0 without a document). */
export function balanceIn(snap: DocumentSnapshot): number {
  return snap.exists() ? groszeFromZloty(numberOr(snap.data().current)) : 0;
}

/** v1 updateMoneyCurrent(): `current` only, created if missing. */
export function writeBalance(tx: Transaction, ref: DocumentReference, snap: DocumentSnapshot, grosze: number) {
  if (snap.exists()) tx.update(ref, { current: zlotyFromGrosze(grosze) });
  else tx.set(ref, { current: zlotyFromGrosze(grosze) });
}
