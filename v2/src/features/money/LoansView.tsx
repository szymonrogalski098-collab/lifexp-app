// Loans (docs/v2/PLAN.md 7.6 U14: a subsection of Money; GOLDEN G6): what is owed to
// me and what I owe, each loan with how much is repaid, a repayment, and deleting
// it. They move the balance but are not transactions and cost no points (v1).
import { Plus } from 'lucide-preact';
import { useRef, useState } from 'preact/hooks';
import {
  isSettled,
  loanTotals,
  outstanding,
  repaidShare,
  sortLoans,
  type Loan,
  type LoanDraft,
  type LoanProblem,
} from '@/domain/loans';
import { locale, t } from '@/i18n';
import { utcDayKey } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { createLoan, removeLoan, repay } from '@/services/loans';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState, Metric, ProgressBar } from '@/ui/components/Display';
import { Card } from '@/ui/components/Layout';
import { LoanSheet, RepaySheet } from './LoanSheets';

function LoanRow({ loan, onRepay, onDelete }: { loan: Loan; onRepay: (l: Loan) => void; onDelete: (l: Loan) => void }) {
  const lang = locale();
  const settled = isSettled(loan);
  const title = t(loan.direction === 'lent' ? 'money.lentTo' : 'money.borrowedFrom', { person: loan.person });
  const progress = t('money.repaidOf', {
    repaid: formatMoney(loan.repaid, lang),
    total: formatMoney(loan.grosze, lang),
    percent: Math.round(repaidShare(loan) * 100),
  });
  return (
    <li class="money-loan">
      <div class="money-loan__top">
        <span class="money-loan__title user-text">{title}</span>
        <span class={`money-loan__left numeric tone-${settled ? 'positive' : 'default'}`}>
          {settled ? t('money.settledTag') : formatMoney(outstanding(loan), lang)}
        </span>
      </div>
      <ProgressBar value={repaidShare(loan)} label={progress} tone={settled ? 'positive' : 'default'} />
      <p class="money-loan__meta user-text">{[progress, loan.note].filter(Boolean).join(' · ')}</p>
      <div class="money-loan__actions">
        {!settled && (
          <Button variant="secondary" onClick={() => onRepay(loan)} aria-label={t('money.repayNamed', { title })}>
            {t('money.repay')}
          </Button>
        )}
        <Button variant="quiet" onClick={() => onDelete(loan)} aria-label={t('money.deleteNamedLoan', { title })}>
          {t('money.delete')}
        </Button>
      </div>
    </li>
  );
}

export function LoansView({ uid, loans, balance }: { uid: string; loans: readonly Loan[]; balance: number }) {
  const [form, setForm] = useState({ open: false, key: 0 });
  const [repaying, setRepaying] = useState<{ loan: Loan | null; open: boolean; key: number }>({
    loan: null,
    open: false,
    key: 0,
  });
  const [deleting, setDeleting] = useState<Loan | null>(null);
  const lastToast = useRef<number | null>(null);
  const lang = locale();

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const failed = () => notify({ message: t('money.saveFailed'), tone: 'negative' });

  const save = async (draft: LoanDraft): Promise<LoanProblem | null> => {
    try {
      const result = await createLoan(uid, draft);
      if (!result.ok) return result.problem;
      setForm((f) => ({ ...f, open: false }));
      notify({ message: t('money.loanAdded'), tone: 'positive' });
    } catch {
      failed();
    }
    return null;
  };

  const repayLoan = async (grosze: number): Promise<'notEnoughBalance' | null> => {
    const loan = repaying.loan;
    if (!loan) return null;
    try {
      const result = await repay(uid, loan, grosze);
      if (!result.ok) return result.problem;
      setRepaying((r) => ({ ...r, open: false }));
      notify(
        result.settled
          ? { message: t('money.loanSettled', { person: loan.person }), tone: 'positive' }
          : { message: t('money.repaid', { amount: formatMoney(result.grosze, lang) }), tone: 'positive' },
      );
    } catch {
      failed();
    }
    return null;
  };

  const remove = () => {
    const loan = deleting;
    setDeleting(null);
    if (!loan) return;
    removeLoan(uid, loan)
      .then((result) =>
        notify(
          result.ok ? { message: t('money.loanDeleted') } : { message: t('money.loanDeleteBlocked'), tone: 'negative' },
        ),
      )
      .catch(failed);
  };

  const totals = loanTotals(loans);
  const sorted = sortLoans(loans);
  const deletingLeft = deleting ? outstanding(deleting) : 0;

  return (
    <>
      <Card>
        <div class="money-loans__head">
          <div class="money-loans__totals">
            <Metric label={t('money.owedToMe')} value={formatMoney(totals.owedToMe, lang)} />
            <Metric label={t('money.iOwe')} value={formatMoney(totals.iOwe, lang)} />
          </div>
          <Button variant="primary" onClick={() => setForm((f) => ({ open: true, key: f.key + 1 }))}>
            <Plus aria-hidden="true" />
            {t('money.newLoan')}
          </Button>
        </div>
      </Card>

      <Card padding={sorted.length === 0 ? 'md' : 'none'}>
        {sorted.length === 0 ? (
          <EmptyState title={t('money.noLoans')} />
        ) : (
          <ul class="money-loans" aria-label={t('money.loans')}>
            {sorted.map((loan) => (
              <LoanRow
                key={loan.id}
                loan={loan}
                onRepay={(l) => setRepaying((r) => ({ loan: l, open: true, key: r.key + 1 }))}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title={t('money.deleteLoanTitle')}
        body={
          deletingLeft === 0
            ? t('money.deleteLoanSettled')
            : t(deleting?.direction === 'lent' ? 'money.deleteLoanLent' : 'money.deleteLoanBorrowed', {
                amount: formatMoney(deletingLeft, lang),
              })
        }
        confirmLabel={t('money.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />

      {form.key > 0 && (
        <LoanSheet
          key={form.key}
          open={form.open}
          balance={balance}
          today={utcDayKey(new Date())}
          onClose={() => setForm((f) => ({ ...f, open: false }))}
          onSave={save}
        />
      )}
      {repaying.loan && (
        <RepaySheet
          key={repaying.key}
          open={repaying.open}
          loan={loans.find((l) => l.id === repaying.loan?.id) ?? repaying.loan}
          balance={balance}
          onClose={() => setRepaying((r) => ({ ...r, open: false }))}
          onRepay={repayLoan}
        />
      )}
    </>
  );
}
