// The PC build as v1 shows it (renderPcBuild): each component with its pieces, the
// one being built, and the finished PC. Reads the profile only; changes nothing.
import { isComplete, PIECES_PER_COMPONENT, type PcBuild } from '@/domain/tasks';
import { t } from '@/i18n';
import { Card } from '@/ui/components/Layout';

export function PcBuildCard({ build }: { build: PcBuild | null }) {
  if (!build) {
    return (
      <Card>
        <h2 class="tasks-card__title">{t('tasks.pc.title')}</h2>
        <p class="tasks-card__note">{t('tasks.pc.noBuild')}</p>
      </Card>
    );
  }
  const current = build.componentOrder[build.currentComponentIndex];
  return (
    <Card>
      <h2 class="tasks-card__title">{t('tasks.pc.title')}</h2>
      <p class="tasks-card__note" data-testid="pc-status">
        {isComplete(build) || !current
          ? t('tasks.pc.complete')
          : t('tasks.pc.current', { name: t(`tasks.pc.components.${current}`) })}
      </p>
      <ol class="tasks-pc" aria-label={t('tasks.pc.title')}>
        {build.componentOrder.map((component, i) => {
          const filled = Math.min(PIECES_PER_COMPONENT, build.progress[component] || 0);
          const state = i === build.currentComponentIndex ? 'current' : i > build.currentComponentIndex ? 'locked' : 'done';
          return (
            <li key={component} class={`tasks-pc__row tasks-pc__row--${state}`}>
              <span class="tasks-pc__name">{t(`tasks.pc.components.${component}`)}</span>
              <span class="tasks-pc__pips" aria-hidden="true">
                {Array.from({ length: PIECES_PER_COMPONENT }, (_, p) => (
                  <span key={p} class={p < filled ? 'tasks-pc__pip tasks-pc__pip--filled' : 'tasks-pc__pip'} />
                ))}
              </span>
              <span class="tasks-pc__count numeric">
                {t('tasks.pc.pieces', { n: filled, max: PIECES_PER_COMPONENT })}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
