// Drafts made offline (v1 offline-review-modal, "Byłeś offline"; docs/v2/PLAN.md 4.8,
// stage 3f): the drafts made without a connection, in v1 or in v2, each confirmed or
// discarded by hand. It opens by itself when the app starts online or the connection
// comes back while drafts wait, and from Today's reminder. Confirming loads the
// services on demand, so the app's first screen does not wait for Firebase.
import { useEffect, useState } from 'preact/hooks';
import type { DraftItem } from '@/domain/drafts';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { drafts, refreshDrafts, reviewRequested, watchDraftsFromOtherTabs } from '@/offline/queue';
import { showToast } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { Sheet } from '@/ui/components/Sheet';
import './offline.css';

function when(date: Date, lang: string): string {
  const time = date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  return `${formatShortDate(date, lang)}, ${time}`;
}

interface DraftsReviewProps {
  uid: string;
  /** Złoty per point (generalRate), for an expense's points cost. */
  rate: number;
}

export function DraftsReview({ uid, rate }: DraftsReviewProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const list = drafts.value;
  const lang = locale();

  useEffect(() => watchDraftsFromOtherTabs(), []);

  // On start and whenever the connection comes back, if anything waits (v1 maybeShowOfflineReview).
  useEffect(() => {
    const maybeOpen = () => {
      refreshDrafts();
      if (navigator.onLine && drafts.peek().length > 0) setOpen(true);
    };
    maybeOpen();
    addEventListener('online', maybeOpen);
    return () => removeEventListener('online', maybeOpen);
  }, []);

  useEffect(() => {
    if (!reviewRequested.value) return;
    reviewRequested.value = false;
    refreshDrafts();
    setOpen(true);
  }, [reviewRequested.value]);

  const confirm = async (draft: DraftItem) => {
    if (busy) return;
    setBusy(draft.id);
    try {
      const { confirmDraft } = await import('@/services/drafts');
      const outcome = await confirmDraft(uid, draft, rate);
      if (outcome.ok) showToast({ message: t('offline.added'), tone: 'positive' });
      else
        showToast({
          message:
            outcome.problem === 'dailyLimit'
              ? t('activity.dailyLimit')
              : outcome.problem === 'notEnoughBalance'
                ? t('money.notEnough')
                : t('offline.invalid'),
          tone: 'negative',
        });
    } catch {
      showToast({ message: t('offline.failed'), tone: 'negative' });
    } finally {
      setBusy(null);
    }
  };

  const discard = async (draft: DraftItem) => {
    const { discardDraft } = await import('@/services/drafts');
    discardDraft(draft);
    showToast({ message: t('offline.discarded') });
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={t('offline.reviewTitle')}>
      <div class="stack">
        <p class="drafts__lead">{t('offline.reviewLead')}</p>
        {list.length === 0 ? (
          <p class="drafts__empty" role="status">
            {t('offline.empty')}
          </p>
        ) : (
          <ul class="drafts" aria-label={t('offline.reviewTitle')}>
            {list.map((draft) => {
              const applicable = draft.kind === 'activity' || draft.kind === 'chore' || draft.kind === 'money';
              return (
                <li key={draft.id} class="drafts__item">
                  <p class="drafts__summary user-text">{draft.summary}</p>
                  <p class="drafts__when numeric">{when(draft.createdAt, lang)}</p>
                  {draft.kind === 'gaming' && <p class="drafts__note">{t('offline.gamingNote')}</p>}
                  {draft.kind === 'other' && <p class="drafts__note">{t('offline.otherNote')}</p>}
                  <div class="drafts__actions">
                    {applicable && (
                      <Button
                        variant="primary"
                        busy={busy === draft.id}
                        disabled={busy !== null}
                        onClick={() => void confirm(draft)}
                        aria-label={t('offline.addNamed', { summary: draft.summary })}
                      >
                        {t('offline.add')}
                      </Button>
                    )}
                    {draft.kind !== 'other' && (
                      <Button
                        variant="quiet"
                        disabled={busy !== null}
                        onClick={() => void discard(draft)}
                        aria-label={t('offline.discardNamed', { summary: draft.summary })}
                      >
                        {t('offline.discard')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
