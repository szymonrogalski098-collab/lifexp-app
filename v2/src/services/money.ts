// Money use cases (docs/v2/PLAN.md 9, stage 3c; GOLDEN G5): the rules of
// domain/money, then the repository's transaction. Everything here moves money,
// so it is awaited and needs the server; offline it fails and changes nothing.
import {
  addMoneyTx,
  backfillMoneyIncome,
  deleteMoneyTx,
  ensureMoneyDocs,
  seedMoneyCategoriesIfEmpty,
  type TxOutcome,
} from '@/data/repos/money';
import { resolveCategory, txProblem, type MoneyCategory, type MoneyTx, type TxDraft, type TxProblem } from '@/domain/money';
import { utcDayKey } from '@/lib/dates';

export type TxSaveResult = { ok: true; pointsCost: number } | { ok: false; problem: TxProblem };

/**
 * v1 saveMoneyTx(): checked, then saved with its category (an existing one of the
 * same name, or a new one), dated today (UTC, G13) unless a date was picked.
 */
export async function saveTransaction(
  uid: string,
  draft: TxDraft,
  categories: readonly MoneyCategory[],
  rate: number,
  now = new Date(),
): Promise<TxSaveResult> {
  const problem = txProblem(draft);
  if (problem) return { ok: false, problem };
  return addMoneyTx(uid, {
    type: draft.type,
    grosze: draft.grosze ?? 0,
    category: resolveCategory(draft, categories),
    note: draft.note.trim(),
    date: draft.date || utcDayKey(now),
    rate,
    now,
  });
}

/** v1 deleteMoneyTx(): the balance, income counter and points go back. */
export function removeTransaction(uid: string, tx: MoneyTx): Promise<TxOutcome> {
  return deleteMoneyTx(uid, tx.id);
}

/** Accounts already prepared since the app started (v1: once per page load). */
const prepared = new Set<string>();

/**
 * v1 loadMoney() on opening Money: the settings and balance documents, the starting
 * categories, and M2 when the income counter is missing. Once per account per app
 * start; a failure (offline) leaves it for the next time.
 */
export async function prepareMoney(uid: string, incomeCounted: boolean): Promise<void> {
  if (prepared.has(uid)) return;
  prepared.add(uid);
  try {
    await ensureMoneyDocs(uid);
    await seedMoneyCategoriesIfEmpty(uid);
    if (!incomeCounted) await backfillMoneyIncome(uid);
  } catch (error) {
    prepared.delete(uid);
    throw error;
  }
}
