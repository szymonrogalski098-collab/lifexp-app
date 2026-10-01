// The two goal forms (PLAN.md 7.6; v1 goal form and deposit row): a new goal or a
// changed one, and a deposit onto a money goal. Both wait for the server, which
// checks the limit and the balance again; the sheet stays open until it answers.
import { useState } from 'preact/hooks';
import { GOAL_NAME_MAX, type Goal, type GoalDraft, type GoalProblem, type GoalType } from '@/domain/goals';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Button } from '@/ui/components/Button';
import { MoneyField, NumberField, SegmentedControl, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

type Problem = GoalProblem | 'notEnoughBalance';

const PROBLEM_KEY = {
  nameRequired: 'goals.needName',
  targetRequired: 'goals.needTarget',
  targetTooLarge: 'goals.targetTooLarge',
  limit: 'goals.maxReached',
  notEnoughBalance: 'goals.notEnough',
} as const;

/** Runs `save` once at a time and keeps the problem it reports. */
function useSave(save: () => Promise<Problem | null>) {
  const [problem, setProblem] = useState<Problem | null>(null);
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

/** A goal's amount as text: złoty for money, points for points. */
export function goalAmount(type: GoalType, value: number, lang: string): string {
  return type === 'money' ? formatMoney(value, lang) : t('units.points', { points: formatInteger(value, lang) });
}

interface GoalSheetProps {
  open: boolean;
  /** null = a new goal. */
  goal: Goal | null;
  onClose: () => void;
  onSave: (draft: GoalDraft) => Promise<Problem | null>;
}

export function GoalSheet({ open, goal, onClose, onSave }: GoalSheetProps) {
  const [draft, setDraft] = useState<GoalDraft>({
    type: goal?.type ?? 'money',
    name: goal?.name ?? '',
    target: goal?.target ?? null,
  });
  const { problem, setProblem, saving, submit } = useSave(() => onSave(draft));
  const set = (patch: Partial<GoalDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (...kinds: Problem[]) => (problem && kinds.includes(problem) ? t(PROBLEM_KEY[problem]) : null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(goal ? 'goals.editTitle' : 'goals.new')}
      footer={
        <div class="goals-sheet__footer">
          {problem === 'limit' && <p class="goals-sheet__problem">{t('goals.maxReached')}</p>}
          <Button type="submit" form="goal-form" variant="primary" size="lg" block busy={saving} disabled={saving}>
            {t(goal ? 'goals.save' : 'goals.add')}
          </Button>
        </div>
      }
    >
      <form
        id="goal-form"
        class="stack"
        // Our messages (translated, next to the field) instead of the browser's bubbles.
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {goal ? (
          <p class="goals-sheet__lead">{t(goal.type === 'money' ? 'goals.typeMoney' : 'goals.typePoints')}</p>
        ) : (
          <div class="stack goals-sheet__type">
            <SegmentedControl<GoalType>
              label={t('goals.type')}
              value={draft.type}
              options={[
                { value: 'money', label: t('goals.money') },
                { value: 'points', label: t('goals.points') },
              ]}
              onChange={(type) => set({ type, target: null })}
            />
            <p class="goals-sheet__hint">{t(draft.type === 'money' ? 'goals.moneyHint' : 'goals.pointsHint')}</p>
          </div>
        )}
        <TextField
          label={t('goals.name')}
          value={draft.name}
          onInput={(name) => set({ name })}
          placeholder={t('goals.namePh')}
          maxLength={GOAL_NAME_MAX}
          error={error('nameRequired')}
        />
        {draft.type === 'money' ? (
          <MoneyField
            label={t('goals.targetMoney')}
            value={draft.target}
            onChange={(target) => set({ target })}
            error={error('targetRequired', 'targetTooLarge')}
          />
        ) : (
          <NumberField
            label={t('goals.targetPoints')}
            value={draft.target}
            onChange={(target) => set({ target })}
            suffix={t('goals.pointsUnit')}
            error={error('targetRequired', 'targetTooLarge')}
          />
        )}
      </form>
    </Sheet>
  );
}

interface DepositSheetProps {
  open: boolean;
  goal: Goal;
  /** Grosze, as last seen. */
  balance: number;
  onClose: () => void;
  onDeposit: (grosze: number | null) => Promise<Problem | null>;
}

export function DepositSheet({ open, goal, balance, onClose, onDeposit }: DepositSheetProps) {
  const [grosze, setGrosze] = useState<number | null>(null);
  const { problem, setProblem, saving, submit } = useSave(() => onDeposit(grosze));
  const lang = locale();
  const hint =
    grosze !== null && grosze > 0 ? t('goals.balanceAfter', { amount: formatMoney(balance - grosze, lang) }) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('goals.depositTitle', { name: goal.name })}
      footer={
        <Button type="submit" form="deposit-form" variant="primary" size="lg" block busy={saving} disabled={saving}>
          {t('goals.deposit')}
        </Button>
      }
    >
      <form
        id="deposit-form"
        class="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p class="goals-sheet__lead">
          {t('goals.depositLead', {
            saved: formatMoney(goal.saved, lang),
            target: formatMoney(goal.target, lang),
            balance: formatMoney(balance, lang),
          })}
        </p>
        <MoneyField
          label={t('goals.depositAmount')}
          value={grosze}
          onChange={(next) => {
            setGrosze(next);
            setProblem(null);
          }}
          hint={hint}
          error={problem === 'notEnoughBalance' ? t('goals.notEnough') : problem ? t('goals.needAmount') : null}
        />
      </form>
    </Sheet>
  );
}
