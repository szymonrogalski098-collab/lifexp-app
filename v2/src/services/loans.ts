// Loan use cases (docs/v2/PLAN.md 9, stage 3c; GOLDEN G6): the rules of
// domain/loans, then the repository's transaction. They move money, so they are
// awaited and need the server; offline they fail and change nothing.
import { addLoan, deleteLoan, repayLoan, type LoanOutcome, type RepayOutcome } from '@/data/repos/loans';
import { loanProblem, type Loan, type LoanDraft, type LoanProblem } from '@/domain/loans';
import { utcDayKey } from '@/lib/dates';

export type LoanSaveResult = { ok: true } | { ok: false; problem: LoanProblem };

/** v1 saveLoan(): checked, then saved, dated today (UTC, G13) unless a date was picked. */
export async function createLoan(uid: string, draft: LoanDraft, now = new Date()): Promise<LoanSaveResult> {
  const problem = loanProblem(draft);
  if (problem) return { ok: false, problem };
  return addLoan(uid, {
    direction: draft.direction,
    person: draft.person.trim(),
    grosze: draft.grosze ?? 0,
    note: draft.note.trim(),
    date: draft.date || utcDayKey(now),
    now,
  });
}

/** v1 saveLoanRepay(): an amount above zero, capped at what is left. */
export function repay(uid: string, loan: Loan, grosze: number, now = new Date()): Promise<RepayOutcome> {
  return repayLoan(uid, loan.id, grosze, now);
}

export function removeLoan(uid: string, loan: Loan): Promise<LoanOutcome> {
  return deleteLoan(uid, loan.id);
}
