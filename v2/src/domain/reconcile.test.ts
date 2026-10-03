import { describe, expect, it } from 'vitest';
import type { Goal } from './goals';
import type { Loan } from './loans';
import { reconcile, type ReconcileInput } from './reconcile';

const loan = (patch: Partial<Loan>): Loan => ({
  id: 'l1',
  person: 'Ola',
  direction: 'lent',
  grosze: 0,
  repaid: 0,
  note: '',
  date: '2026-10-01',
  createdAt: null,
  completedAt: null,
  ...patch,
});

const goal = (patch: Partial<Goal>): Goal => ({
  id: 'g1',
  name: 'Rower',
  type: 'money',
  target: 100_000,
  saved: 0,
  celebrated: false,
  ...patch,
});

/** An account whose counters match its history exactly. */
const consistent = (): ReconcileInput => ({
  activities: [
    { points: 30, day: '2026-10-01' },
    { points: 20, day: '2026-10-01' },
    { points: 40, day: '2026-10-02' },
  ],
  dayLogs: new Map([
    ['2026-10-01', 50],
    ['2026-10-02', 40],
  ]),
  transactions: [
    { type: 'income', grosze: 10_000, pointsCost: 0, source: 'manual' },
    { type: 'income', grosze: 2_000, pointsCost: 0, source: 'chore_payout' },
    { type: 'expense', grosze: 1_500, pointsCost: 15, source: 'manual' },
  ],
  purchasePoints: [5],
  payouts: [2_000],
  loans: [],
  goals: [],
  points: { total: 70, earnedAllTime: 90, spentAllTime: 20 },
  balance: 10_500,
  incomeAllTime: 12_000,
});

const byId = (input: ReconcileInput) => Object.fromEntries(reconcile(input).checks.map((c) => [c.id, c]));

describe('reconcile', () => {
  it('finds nothing on an account whose counters match its history', () => {
    const result = reconcile(consistent());
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.days).toEqual([]);
  });

  it('counts the points of every activity and of expenses and v1 shop purchases', () => {
    const checks = byId({ ...consistent(), points: { total: 70, earnedAllTime: 100, spentAllTime: 25 } });
    expect(checks.earned).toMatchObject({ expected: 90, actual: 100, ok: false });
    expect(checks.spent).toMatchObject({ expected: 20, actual: 25, ok: false });
    expect(checks.total).toMatchObject({ expected: 75, actual: 70, ok: false });
  });

  it("lists the UTC days whose dailyLog is not the sum of that day's activities", () => {
    const input = consistent();
    const result = reconcile({
      ...input,
      activities: [...input.activities, { points: 10, day: '2026-09-30' }, { points: 5, day: null }],
      dayLogs: new Map([
        ['2026-10-02', 40],
        ['2026-10-01', 45],
        ['2026-09-29', 12],
      ]),
    });
    expect(result.days).toEqual([
      { day: '2026-09-29', expected: 0, actual: 12 },
      { day: '2026-09-30', expected: 10, actual: 0 },
      { day: '2026-10-01', expected: 50, actual: 45 },
    ]);
    expect(result.checks.find((c) => c.id === 'days')).toMatchObject({ unit: 'days', expected: 0, actual: 3, ok: false });
  });

  it('sets income transactions against moneyIncomeAllTime, missing as 0', () => {
    expect(byId({ ...consistent(), incomeAllTime: null }).income).toMatchObject({ expected: 12_000, actual: 0, ok: false });
  });

  it('expects the balance from transactions, minus goals, plus what is borrowed, minus what is lent', () => {
    const input: ReconcileInput = {
      ...consistent(),
      goals: [goal({ saved: 3_000 }), goal({ id: 'g2', type: 'points', target: 500 })],
      loans: [
        loan({ direction: 'lent', grosze: 2_000, repaid: 500 }),
        loan({ id: 'l2', direction: 'borrowed', grosze: 1_000 }),
      ],
      balance: 10_500 - 3_000 - 1_500 + 1_000,
    };
    const result = reconcile(input);
    expect(result.balance).toEqual({ transactions: 10_500, inGoals: 3_000, loans: -500, unrecordedPayouts: 0 });
    expect(result.checks.find((c) => c.id === 'balance')).toMatchObject({ expected: 7_000, actual: 7_000, ok: true });
  });

  it('shows chore payouts that have no income transaction, without counting them', () => {
    const result = reconcile({ ...consistent(), payouts: [2_000, 1_200, 800], balance: 12_500 });
    expect(result.balance.unrecordedPayouts).toBe(2_000);
    expect(result.checks.find((c) => c.id === 'balance')).toMatchObject({ expected: 10_500, actual: 12_500, ok: false });
  });

  it('reads a missing balance document as 0', () => {
    expect(byId({ ...consistent(), transactions: [], payouts: [], balance: null, incomeAllTime: 0 }).balance?.ok).toBe(true);
  });
});
