import { describe, expect, test } from 'vitest';
import { monthlyLimitFromData, moneyCategoryData, moneyCategoryFromData, moneyTxFromData, newMoneyTxData } from './money';

describe('money converters', () => {
  test('a transaction as v1 writes it, amounts as float złoty', () => {
    const createdAt = new Date('2026-10-01T10:00:00Z');
    const data = newMoneyTxData({
      type: 'expense',
      grosze: 499,
      category: 'gry',
      note: 'skin',
      date: '2026-10-01',
      pointsCost: 50,
      now: createdAt,
    });
    expect(data).toEqual({
      type: 'expense',
      amount: 4.99,
      category: 'gry',
      note: 'skin',
      date: '2026-10-01',
      source: 'manual',
      pointsCost: 50,
      createdAt,
    });
    expect(moneyTxFromData('t1', data)).toEqual({
      id: 't1',
      type: 'expense',
      grosze: 499,
      category: 'gry',
      note: 'skin',
      date: '2026-10-01',
      source: 'manual',
      pointsCost: 50,
      createdAt: null,
    });
  });

  test('old transactions without pointsCost or source, and odd types', () => {
    const tx = moneyTxFromData('t2', { type: 'refund', amount: 12, category: 'inne', date: '2026-09-01' });
    expect(tx).toMatchObject({ type: 'expense', grosze: 1200, note: '', source: 'manual', pointsCost: 0 });
    expect(moneyTxFromData('t3', { type: 'income', amount: 3 }).date).toBe('');
  });

  test('categories and the monthly limit', () => {
    expect(moneyCategoryData({ name: 'gry', color: '#ffd700' })).toEqual({ name: 'gry', color: '#ffd700', icon: '' });
    expect(moneyCategoryFromData('c', { name: 'gry' })).toEqual({ id: 'c', name: 'gry', color: '#6c63ff' });
    expect(monthlyLimitFromData(undefined)).toBe(20000);
    expect(monthlyLimitFromData({ monthlyLimit: 0 })).toBe(0);
    expect(monthlyLimitFromData({ monthlyLimit: 150.5 })).toBe(15050);
    expect(monthlyLimitFromData({ monthlyLimit: null })).toBe(20000);
  });
});
