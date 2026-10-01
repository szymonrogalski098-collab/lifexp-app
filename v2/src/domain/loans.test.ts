import { describe, expect, test } from 'vitest';
import {
  deleteDelta,
  isSettled,
  loanProblem,
  loanTotals,
  newLoanDelta,
  outstanding,
  repaidShare,
  repayment,
  sortLoans,
  type Loan,
} from './loans';

const loan = (direction: Loan['direction'], grosze: number, repaid = 0, at = '2026-10-01T10:00:00Z'): Loan => ({
  id: `${direction}-${grosze}-${repaid}-${at}`,
  person: 'Tata',
  direction,
  grosze,
  repaid,
  note: '',
  date: '2026-10-01',
  createdAt: new Date(at),
  completedAt: null,
});

describe('G6 loans (v1 saveLoan, saveLoanRepay, deleteLoan)', () => {
  test('G6.1/G6.2: lending takes from the balance, borrowing adds', () => {
    expect(newLoanDelta('lent', 5000)).toBe(-5000);
    expect(newLoanDelta('borrowed', 5000)).toBe(5000);
  });

  test('G6.3/G6.4: a repayment is capped at what is left and moves the balance each way', () => {
    expect(repayment(loan('lent', 5000, 1000), 1500)).toEqual({ grosze: 1500, delta: 1500, repaid: 2500, settled: false });
    expect(repayment(loan('lent', 5000, 1000), 9999)).toEqual({ grosze: 4000, delta: 4000, repaid: 5000, settled: true });
    expect(repayment(loan('borrowed', 5000, 0), 5000)).toEqual({ grosze: 5000, delta: -5000, repaid: 5000, settled: true });
  });

  test('G6.5/G6.6: deleting undoes only what is outstanding', () => {
    expect(deleteDelta(loan('lent', 5000, 2000))).toBe(3000);
    expect(deleteDelta(loan('borrowed', 5000, 2000))).toBe(-3000);
    expect(deleteDelta(loan('lent', 5000, 5000))).toBe(0);
  });

  test('a person and an amount above zero are required', () => {
    const draft = { direction: 'lent' as const, person: 'Ola', grosze: 100, date: '', note: '' };
    expect(loanProblem(draft)).toBeNull();
    expect(loanProblem({ ...draft, person: ' ' })).toBe('personRequired');
    expect(loanProblem({ ...draft, grosze: null })).toBe('amountRequired');
    expect(loanProblem({ ...draft, grosze: 100_000_001 })).toBe('amountTooLarge');
  });

  test('totals each way, progress, and the order they were made', () => {
    const loans = [
      loan('borrowed', 3000, 1000, '2026-10-02T10:00:00Z'),
      loan('lent', 5000, 2000, '2026-10-01T10:00:00Z'),
      loan('lent', 1000, 1000, '2026-10-03T10:00:00Z'),
    ];
    expect(loanTotals(loans)).toEqual({ owedToMe: 3000, iOwe: 2000 });
    expect(sortLoans(loans).map((l) => l.direction)).toEqual(['lent', 'borrowed', 'lent']);
    expect(repaidShare(loans[1] as Loan)).toBe(0.4);
    expect(isSettled(loans[2] as Loan)).toBe(true);
    expect(outstanding(loans[2] as Loan)).toBe(0);
  });
});
