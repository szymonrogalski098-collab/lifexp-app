// G7.6: a goal reached since last time is marked celebrated (once, by a service,
// never while rendering, B15) and announced. Used wherever goals are shown.
import { useEffect } from 'preact/hooks';
import { goalsToCelebrate, type Goal } from '@/domain/goals';
import { t } from '@/i18n';
import { celebrateReached } from '@/services/goals';
import { showToast } from '@/ui/toast';

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
