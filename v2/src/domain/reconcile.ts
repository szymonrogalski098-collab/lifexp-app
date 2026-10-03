// "Sprawdź spójność" (docs/v2/PLAN.md 5.5 point 4): the account's counters set against
// what its history adds up to. Read-only: it shows differences and changes nothing.
//
// Points: activities earn them (v1 and v2 store the credited points on the entry);
// Money expenses and v1 shop purchases (`purchases`) spend them; deleting either
// gives them back, so the sums of what exists today are what the counters should say.
// Money: until M6, goal deposits and loans move the balance without a transaction,
// so the balance expected from history counts the goals and the loans that are
// outstanding. Chore payouts from before v1 recorded them as income have a payout
// record but no transaction; they are shown, not counted, since a payout's
// transaction may also have been deleted on purpose.
import { savedInGoals, type Goal } from './goals';
import { loanTotals, type Loan } from './loans';

export interface ReconcileInput {
  /** Points of every activity, and its UTC day (null without a timestamp). */
  activities: readonly { points: number; day: string | null }[];
  /** dailyLog: UTC day → pointsEarned. */
  dayLogs: ReadonlyMap<string, number>;
  /** Every Money transaction (grosze). */
  transactions: readonly { type: 'income' | 'expense'; grosze: number; pointsCost: number; source: string }[];
  /** pointsCost of every v1 shop purchase. */
  purchasePoints: readonly number[];
  /** Grosze of every chore payout record. */
  payouts: readonly number[];
  loans: readonly Loan[];
  goals: readonly Goal[];
  points: { total: number; earnedAllTime: number; spentAllTime: number };
  /** money/balance (grosze); null without the document. */
  balance: number | null;
  /** users.moneyIncomeAllTime (grosze); null when missing. */
  incomeAllTime: number | null;
}

export type CheckId = 'earned' | 'spent' | 'total' | 'days' | 'income' | 'balance';

export interface Check {
  id: CheckId;
  /** 'days': expected 0 days that differ, actual how many do. */
  unit: 'points' | 'grosze' | 'days';
  /** What the history adds up to. */
  expected: number;
  /** What the account says. */
  actual: number;
  ok: boolean;
}

export interface DayDifference {
  day: string;
  /** Sum of the day's activities. */
  expected: number;
  /** The day's dailyLog (0 without one). */
  actual: number;
}

export interface BalanceParts {
  /** Income minus expenses. */
  transactions: number;
  /** Put aside in money goals (taken from the balance). */
  inGoals: number;
  /** Borrowed minus lent, still outstanding. */
  loans: number;
  /** Chore payouts beyond the chore_payout income transactions. */
  unrecordedPayouts: number;
}

export interface Reconciliation {
  checks: Check[];
  /** UTC days whose dailyLog differs from their activities, oldest first. */
  days: DayDifference[];
  balance: BalanceParts;
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function reconcile(input: ReconcileInput): Reconciliation {
  const expenses = input.transactions.filter((t) => t.type === 'expense');
  const incomes = input.transactions.filter((t) => t.type === 'income');
  const earned = sum(input.activities.map((a) => a.points));
  const spent = sum(expenses.map((t) => t.pointsCost)) + sum(input.purchasePoints);
  const income = sum(incomes.map((t) => t.grosze));

  // G1: a UTC day's dailyLog is the sum of that day's activities (a day without a log counts as 0).
  const perDay = new Map<string, number>();
  for (const a of input.activities) if (a.day) perDay.set(a.day, (perDay.get(a.day) ?? 0) + a.points);
  const days = [...new Set([...perDay.keys(), ...input.dayLogs.keys()])]
    .sort()
    .map((day) => ({ day, expected: perDay.get(day) ?? 0, actual: input.dayLogs.get(day) ?? 0 }))
    .filter((d) => d.expected !== d.actual);

  const { owedToMe, iOwe } = loanTotals(input.loans);
  const recordedPayouts = sum(incomes.filter((t) => t.source === 'chore_payout').map((t) => t.grosze));
  const balance: BalanceParts = {
    transactions: income - sum(expenses.map((t) => t.grosze)),
    inGoals: savedInGoals(input.goals),
    loans: iOwe - owedToMe,
    unrecordedPayouts: Math.max(0, sum(input.payouts) - recordedPayouts),
  };

  const check = (id: CheckId, unit: Check['unit'], expected: number, actual: number): Check => ({
    id,
    unit,
    expected,
    actual,
    ok: expected === actual,
  });
  const { total, earnedAllTime, spentAllTime } = input.points;

  return {
    checks: [
      check('earned', 'points', earned, earnedAllTime),
      check('spent', 'points', spent, spentAllTime),
      check('total', 'points', earnedAllTime - spentAllTime, total),
      check('days', 'days', 0, days.length),
      check('income', 'grosze', income, input.incomeAllTime ?? 0),
      check('balance', 'grosze', balance.transactions - balance.inGoals + balance.loans, input.balance ?? 0),
    ],
    days,
    balance,
  };
}
