// Goals (docs/v2/PLAN.md 9, stage 3d; GOLDEN G7): up to three, each with how far it
// is and what is missing. A points goal follows the spendable points; a money goal
// what was put aside on it from the Money balance. New, edit (name and amount, as in
// v1), deposit and delete each go through a transaction (services/goals).
import { PiggyBank, Plus, Target } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GOALS_MAX, canAddGoal, goalProgress, refundOnDelete, type Goal, type GoalDraft } from '@/domain/goals';
import { locale, t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { depositGoal, removeGoal, saveGoal } from '@/services/goals';
import { balance as balanceState, watchBalance } from '@/stores/balance';
import { account } from '@/stores/session';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState, IconTile, ProgressBar } from '@/ui/components/Display';
import { Card, Page, Stack } from '@/ui/components/Layout';
import { goalAmount, useCelebration } from '@/features/shared/goals';
import { DepositSheet, GoalSheet } from './GoalSheets';
import './goals.css';

interface GoalCardProps {
  goal: Goal;
  pointsTotal: number;
  onDeposit: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

function GoalCard({ goal, pointsTotal, onDeposit, onEdit, onDelete }: GoalCardProps) {
  const lang = locale();
  const progress = goalProgress(goal, pointsTotal);
  const money = goal.type === 'money';
  const status = t('goals.progress', {
    current: goalAmount(goal.type, progress.current, lang),
    target: goalAmount(goal.type, goal.target, lang),
    percent: Math.floor(progress.share * 100),
  });
  return (
    <li class={`goal${progress.reached ? ' goal--reached' : ''}`}>
      <Card>
        <div class="goal__head">
          <IconTile tone={progress.reached ? 'positive' : 'default'}>{money ? <PiggyBank /> : <Target />}</IconTile>
          <div class="goal__title">
            <h3 class="goal__name user-text">{goal.name}</h3>
            <p class="goal__type">{t(money ? 'goals.typeMoney' : 'goals.typePoints')}</p>
          </div>
        </div>
        <ProgressBar value={progress.share} label={status} tone={progress.reached ? 'positive' : 'default'} />
        <div class="goal__numbers">
          <span class="goal__progress numeric">{status}</span>
          <span class={`goal__missing numeric tone-${progress.reached ? 'positive' : 'default'}`}>
            {progress.reached
              ? t('goals.reached')
              : t('goals.missing', { amount: goalAmount(goal.type, progress.missing, lang) })}
          </span>
        </div>
        <div class="goal__actions">
          {money && !progress.reached && (
            <Button variant="secondary" onClick={() => onDeposit(goal)} aria-label={t('goals.depositNamed', { name: goal.name })}>
              {t('goals.deposit')}
            </Button>
          )}
          <Button variant="quiet" onClick={() => onEdit(goal)} aria-label={t('goals.editNamed', { name: goal.name })}>
            {t('goals.edit')}
          </Button>
          <Button variant="quiet" onClick={() => onDelete(goal)} aria-label={t('goals.deleteNamed', { name: goal.name })}>
            {t('goals.delete')}
          </Button>
        </div>
      </Card>
    </li>
  );
}

export default function GoalsPage() {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchBalance(uid) : undefined), [uid]);

  const [sheet, setSheet] = useState<{ open: boolean; goal: Goal | null; key: number }>({ open: false, goal: null, key: 0 });
  const [depositing, setDepositing] = useState<{ open: boolean; goal: Goal | null; key: number }>({
    open: false,
    goal: null,
    key: 0,
  });
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const lastToast = useRef<number | null>(null);

  const goals = current?.profile.goals ?? [];
  const pointsTotal = current?.profile.points.total ?? 0;
  useCelebration(uid, goals, pointsTotal);

  if (!current || !uid) return null;
  const lang = locale();
  const balance = balanceState.value ?? 0;

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const failed = () => notify({ message: t('goals.saveFailed'), tone: 'negative' });

  const save = async (draft: GoalDraft) => {
    try {
      const result = await saveGoal(uid, draft, goals, sheet.goal);
      if (!result.ok) return result.problem;
      setSheet((s) => ({ ...s, open: false }));
      notify({ message: t(sheet.goal ? 'goals.saved' : 'goals.added'), tone: 'positive' });
    } catch {
      failed();
    }
    return null;
  };

  const deposit = async (grosze: number | null) => {
    const goal = depositing.goal;
    if (!goal) return null;
    try {
      const result = await depositGoal(uid, goal, grosze);
      if (!result.ok) return result.problem;
      setDepositing((d) => ({ ...d, open: false }));
      notify({
        message: t('goals.deposited', { amount: formatMoney(grosze ?? 0, lang), name: goal.name }),
        tone: 'positive',
      });
    } catch {
      failed();
    }
    return null;
  };

  const remove = () => {
    const goal = deleting;
    setDeleting(null);
    if (!goal) return;
    removeGoal(uid, goal)
      .then(() => notify({ message: t('goals.deleted') }))
      .catch(failed);
  };

  const openNew = () => setSheet((s) => ({ open: true, goal: null, key: s.key + 1 }));
  const full = !canAddGoal(goals);
  const refund = deleting ? refundOnDelete(deleting) : 0;

  return (
    <Page>
      <Stack>
        <div class="goals-head">
          <p class="goals-head__count numeric">{t('goals.count', { count: goals.length, max: GOALS_MAX })}</p>
          <Button variant="primary" onClick={openNew} disabled={full}>
            <Plus aria-hidden="true" />
            {t('goals.new')}
          </Button>
        </div>
        {full && <p class="goals-head__note">{t('goals.maxReached')}</p>}

        {goals.length === 0 ? (
          <Card>
            <EmptyState title={t('goals.empty')} body={t('goals.emptyBody')} />
          </Card>
        ) : (
          <ul class="goals" aria-label={t('goals.list')}>
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                pointsTotal={pointsTotal}
                onDeposit={(g) => setDepositing((d) => ({ open: true, goal: g, key: d.key + 1 }))}
                onEdit={(g) => setSheet((s) => ({ open: true, goal: g, key: s.key + 1 }))}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        )}
      </Stack>

      <ConfirmDialog
        open={deleting !== null}
        title={t('goals.deleteTitle', { name: deleting?.name ?? '' })}
        body={refund > 0 ? t('goals.deleteRefund', { amount: formatMoney(refund, lang) }) : t('goals.deleteBody')}
        confirmLabel={t('goals.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />

      {sheet.key > 0 && (
        <GoalSheet
          key={sheet.key}
          open={sheet.open}
          goal={sheet.goal}
          onClose={() => setSheet((s) => ({ ...s, open: false }))}
          onSave={save}
        />
      )}
      {depositing.goal && (
        <DepositSheet
          key={depositing.key}
          open={depositing.open}
          goal={goals.find((g) => g.id === depositing.goal?.id) ?? depositing.goal}
          balance={balance}
          onClose={() => setDepositing((d) => ({ ...d, open: false }))}
          onDeposit={deposit}
        />
      )}
    </Page>
  );
}
