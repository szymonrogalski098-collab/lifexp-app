// moneyLoans documents → Loan and back (v1 money.js saveLoan; docs/v2/INVENTORY.md:
// no loans in production, so missing repaidAmount/completedAt read as 0 and null).
import type { DocumentData } from 'firebase/firestore';
import type { Loan, LoanDirection } from '@/domain/loans';
import { groszeFromZloty, zlotyFromGrosze } from '@/lib/money';
import { dateOrNull, dayKeyOrNull, numberOr, stringOr } from './fields';

export function loanFromData(id: string, data: DocumentData): Loan {
  return {
    id,
    person: stringOr(data.person),
    direction: data.direction === 'borrowed' ? 'borrowed' : 'lent',
    grosze: groszeFromZloty(numberOr(data.amount)),
    repaid: groszeFromZloty(numberOr(data.repaidAmount)),
    note: stringOr(data.note),
    date: dayKeyOrNull(data.date) ?? '',
    createdAt: dateOrNull(data.createdAt),
    completedAt: dateOrNull(data.completedAt),
  };
}

export interface NewLoan {
  direction: LoanDirection;
  person: string;
  grosze: number;
  note: string;
  date: string;
  now: Date;
}

/** v1 saveLoan(): nothing repaid yet. */
export function newLoanData(loan: NewLoan): DocumentData {
  return {
    person: loan.person,
    amount: zlotyFromGrosze(loan.grosze),
    repaidAmount: 0,
    direction: loan.direction,
    note: loan.note,
    date: loan.date,
    createdAt: loan.now,
    completedAt: null,
  };
}
