// Goal bits shared by the Goals screen and Today (stage 3d): amounts in the goal's
// unit, and G7.6 — a goal reached since last time is marked celebrated (once, by a
// service, never while rendering, B15) and announced, wherever goals are shown.
import { useEffect } from 'preact/hooks';
import { goalsToCelebrate, type Goal, type GoalType } from '@/domain/goals';
import { t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { celebrateReached } from '@/services/goals';
import { showToast } from '@/ui/toast';

/** A goal's amount as text: złoty for money, points for points. */
export function goalAmount(type: GoalType, value: number, lang: string): string {
  return type === 'money' ? formatMoney(value, lang) : t('units.points', { points: formatInteger(value, lang) });
}

export function useCelebration(uid: string | undefined, goals: readonly Goal[], pointsTotal: number): void {
  const due = goalsToCelebrate(goals, pointsTotal)
    .map((g) => g.id)
    .join(',');
  useEffect(() => {
    if (!uid || !due) return;
    celebrateReached(uid, goals, pointsTotal)
      .then((marked) => {
        for (const goal of marked) showToast({ message: t('goals.celebrated', { name: goal.name }), tone: 'positive' });
      })
      .catch(() => undefined);
  }, [uid, due]);
}
