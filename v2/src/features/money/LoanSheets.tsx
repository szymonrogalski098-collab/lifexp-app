// The two loan forms (PLAN.md 7.6; v1 loan form and repay row): a new loan, and a
// repayment of one. Both wait for the server, which checks the balance again; the
// sheet stays open until it answers.
import { useState } from 'preact/hooks';
import {
  LOAN_NOTE_MAX,
  LOAN_PERSON_MAX,
  newLoanDelta,
  outstanding,
  repayment,
  type Loan,
  type LoanDirection,
  type LoanDraft,
  type LoanProblem,
} from '@/domain/loans';
import { locale, t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { Button } from '@/ui/components/Button';
import { DateField, MoneyField, SegmentedControl, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

const PROBLEM_KEY = {
  personRequired: 'money.needPerson',
  amountRequired: 'money.needAmount',
  amountTooLarge: 'money.amountTooLarge',
  notEnoughBalance: 'money.notEnough',
} as const;

/** Runs `save` once at a time and keeps the problem it reports. */
function useSave<P extends LoanProblem>(save: () => Promise<P | null>) {
  const [problem, setProblem] = useState<P | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setProblem(await save());
    } finally {
      setSaving(false);
    }
  };
  return { problem, setProblem, saving, submit };
}

interface LoanSheetProps {
  open: boolean;
  /** Grosze, as last seen. */
  balance: number;
  /** The default day (UTC, as v1). */
  today: string;
  onClose: () => void;
  onSave: (draft: LoanDraft) => Promise<LoanProblem | null>;
}

export function LoanSheet({ open, balance, today, onClose, onSave }: LoanSheetProps) {
  const [draft, setDraft] = useState<LoanDraft>({ direction: 'lent', person: '', grosze: null, date: today, note: '' });
  const { problem, setProblem, saving, submit } = useSave(() => onSave(draft));
  const lang = locale();
  const set = (patch: Partial<LoanDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (...kinds: LoanProblem[]) => (problem && kinds.includes(problem) ? t(PROBLEM_KEY[problem]) : null);
  const hint =
    draft.grosze !== null && draft.grosze > 0
      ? t('money.balanceAfter', { amount: formatMoney(balance + newLoanDelta(draft.direction, draft.grosze), lang) })
      : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('money.newLoan')}
      footer={
        <Button type="submit" form="loan-form" variant="primary" size="lg" block busy={saving} disabled={saving}>
          {t('money.addLoan')}
        </Button>
      }
    >
      <form
        id="loan-form"
        class="stack"
        // Our messages (translated, next to the field) instead of the browser's bubbles.
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <SegmentedControl<LoanDirection>
          label={t('money.loanDirection')}
          value={draft.direction}
          options={[
            { value: 'lent', label: t('money.iLend') },
            { value: 'borrowed', label: t('money.iBorrow') },
          ]}
          onChange={(direction) => set({ direction })}
        />
        <TextField
          label={t('money.person')}
          value={draft.person}
          onInput={(person) => set({ person })}
          placeholder={t('money.personPh')}
          maxLength={LOAN_PERSON_MAX}
          error={error('personRequired')}
        />
        <MoneyField
          label={t('money.amount')}
          value={draft.grosze}
          onChange={(grosze) => set({ grosze })}
          hint={hint}
          error={error('amountRequired', 'amountTooLarge', 'notEnoughBalance')}
        />
        <DateField label={t('money.date')} value={draft.date} onChange={(date) => set({ date })} />
        <TextField
          label={t('money.note')}
          value={draft.note}
          onInput={(note) => set({ note })}
          maxLength={LOAN_NOTE_MAX}
        />
      </form>
    </Sheet>
  );
}

interface RepaySheetProps {
  open: boolean;
  loan: Loan;
  balance: number;
  onClose: () => void;
  onRepay: (grosze: number) => Promise<'amountRequired' | 'notEnoughBalance' | null>;
}

export function RepaySheet({ open, loan, balance, onClose, onRepay }: RepaySheetProps) {
  const [grosze, setGrosze] = useState<number | null>(null);
  const { problem, setProblem, saving, submit } = useSave<'amountRequired' | 'notEnoughBalance'>(() =>
    grosze === null || grosze <= 0 ? Promise.resolve('amountRequired') : onRepay(grosze),
  );
  const lang = locale();
  const left = outstanding(loan);

  const hint = () => {
    if (grosze === null || grosze <= 0) return undefined;
    const paid = repayment(loan, grosze);
    const after = t('money.balanceAfter', { amount: formatMoney(balance + paid.delta, lang) });
    return paid.grosze < grosze ? `${t('money.repayCapped', { amount: formatMoney(left, lang) })} ${after}` : after;
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('money.repayTitle', { person: loan.person })}
      footer={
        <Button type="submit" form="repay-form" variant="primary" size="lg" block busy={saving} disabled={saving}>
          {t('money.repay')}
        </Button>
      }
    >
      <form
        id="repay-form"
        class="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p class="money-sheet__lead">{t('money.leftToRepay', { amount: formatMoney(left, lang) })}</p>
        <MoneyField
          label={t('money.repayAmount')}
          value={grosze}
          onChange={(next) => {
            setGrosze(next);
            setProblem(null);
          }}
          hint={hint()}
          error={problem ? t(PROBLEM_KEY[problem]) : null}
        />
      </form>
    </Sheet>
  );
}
