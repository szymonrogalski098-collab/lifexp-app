// The full activity history, newest first, 15 at a time (v1's page size). v1 loads
// every activity and pages in memory; v2 asks for one page at a time with a cursor,
// so the first page costs the same however long the history is. Read-only: deleting
// an entry comes with stage 3e.
import { useEffect, useRef } from 'preact/hooks';
import { ActivityRow } from '@/features/shared/activity';
import { t } from '@/i18n';
import { history as historyState, openHistory, type HistoryHandle } from '@/stores/stats';
import { Button } from '@/ui/components/Button';
import { EmptyState, List, Skeleton } from '@/ui/components/Display';
import { Card, Section } from '@/ui/components/Layout';

export function HistoryView({ uid }: { uid: string }) {
  const handle = useRef<HistoryHandle | null>(null);
  useEffect(() => {
    const opened = openHistory(uid);
    handle.current = opened;
    return () => {
      opened.stop();
      handle.current = null;
    };
  }, [uid]);

  const { activities, loading, hasMore, failed, total, activityNames } = historyState.value;
  const firstLoad = loading && activities.length === 0;
  // A failed first page shows only the error and the retry below, not an empty card.
  const body = firstLoad ? (
    <Skeleton lines={5} />
  ) : activities.length > 0 ? (
    <List label={t('stats.historyTitle')}>
      {activities.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} names={activityNames} />
      ))}
    </List>
  ) : failed ? null : (
    <EmptyState title={t('stats.noHistory')} />
  );

  return (
    <Section title={t('stats.historyTitle')}>
      {body && <Card padding="none">{body}</Card>}

      <div class="stats-history-footer">
        {total !== null && activities.length > 0 && (
          <p class="stats-note" aria-live="polite">
            {t('stats.historyShown', { shown: activities.length, total })}
          </p>
        )}
        {failed && (
          <p class="stats-error" role="alert">
            {t('stats.historyFailed')}
          </p>
        )}
        {(hasMore || failed) && !firstLoad && (
          <Button variant="secondary" busy={loading} onClick={() => handle.current?.more()}>
            {failed ? t('ui.retry') : t('stats.showMore')}
          </Button>
        )}
      </div>
    </Section>
  );
}
