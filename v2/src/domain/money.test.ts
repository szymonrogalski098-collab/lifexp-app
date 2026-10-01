import { describe, expect, test } from 'vitest';
import {
  archiveMonths,
  balanceDelta,
  categoryProblem,
  compareMonths,
  fitsBalance,
  groupByDay,
  incomeAllTime,
  limitFromInput,
  limitStatus,
  nextCategoryColor,
  pointsCost,
  recentTxs,
  resolveCategory,
  sortTxs,
  txProblem,
  type MoneyCategory,
  type MoneyTx,
  type TxDraft,
} from './money';

let n = 0;
const tx = (type: MoneyTx['type'], grosze: number, date: string, at = `${date}T10:00:00Z`): MoneyTx => ({
  id: `t${(n += 1)}`,
  type,
  grosze,
  category: 'inne',
  note: '',
  date,
  source: 'manual',
  pointsCost: 0,
  createdAt: new Date(at),
});

const draft = (patch: Partial<TxDraft> = {}): TxDraft => ({
  type: 'expense',
  grosze: 500,
  category: 'jedzenie',
  newCategory: null,
  note: '',
  date: '2026-10-01',
  ...patch,
});

const RATE = 1 / 10;

describe('G5 a transaction (v1 saveMoneyTx)', () => {
  test('G5.1–G5.4: an expense costs ceil(złoty / rate) points, at most what there is', () => {
    expect(pointsCost('expense', 500, RATE, 120)).toBe(50);
    expect(pointsCost('expense', 499, RATE, 120)).toBe(50);
    expect(pointsCost('expense', 1, RATE, 120)).toBe(1);
    expect(pointsCost('expense', 2000, RATE, 120)).toBe(120);
    expect(pointsCost('expense', 500, RATE, 0)).toBe(0);
    expect(pointsCost('income', 3000, RATE, 120)).toBe(0);
  });

  test('the cost matches v1 for every amount up to 1000 zł at the default rate', () => {
    for (let grosze = 1; grosze <= 100000; grosze += 1) {
      const v1 = Math.ceil(Math.round((grosze / 100) * 100) / 100 / RATE);
      expect(pointsCost('expense', grosze, RATE, Infinity)).toBe(v1);
    }
  });

  test('G5.5/G5.6: the balance never goes below zero; income only adds', () => {
    expect(fitsBalance(5000, balanceDelta('expense', 500))).toBe(true);
    expect(fitsBalance(5000, balanceDelta('expense', 5000))).toBe(true);
    expect(fitsBalance(5000, balanceDelta('expense', 6000))).toBe(false);
    expect(balanceDelta('income', 3000)).toBe(3000);
  });

  test('an amount above zero and a category are required', () => {
    expect(txProblem(draft())).toBeNull();
    expect(txProblem(draft({ grosze: null }))).toBe('amountRequired');
    expect(txProblem(draft({ grosze: 0 }))).toBe('amountRequired');
    expect(txProblem(draft({ grosze: 100_000_001 }))).toBe('amountTooLarge');
    expect(txProblem(draft({ category: '' }))).toBe('categoryRequired');
    expect(txProblem(draft({ newCategory: '  ' }))).toBe('categoryRequired');
    expect(txProblem(draft({ category: '', newCategory: 'Prezenty' }))).toBeNull();
  });

  test('a new category reuses one with the same name, or takes the next colour', () => {
    const cats: MoneyCategory[] = [
      { id: 'a', name: 'gry', color: '#6c63ff' },
      { id: 'b', name: 'Jedzenie', color: '#4ecca3' },
    ];
    expect(resolveCategory(draft(), cats)).toEqual({ name: 'jedzenie', create: null });
    expect(resolveCategory(draft({ newCategory: ' jedzenie ' }), cats)).toEqual({ name: 'Jedzenie', create: null });
    expect(resolveCategory(draft({ newCategory: ' Prezenty ' }), cats)).toEqual({
      name: 'Prezenty',
      create: { name: 'Prezenty', color: '#ffd700' },
    });
  });
});

