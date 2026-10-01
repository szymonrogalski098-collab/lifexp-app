// Reads and writes for Money (docs/v2/PLAN.md 9, stage 3c; GOLDEN G5): money/settings,
// money/balance, moneyTransactions and moneyCategories under users/{uid}. Anything
// that moves the balance is one transaction that reads the balance first, so two
// tabs cannot lose each other's change (v1 reads and writes it separately, B4) and
// the balance never goes below zero. Transactions need the server.
import {
  collection,
  doc,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  deleteDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import {
  CATEGORY_COLORS,
  CATEGORY_SEEDS,
  balanceDelta,
  fitsBalance,
  incomeAllTime,
  pointsCost,
  type MoneyCategory,
  type MoneyTx,
  type ResolvedCategory,
  type TxType,
} from '@/domain/money';
import { zlotyFromGrosze } from '@/lib/money';
import {
  moneyCategoryData,
  moneyCategoryFromData,
  moneyTxFromData,
  monthlyLimitFromData,
  newMoneyTxData,
} from '../converters/money';
import { numberOr } from '../converters/fields';
import { db } from '../firebase';
import { balanceIn, moneyDoc, writeBalance } from './balance';

type OnError = (error: unknown) => void;

const txsOf = (uid: string) => collection(db, 'users', uid, 'moneyTransactions');
const categoriesOf = (uid: string) => collection(db, 'users', uid, 'moneyCategories');
const userOf = (uid: string) => doc(db, 'users', uid);

/** Every transaction (v1 loads them all; the screen picks what to show). */
export function watchMoneyTxs(uid: string, onChange: (txs: MoneyTx[]) => void, onError: OnError) {
  return onSnapshot(txsOf(uid), (snap) => onChange(snap.docs.map((d) => moneyTxFromData(d.id, d.data()))), onError);
}

export function watchMoneyCategories(uid: string, onChange: (categories: MoneyCategory[]) => void, onError: OnError) {
  return onSnapshot(
    categoriesOf(uid),
    (snap) => onChange(snap.docs.map((d) => moneyCategoryFromData(d.id, d.data()))),
    onError,
  );
}

/** money/settings.monthlyLimit in grosze. */
export function watchMonthlyLimit(uid: string, onChange: (limit: number) => void, onError: OnError) {
  return onSnapshot(moneyDoc(uid, 'settings'), (snap) => onChange(monthlyLimitFromData(snap.data())), onError);
}

/** v1 loadMoneyDocs(): both documents exist once Money has been opened. */
export function ensureMoneyDocs(uid: string): Promise<void> {
  return runTransaction(db, async (tx) => {
    const settings = await tx.get(moneyDoc(uid, 'settings'));
    const balance = await tx.get(moneyDoc(uid, 'balance'));
    if (!settings.exists()) tx.set(moneyDoc(uid, 'settings'), { monthlyLimit: 200, currency: 'PLN' });
    if (!balance.exists()) tx.set(moneyDoc(uid, 'balance'), { current: 0 });
  });
}

/**
 * v1 loadMoneyCategories(): an account without categories gets v1's five. Asked of
 * the server only (offline an empty cache says nothing). Resolves to whether it seeded.
 */
export async function seedMoneyCategoriesIfEmpty(uid: string): Promise<boolean> {
  const snap = await getDocsFromServer(query(categoriesOf(uid), limit(1)));
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  CATEGORY_SEEDS.forEach((name, i) =>
    batch.set(doc(categoriesOf(uid)), moneyCategoryData({ name, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] as string })),
  );
  await batch.commit();
  return true;
}

/**
 * M2 (v1 migrateMoneyIncome): an account without moneyIncomeAllTime gets the sum of
 * every income so far. The field is checked again in the transaction, so a value
 * written meanwhile (by v1 or another tab) wins. Resolves to whether it wrote.
 */
export async function backfillMoneyIncome(uid: string): Promise<boolean> {
  const snap = await getDocsFromServer(txsOf(uid));
  const sum = incomeAllTime(snap.docs.map((d) => moneyTxFromData(d.id, d.data())));
  return runTransaction(db, async (tx) => {
    const user = await tx.get(userOf(uid));
    if (typeof user.data()?.moneyIncomeAllTime === 'number') return false;
    tx.update(userOf(uid), { moneyIncomeAllTime: zlotyFromGrosze(sum) });
    return true;
  });
}

