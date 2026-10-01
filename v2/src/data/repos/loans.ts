// moneyLoans under users/{uid} (docs/v2/PLAN.md 9, stage 3c; GOLDEN G6). Every
// change reads the loan and the balance in one transaction and writes both, so a
// repayment can never count twice and the balance never goes below zero (v1 writes
// them separately and checks a balance it read earlier, B3/B4). Needs the server.
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import {
  deleteDelta,
  newLoanDelta,
  repayment,
  type Loan,
  type LoanDirection,
} from '@/domain/loans';
import { fitsBalance } from '@/domain/money';
import { zlotyFromGrosze } from '@/lib/money';
import { loanFromData, newLoanData } from '../converters/loans';
import { db } from '../firebase';
import { balanceIn, moneyDoc, writeBalance } from './balance';

type OnError = (error: unknown) => void;

const loansOf = (uid: string) => collection(db, 'users', uid, 'moneyLoans');

export function watchLoans(uid: string, onChange: (loans: Loan[]) => void, onError: OnError) {
  return onSnapshot(loansOf(uid), (snap) => onChange(snap.docs.map((d) => loanFromData(d.id, d.data()))), onError);
}

export type LoanOutcome = { ok: true } | { ok: false; problem: 'notEnoughBalance' };

export interface AddLoanInput {
  direction: LoanDirection;
  person: string;
  grosze: number;
  note: string;
  date: string;
  now: Date;
}

/** v1 saveLoan(): the loan and its effect on the balance (G6.1, G6.2). */
export function addLoan(uid: string, input: AddLoanInput): Promise<LoanOutcome> {
  return runTransaction(db, async (tx): Promise<LoanOutcome> => {
    const balanceRef = moneyDoc(uid, 'balance');
    const balance = await tx.get(balanceRef);
    const current = balanceIn(balance);
    const delta = newLoanDelta(input.direction, input.grosze);
    if (!fitsBalance(current, delta)) return { ok: false, problem: 'notEnoughBalance' };
    tx.set(doc(loansOf(uid)), newLoanData(input));
    writeBalance(tx, balanceRef, balance, current + delta);
    return { ok: true };
  });
}

export type RepayOutcome = { ok: true; grosze: number; settled: boolean } | { ok: false; problem: 'notEnoughBalance' };

/**
 * v1 saveLoanRepay(): capped at what is left of the loan as the server has it,
 * completedAt set once when it is all repaid (G6.3, G6.4). Nothing left → nothing written.
 */
export function repayLoan(uid: string, id: string, grosze: number, now: Date): Promise<RepayOutcome> {
  return runTransaction(db, async (tx): Promise<RepayOutcome> => {
    const ref = doc(loansOf(uid), id);
    const balanceRef = moneyDoc(uid, 'balance');
    const snap = await tx.get(ref);
    const balance = await tx.get(balanceRef);
    if (!snap.exists()) return { ok: true, grosze: 0, settled: true };
    const loan = loanFromData(snap.id, snap.data());
    const paid = repayment(loan, grosze);
    if (paid.grosze <= 0) return { ok: true, grosze: 0, settled: paid.settled };
    const current = balanceIn(balance);
    if (!fitsBalance(current, paid.delta)) return { ok: false, problem: 'notEnoughBalance' };
    tx.update(ref, {
      repaidAmount: zlotyFromGrosze(paid.repaid),
      completedAt: paid.settled ? (loan.completedAt ?? now) : null,
    });
    writeBalance(tx, balanceRef, balance, current + paid.delta);
    return { ok: true, grosze: paid.grosze, settled: paid.settled };
  });
}

/** v1 deleteLoan(): what is still outstanding goes back (G6.5, G6.6). Gone already → ok. */
export function deleteLoan(uid: string, id: string): Promise<LoanOutcome> {
  return runTransaction(db, async (tx): Promise<LoanOutcome> => {
    const ref = doc(loansOf(uid), id);
    const balanceRef = moneyDoc(uid, 'balance');
    const snap = await tx.get(ref);
    const balance = await tx.get(balanceRef);
    if (!snap.exists()) return { ok: true };
    const current = balanceIn(balance);
    const delta = deleteDelta(loanFromData(snap.id, snap.data()));
    if (!fitsBalance(current, delta)) return { ok: false, problem: 'notEnoughBalance' };
    tx.delete(ref);
    writeBalance(tx, balanceRef, balance, current + delta);
    return { ok: true };
  });
}
