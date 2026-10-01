// Loans (v1 money.js:353-524; docs/v2/GOLDEN.md G6): money lent to someone or
// borrowed from someone. They move the balance but create no transaction and cost
// no points. Amounts are grosze.

export type LoanDirection = 'lent' | 'borrowed';

/** v1's form fields (maxlength / max). */
export const LOAN_PERSON_MAX = 40;
export const LOAN_NOTE_MAX = 100;
export const LOAN_AMOUNT_MAX = 100_000_000;

/** users/{uid}/moneyLoans/{id}. */
export interface Loan {
  id: string;
  person: string;
  /** 'lent' = they owe me; 'borrowed' = I owe them. */
  direction: LoanDirection;
  grosze: number;
  repaid: number;
  note: string;
  /** "YYYY-MM-DD" (UTC day by default, as v1). */
  date: string;
  createdAt: Date | null;
  /** Set once, when the last of it is repaid. */
  completedAt: Date | null;
}

export function outstanding(loan: Loan): number {
  return Math.max(0, loan.grosze - loan.repaid);
}

export function isSettled(loan: Loan): boolean {
  return loan.repaid >= loan.grosze;
}

/** How much is repaid, 0 … 1. */
export function repaidShare(loan: Loan): number {
  return loan.grosze > 0 ? Math.min(1, loan.repaid / loan.grosze) : 1;
}

/** v1 lists loans in the order they were made. */
export function sortLoans(loans: readonly Loan[]): Loan[] {
  return [...loans].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}

/** v1 "Winni mi" / "Ja jestem winien": what is still outstanding each way. */
export function loanTotals(loans: readonly Loan[]): { owedToMe: number; iOwe: number } {
  let owedToMe = 0;
  let iOwe = 0;
  for (const loan of loans) {
    if (loan.direction === 'lent') owedToMe += outstanding(loan);
    else iOwe += outstanding(loan);
  }
  return { owedToMe, iOwe };
}

// ── A new loan (v1 saveLoan) ──

export interface LoanDraft {
  direction: LoanDirection;
  person: string;
  /** null = empty or not a valid amount. */
  grosze: number | null;
  /** '' falls back to today (UTC), as in v1. */
  date: string;
  note: string;
}

export type LoanProblem = 'personRequired' | 'amountRequired' | 'amountTooLarge' | 'notEnoughBalance';

/** v1 saveLoan(): a person and an amount above zero (the balance is checked when saving). */
export function loanProblem(draft: LoanDraft): LoanProblem | null {
  if (!draft.person.trim()) return 'personRequired';
  if (draft.grosze === null || draft.grosze <= 0) return 'amountRequired';
  if (draft.grosze > LOAN_AMOUNT_MAX) return 'amountTooLarge';
  return null;
}

/** G6.1/G6.2: lending takes it from the balance, borrowing adds it. */
export function newLoanDelta(direction: LoanDirection, grosze: number): number {
  return direction === 'lent' ? -grosze : grosze;
}

// ── Repaying and deleting (v1 saveLoanRepay, deleteLoan) ──

export interface Repayment {
  /** What is actually repaid: never more than is left. */
  grosze: number;
  delta: number;
  repaid: number;
  settled: boolean;
}

/** G6.3/G6.4: capped at what is left; a lent loan coming back adds, paying back takes. */
export function repayment(loan: Loan, grosze: number): Repayment {
  const paid = Math.min(grosze, outstanding(loan));
  const repaid = loan.repaid + paid;
  return {
    grosze: paid,
    delta: loan.direction === 'lent' ? paid : -paid,
    repaid,
    settled: repaid >= loan.grosze,
  };
}

/** G6.5/G6.6: deleting undoes what is still outstanding. */
export function deleteDelta(loan: Loan): number {
  return loan.direction === 'lent' ? outstanding(loan) : -outstanding(loan);
}