export interface AddTxInput {
  type: TxType;
  grosze: number;
  category: ResolvedCategory;
  note: string;
  date: string;
  /** Złoty per point (generalRate), for an expense's points cost. */
  rate: number;
  now: Date;
}

export type TxOutcome = { ok: true; pointsCost: number } | { ok: false; problem: 'notEnoughBalance' };

/**
 * v1 saveMoneyTx() as one transaction: the balance check against the server's
 * balance (G5.5), a new category if one was typed, the transaction, the balance,
 * and on the profile the income counter or the points an expense costs (G5.1–G5.6).
 */
export function addMoneyTx(uid: string, input: AddTxInput): Promise<TxOutcome> {
  return runTransaction(db, async (tx): Promise<TxOutcome> => {
    const balanceRef = moneyDoc(uid, 'balance');
    const balance = await tx.get(balanceRef);
    const user = await tx.get(userOf(uid));
    const current = balanceIn(balance);
    const delta = balanceDelta(input.type, input.grosze);
    if (!fitsBalance(current, delta)) return { ok: false, problem: 'notEnoughBalance' };

    const points = user.data()?.points;
    const cost = pointsCost(input.type, input.grosze, input.rate, numberOr(points?.total));
    if (input.category.create) tx.set(doc(categoriesOf(uid)), moneyCategoryData(input.category.create));
    tx.set(
      doc(txsOf(uid)),
      newMoneyTxData({
        type: input.type,
        grosze: input.grosze,
        category: input.category.name,
        note: input.note,
        date: input.date,
        pointsCost: cost,
        now: input.now,
      }),
    );
    writeBalance(tx, balanceRef, balance, current + delta);
    const profile: DocumentData = {};
    if (input.type === 'income') profile.moneyIncomeAllTime = increment(zlotyFromGrosze(input.grosze));
    if (cost > 0) {
      profile['points.total'] = increment(-cost);
      profile['points.spentAllTime'] = increment(cost);
    }
    if (Object.keys(profile).length) tx.update(userOf(uid), profile);
    return { ok: true, pointsCost: cost };
  });
}

/**
 * v1 deleteMoneyTx() as one transaction: the balance back, the income counter down,
 * the points of an expense returned. Unlike v1, refused when taking an income back
 * would leave the balance below zero. Resolves ok when the transaction is already gone.
 */
export function deleteMoneyTx(uid: string, id: string): Promise<TxOutcome> {
  return runTransaction(db, async (tx): Promise<TxOutcome> => {
    const ref = doc(txsOf(uid), id);
    const balanceRef = moneyDoc(uid, 'balance');
    const snap = await tx.get(ref);
    const balance = await tx.get(balanceRef);
    if (!snap.exists()) return { ok: true, pointsCost: 0 };
    const t = moneyTxFromData(snap.id, snap.data());
    const current = balanceIn(balance);
    const delta = -balanceDelta(t.type, t.grosze);
    if (!fitsBalance(current, delta)) return { ok: false, problem: 'notEnoughBalance' };

    tx.delete(ref);
    writeBalance(tx, balanceRef, balance, current + delta);
    const profile: DocumentData = {};
    if (t.type === 'income') profile.moneyIncomeAllTime = increment(-zlotyFromGrosze(t.grosze));
    if (t.pointsCost > 0) {
      profile['points.total'] = increment(t.pointsCost);
      profile['points.spentAllTime'] = increment(-t.pointsCost);
    }
    if (Object.keys(profile).length) tx.update(userOf(uid), profile);
    return { ok: true, pointsCost: t.pointsCost };
  });
}

/** v1 saveMoneyLimit(): merged into money/settings with the currency. */
export function setMonthlyLimit(uid: string, grosze: number): Promise<void> {
  return setDoc(moneyDoc(uid, 'settings'), { monthlyLimit: zlotyFromGrosze(grosze), currency: 'PLN' }, { merge: true });
}

/** v1 addMoneyCategory(): a new document under a generated id. */
export function addMoneyCategory(uid: string, category: { name: string; color: string }): { id: string; saved: Promise<void> } {
  const ref = doc(categoriesOf(uid));
  return { id: ref.id, saved: setDoc(ref, moneyCategoryData(category)) };
}

/** v1 deleteMoneyCategory(): transactions keep the name, so they are left alone. */
export function removeMoneyCategory(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(categoriesOf(uid), id));
}

export function restoreMoneyCategory(uid: string, category: MoneyCategory): Promise<void> {
  return setDoc(doc(categoriesOf(uid), category.id), moneyCategoryData(category));
}
