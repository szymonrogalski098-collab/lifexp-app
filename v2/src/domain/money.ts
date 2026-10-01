// Money as v1 keeps it (money.js; docs/v2/GOLDEN.md G5, G13): a balance that never
// goes below zero, transactions that move it, categories referenced by name. An
// expense also costs LifeXP points, as the old shop did. Amounts here are grosze
// (integers); the converters translate v1's złoty at the Firestore boundary.

/** v1 MONEY_LIMIT_DEFAULT (200 zł): the monthly spending limit until one is set. */
export const MONEY_LIMIT_DEFAULT = 20000;
/** v1 MONEY_CAT_COLORS: a new category takes the next one in turn. */
export const CATEGORY_COLORS: readonly string[] = [
  '#6c63ff',
  '#4ecca3',
  '#ffd700',
  '#ff6b6b',
  '#00d2d3',
  '#ff9f43',
  '#feca57',
  '#8a8fa8',
];
/** v1 loadMoneyCategories(): what an account without categories starts with. */
export const CATEGORY_SEEDS: readonly string[] = ['kieszonkowe', 'gry', 'jedzenie', 'szkoła', 'inne'];
/** v1's form fields (maxlength / max). */
export const CATEGORY_NAME_MAX = 30;
export const TX_NOTE_MAX = 100;
export const TX_AMOUNT_MAX = 100_000_000;

export type TxType = 'income' | 'expense';

/** users/{uid}/moneyTransactions/{id}. */
export interface MoneyTx {
  id: string;
  type: TxType;
  grosze: number;
  /** A category's name, not its id (v1). */
  category: string;
  note: string;
  /** "YYYY-MM-DD"; v1 defaults it to the UTC day (G13). '' when missing (then in no list). */
  date: string;
  /** 'manual' from the form, 'chore_payout' from Chores. */
  source: string;
  /** Points taken by an expense, given back if it is deleted. */
  pointsCost: number;
  createdAt: Date | null;
}

/** users/{uid}/moneyCategories/{id}. */
export interface MoneyCategory {
  id: string;
  name: string;
  color: string;
}

/** v1 sorts categories by name, Polish order. */
export function sortCategories(categories: readonly MoneyCategory[]): MoneyCategory[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

// ── A new transaction (v1 saveMoneyTx) ──

export interface TxDraft {
  type: TxType;
  /** null = empty or not a valid amount. */
  grosze: number | null;
  /** The chosen category's name; '' = none chosen. */
  category: string;
  /** The name typed for a new category; null = an existing one is chosen. */
  newCategory: string | null;
  note: string;
  /** "YYYY-MM-DD"; '' falls back to today (UTC), as in v1. */
  date: string;
}

export type TxProblem = 'amountRequired' | 'amountTooLarge' | 'categoryRequired' | 'notEnoughBalance';

/** v1 saveMoneyTx(): an amount above zero and a category (the balance is checked when saving). */
export function txProblem(draft: TxDraft): TxProblem | null {
  if (draft.grosze === null || draft.grosze <= 0) return 'amountRequired';
  if (draft.grosze > TX_AMOUNT_MAX) return 'amountTooLarge';
  const category = draft.newCategory !== null ? draft.newCategory.trim() : draft.category;
  if (!category) return 'categoryRequired';
  return null;
}

/** +amount for income, −amount for an expense. */
export function balanceDelta(type: TxType, grosze: number): number {
  return type === 'income' ? grosze : -grosze;
}

/** G5.5: the balance never goes below zero (v1 blocks before saving anything). */
export function fitsBalance(balance: number, delta: number): boolean {
  return balance + delta >= 0;
}

/**
 * G5.1–G5.4 (v1 pointsCostForTx): an expense costs ceil(złoty / rate) points, no more
 * than the person has. Same float expression as v1, so the same rounding.
 */
export function pointsCost(type: TxType, grosze: number, rate: number, pointsTotal: number): number {
  if (type !== 'expense') return 0;
  return Math.max(0, Math.min(Math.ceil(grosze / 100 / rate), pointsTotal));
}

export interface ResolvedCategory {
  name: string;
  /** A category to create with the transaction; null when it exists. */
  create: { name: string; color: string } | null;
}

/** v1 addMoneyCategoryByName(): an existing one with the same name (any case) is reused. */
export function resolveCategory(draft: TxDraft, categories: readonly MoneyCategory[]): ResolvedCategory {
  if (draft.newCategory === null) return { name: draft.category, create: null };
  const name = draft.newCategory.trim();
  const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return { name: existing.name, create: null };
  return { name, create: { name, color: nextCategoryColor(categories) } };
}

/** v1 addMoneyCategoryByName(): colours go round in the order categories were added. */
export function nextCategoryColor(categories: readonly MoneyCategory[]): string {
  return CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] as string;
}

