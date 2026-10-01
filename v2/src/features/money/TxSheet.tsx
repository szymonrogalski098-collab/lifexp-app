// A new transaction in a sheet (PLAN.md 7.6; v1 "Dodaj transakcję"): expense or
// income, the amount with what it does to the balance (and, for an expense, to the
// points), a category or a new one, the day and a note. Saving waits for the server,
// which checks the balance again; the sheet stays open until it answers.
import { useState } from 'preact/hooks';
import {
  CATEGORY_NAME_MAX,
  TX_NOTE_MAX,
  balanceDelta,
  pointsCost,
  type MoneyCategory,
  type TxDraft,
  type TxProblem,
  type TxType,
} from '@/domain/money';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Button } from '@/ui/components/Button';
import { DateField, MoneyField, SegmentedControl, Select, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

const FORM_ID = 'money-tx-form';
/** The select's "new category" choice (v1's value). */
const NEW_CATEGORY = '__new__';

const PROBLEM_KEY = {
  amountRequired: 'money.needAmount',
  amountTooLarge: 'money.amountTooLarge',
  categoryRequired: 'money.needCategory',
  notEnoughBalance: 'money.notEnough',
} as const;

interface TxSheetProps {
  open: boolean;
  categories: readonly MoneyCategory[];
  /** Grosze, as last seen. */
  balance: number;
  /** For the points an expense will cost (the server has the last word). */
  rate: number;
  pointsTotal: number;
  /** The default day (UTC, as v1). */
  today: string;
  onClose: () => void;
  /** Resolves to a problem to show, or null when saved. */
  onSave: (draft: TxDraft) => Promise<TxProblem | null>;
}

export function TxSheet({ open, categories, balance, rate, pointsTotal, today, onClose, onSave }: TxSheetProps) {
  const [draft, setDraft] = useState<TxDraft>({
    type: 'expense',
    grosze: null,
    category: '',
    newCategory: null,
    note: '',
    date: today,
  });
  const [problem, setProblem] = useState<TxProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const lang = locale();

  const set = (patch: Partial<TxDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (...kinds: TxProblem[]) => (problem && kinds.includes(problem) ? t(PROBLEM_KEY[problem]) : null);

  const amountHint = () => {
    if (draft.grosze === null || draft.grosze <= 0) return undefined;
    const after = t('money.balanceAfter', { amount: formatMoney(balance + balanceDelta(draft.type, draft.grosze), lang) });
    const cost = pointsCost(draft.type, draft.grosze, rate, pointsTotal);
    return cost > 0 ? `${after} · ${t('money.costsPoints', { points: formatInteger(cost, lang) })}` : after;
  };

  const submit = async () => {
    setSaving(true);
    try {
      setProblem(await onSave(draft));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('money.newTx')}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" size="lg" block busy={saving} disabled={saving}>
          {t('money.save')}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        class="stack"
        // Our messages (translated, next to the field) instead of the browser's bubbles.
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!saving) void submit();
        }}
      >
        <SegmentedControl<TxType>
          label={t('money.type')}
          value={draft.type}
          options={[
            { value: 'expense', label: t('money.expense') },
            { value: 'income', label: t('money.income') },
          ]}
          onChange={(type) => set({ type })}
        />
        <MoneyField
          label={t('money.amount')}
          value={draft.grosze}
          onChange={(grosze) => set({ grosze })}
          hint={amountHint()}
          error={error('amountRequired', 'amountTooLarge', 'notEnoughBalance')}
        />
        <Select
          label={t('money.category')}
          value={draft.newCategory !== null ? NEW_CATEGORY : draft.category}
          options={[
            { value: '', label: t('money.chooseCategory') },
            ...categories.map((c) => ({ value: c.name, label: c.name })),
            { value: NEW_CATEGORY, label: t('money.newCategory') },
          ]}
          onChange={(value) =>
            value === NEW_CATEGORY ? set({ category: '', newCategory: '' }) : set({ category: value, newCategory: null })
          }
          error={draft.newCategory === null ? error('categoryRequired') : null}
        />
        {draft.newCategory !== null && (
          <TextField
            label={t('money.newCategoryName')}
            value={draft.newCategory}
            onInput={(newCategory) => set({ newCategory })}
            maxLength={CATEGORY_NAME_MAX}
            error={error('categoryRequired')}
          />
        )}
        <DateField label={t('money.date')} value={draft.date} onChange={(date) => set({ date })} />
        <TextField
          label={t('money.note')}
          value={draft.note}
          onInput={(note) => set({ note })}
          placeholder={t('money.notePh')}
          maxLength={TX_NOTE_MAX}
        />
      </form>
    </Sheet>
  );
}
