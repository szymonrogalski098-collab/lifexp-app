// Money documents → domain values and back (v1 money.js; docs/v2/INVENTORY.md:
// amounts are złoty as int or float, transactions without pointsCost or source
// read as 0 and 'manual'). Grosze inside, złoty in Firestore.
import type { DocumentData } from 'firebase/firestore';
import { CATEGORY_COLORS, MONEY_LIMIT_DEFAULT, type MoneyCategory, type MoneyTx, type TxType } from '@/domain/money';
import { groszeFromZloty, zlotyFromGrosze } from '@/lib/money';
import { dateOrNull, dayKeyOrNull, numberOr, stringOr } from './fields';

/** v1 shows anything that is not income as an expense, and reverses it as one. */
export function moneyTxFromData(id: string, data: DocumentData): MoneyTx {
  return {
    id,
    type: data.type === 'income' ? 'income' : 'expense',
    grosze: groszeFromZloty(numberOr(data.amount)),
    category: stringOr(data.category),
    note: stringOr(data.note),
    date: dayKeyOrNull(data.date) ?? '',
    source: stringOr(data.source, 'manual'),
    pointsCost: numberOr(data.pointsCost),
    createdAt: dateOrNull(data.createdAt),
  };
}

export interface NewTx {
  type: TxType;
  grosze: number;
  category: string;
  note: string;
  date: string;
  pointsCost: number;
  now: Date;
}

/** v1 persistMoneyTx(): the transaction as the form writes it. */
export function newMoneyTxData(tx: NewTx): DocumentData {
  return {
    type: tx.type,
    amount: zlotyFromGrosze(tx.grosze),
    category: tx.category,
    note: tx.note,
    date: tx.date,
    source: 'manual',
    pointsCost: tx.pointsCost,
    createdAt: tx.now,
  };
}

export function moneyCategoryFromData(id: string, data: DocumentData): MoneyCategory {
  return { id, name: stringOr(data.name), color: stringOr(data.color, CATEGORY_COLORS[0]) };
}

/** v1 addMoneyCategoryByName(): `icon` is always empty. */
export function moneyCategoryData(category: { name: string; color: string }): DocumentData {
  return { name: category.name, color: category.color, icon: '' };
}

/** money/settings.monthlyLimit in grosze; v1 falls back to 200 zł when it is missing. */
export function monthlyLimitFromData(data: DocumentData | undefined): number {
  const limit = data?.monthlyLimit;
  return typeof limit === 'number' && Number.isFinite(limit) ? groszeFromZloty(limit) : MONEY_LIMIT_DEFAULT;
}
