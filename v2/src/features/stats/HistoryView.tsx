// The full activity history, newest first, 15 at a time (v1's page size). v1 loads
// every activity and pages in memory; v2 asks for one page at a time with a cursor,
// so the first page costs the same however long the history is. Deleting an entry
// (G11, stage 3e) takes its points back in one transaction.
import { useEffect, useRef, useState } from 'preact/hooks';
import { activityName, type Activity } from '@/domain/activity';
import { ActivityRow } from '@/features/shared/activity';
import { t } from '@/i18n';
import { removeActivity } from '@/services/activity';
import { dropFromHistory, history as historyState, openHistory, type HistoryHandle } from '@/stores/stats';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
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

  const [deleting, setDeleting] = useState<Activity | null>(null);
  const lastToast = useRef<number | null>(null);
  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };

  const { activities, loading, hasMore, failed, total, activityNames } = historyState.value;

  const remove = () => {
    const activity = deleting;
    setDeleting(null);
    if (!activity) return;
    removeActivity(uid, activity)
      .then((points) => {
        dropFromHistory(activity.id);
        notify({ message: t('activity.deleted', { points }) });
      })
      .catch(() => notify({ message: t('activity.deleteFailed'), tone: 'negative' }));
  };
  const firstLoad = loading && activities.length === 0;
  // A failed first page shows only the error and the retry below, not an empty card.
  const body = firstLoad ? (
    <Skeleton lines={5} />
  ) : activities.length > 0 ? (
    <List label={t('stats.historyTitle')}>
      {activities.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} names={activityNames} onDelete={setDeleting} />
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

      <ConfirmDialog
        open={deleting !== null}
        title={t('activity.deleteTitle', { name: deleting ? activityName(deleting, activityNames) : '' })}
        body={t('activity.deleteBody', { points: deleting?.points ?? 0 })}
        confirmLabel={t('activity.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </Section>
  );
}