describe('the list (v1 renderMoneyTxList)', () => {
  const list = [
    tx('expense', 100, '2026-09-30', '2026-09-30T08:00:00Z'),
    tx('income', 200, '2026-10-01'),
    tx('expense', 300, '2026-09-30', '2026-09-30T09:00:00Z'),
    tx('expense', 400, '2026-08-31'),
  ];

  test('newest day first, latest saved first within a day, grouped by day', () => {
    const sorted = sortTxs(list);
    expect(sorted.map((t) => t.grosze)).toEqual([200, 300, 100, 400]);
    expect(groupByDay(sorted).map((d) => [d.date, d.txs.length])).toEqual([
      ['2026-10-01', 1],
      ['2026-09-30', 2],
      ['2026-08-31', 1],
    ]);
  });

  test('the last 30 days and the months of the archive', () => {
    expect(recentTxs(list, '2026-09-01').map((t) => t.grosze)).toEqual([100, 200, 300]);
    expect(archiveMonths(list)).toEqual(['2026-10', '2026-09', '2026-08']);
  });
});

describe('the month (limit, comparison)', () => {
  test('the limit is exceeded only above it, and 0 means none', () => {
    const list = [tx('expense', 15000, '2026-10-01'), tx('expense', 5000, '2026-10-02'), tx('income', 90000, '2026-10-02')];
    expect(limitStatus(list, '2026-10', 20000)).toEqual({ spent: 20000, limit: 20000, exceeded: false });
    expect(limitStatus([...list, tx('expense', 1, '2026-10-03')], '2026-10', 20000).exceeded).toBe(true);
    expect(limitStatus(list, '2026-10', 0).exceeded).toBe(false);
  });

  test('this month so far against the previous one up to the same day', () => {
    const list = [
      tx('expense', 1000, '2026-10-05'),
      tx('income', 5000, '2026-10-02'),
      tx('expense', 700, '2026-09-05'),
      tx('expense', 9000, '2026-09-06'),
      tx('income', 2000, '2026-09-01'),
    ];
    expect(compareMonths(list, '2026-10-05')).toEqual({
      current: { income: 5000, expense: 1000 },
      previous: { income: 2000, expense: 700 },
      previousUntil: '2026-09-05',
    });
  });

  test('the 31st compares with the last day of a shorter month, across the year', () => {
    expect(compareMonths([], '2026-03-31').previousUntil).toBe('2026-02-28');
    expect(compareMonths([], '2028-03-31').previousUntil).toBe('2028-02-29');
    expect(compareMonths([], '2027-01-15').previousUntil).toBe('2026-12-15');
  });

  test('M2: everything ever received', () => {
    expect(incomeAllTime([tx('income', 1050, '2026-01-01'), tx('expense', 99, '2026-01-02'), tx('income', 1, '2026-02-01')])).toBe(
      1051,
    );
  });
});

describe('categories and the limit (v1 Settings → Money)', () => {
  const cats: MoneyCategory[] = [
    { id: 'a', name: 'gry', color: '#6c63ff' },
    { id: 'b', name: 'Jedzenie', color: '#4ecca3' },
  ];

  test('a new category needs a name no category has, in any case', () => {
    expect(categoryProblem(' Prezenty ', cats)).toBeNull();
    expect(categoryProblem('  ', cats)).toBe('nameRequired');
    expect(categoryProblem('jedzenie', cats)).toBe('categoryExists');
    expect(nextCategoryColor(cats)).toBe('#ffd700');
    expect(nextCategoryColor([...cats, ...cats, ...cats, ...cats])).toBe('#6c63ff');
  });

  test('an empty limit is 200 zł, 0 is no limit', () => {
    expect(limitFromInput(null)).toBe(20000);
    expect(limitFromInput(0)).toBe(0);
    expect(limitFromInput(15050)).toBe(15050);
  });
});
