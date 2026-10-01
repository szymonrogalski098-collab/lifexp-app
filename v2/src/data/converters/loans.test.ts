import { describe, expect, test } from 'vitest';
import { loanFromData, newLoanData } from './loans';

describe('loan converters', () => {
  test('a new loan as v1 writes it, and back', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const data = newLoanData({ direction: 'borrowed', person: 'Tata', grosze: 5050, note: 'na bilet', date: '2026-10-01', now });
    expect(data).toEqual({
      person: 'Tata',
      amount: 50.5,
      repaidAmount: 0,
      direction: 'borrowed',
      note: 'na bilet',
      date: '2026-10-01',
      createdAt: now,
      completedAt: null,
    });
    expect(loanFromData('l1', data)).toMatchObject({ id: 'l1', direction: 'borrowed', grosze: 5050, repaid: 0, completedAt: null });
  });

  test('missing fields read as v1 treats them', () => {
    expect(loanFromData('l2', { person: 'Ola', amount: 20 })).toMatchObject({
      direction: 'lent',
      grosze: 2000,
      repaid: 0,
      note: '',
      date: '',
      completedAt: null,
    });
  });
});