// ── Categories and the limit (v1 Settings → Money) ──

export type CategoryProblem = 'nameRequired' | 'categoryExists';

/** v1 addMoneyCategory(): a name (trimmed) that no category has yet, in any case. */
export function categoryProblem(name: string, categories: readonly MoneyCategory[]): CategoryProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return 'nameRequired';
  if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return 'categoryExists';
  return null;
}

/** v1 saveMoneyLimit(): an empty or unreadable limit falls back to 200 zł; 0 means no limit. */
export function limitFromInput(grosze: number | null): number {
  return grosze ?? MONEY_LIMIT_DEFAULT;
}

// ── The list (v1 renderMoneyTxList, renderMoneyArchiveSelect) ──

/** Newest day first; within a day, the latest saved first. */
export function sortTxs(txs: readonly MoneyTx[]): MoneyTx[] {
  return [...txs].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
}

/** v1 "Ostatnie 30 dni": dated on or after the local day 30 days ago. */
export function recentTxs(txs: readonly MoneyTx[], cutoff: string): MoneyTx[] {
  return txs.filter((t) => t.date >= cutoff);
}

export function txsInMonth(txs: readonly MoneyTx[], monthKey: string): MoneyTx[] {
  return txs.filter((t) => t.date.startsWith(monthKey));
}

/** The months that have transactions, newest first ("YYYY-MM"). */
export function archiveMonths(txs: readonly MoneyTx[]): string[] {
  return [...new Set(txs.map((t) => t.date.slice(0, 7)).filter(Boolean))].sort().reverse();
}

export interface TxDay {
  date: string;
  txs: MoneyTx[];
}

/** Consecutive transactions of one day together, in the order given. */
export function groupByDay(txs: readonly MoneyTx[]): TxDay[] {
  const days: TxDay[] = [];
  for (const tx of txs) {
    const last = days[days.length - 1];
    if (last && last.date === tx.date) last.txs.push(tx);
    else days.push({ date: tx.date, txs: [tx] });
  }
  return days;
}

// ── The month (v1 renderMoneyLimitAlert; PLAN.md 7.6 U14) ──

export interface Flow {
  income: number;
  expense: number;
}

/** Income and expenses of a month, up to and including `lastDay` ("DD") when given. */
export function monthFlow(txs: readonly MoneyTx[], monthKey: string, lastDay?: number): Flow {
  const flow: Flow = { income: 0, expense: 0 };
  for (const t of txsInMonth(txs, monthKey)) {
    if (lastDay !== undefined && Number(t.date.slice(8, 10)) > lastDay) continue;
    flow[t.type] += t.grosze;
  }
  return flow;
}

export interface MonthComparison {
  current: Flow;
  /** The previous month up to the same day of the month (or its last day). */
  previous: Flow;
  /** The last day counted in the previous month, "YYYY-MM-DD". */
  previousUntil: string;
}

/** This month so far against the previous one up to the same day (`today` is local). */
export function compareMonths(txs: readonly MoneyTx[], today: string): MonthComparison {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevLength = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const until = Math.min(d, prevLength);
  return {
    current: monthFlow(txs, today.slice(0, 7), d),
    previous: monthFlow(txs, prevKey, until),
    previousUntil: `${prevKey}-${String(until).padStart(2, '0')}`,
  };
}

export interface LimitStatus {
  spent: number;
  limit: number;
  exceeded: boolean;
}

/** v1 renderMoneyLimitAlert(): this month's expenses over a limit above zero (0 = no limit). */
export function limitStatus(txs: readonly MoneyTx[], monthKey: string, limit: number): LimitStatus {
  const spent = monthFlow(txs, monthKey).expense;
  return { spent, limit, exceeded: limit > 0 && spent > limit };
}

// ── M2 (PLAN.md 5.4; v1 migrateMoneyIncome) ──

/** Everything ever received, for an account that has no moneyIncomeAllTime yet. */
export function incomeAllTime(txs: readonly MoneyTx[]): number {
  return txs.reduce((sum, t) => (t.type === 'income' ? sum + t.grosze : sum), 0);
}
