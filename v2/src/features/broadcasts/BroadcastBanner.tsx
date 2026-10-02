// The admin's messages as a banner at the top (v1 broadcast-banner): each new one
// once per device, oldest first, for the seconds the admin set; "Zamknij" ends it
// sooner. A message sent while the app is open shows at once (live listener).
import { useEffect, useRef, useState } from 'preact/hooks';
import { BROADCASTS_FOR_BANNER, unseenBroadcasts, type Broadcast } from '@/domain/broadcasts';
import { t } from '@/i18n';
import { markBroadcastSeen, readSeenBroadcasts, watchLatestBroadcasts } from '@/stores/broadcasts';
import { cssDurationMs } from '@/ui/motion';
import './broadcasts.css';

export function BroadcastBanner() {
  const [queue, setQueue] = useState<readonly Broadcast[]>([]);
  const [shown, setShown] = useState<{ broadcast: Broadcast; leaving: boolean } | null>(null);
  /** v1 broadcastShownThisSession: never twice, even before storage remembers it. */
  const taken = useRef(new Set<string>());

  useEffect(
    () =>
      watchLatestBroadcasts(BROADCASTS_FOR_BANNER, (list) => {
        const fresh = unseenBroadcasts(list, readSeenBroadcasts()).filter((b) => !taken.current.has(b.id));
        if (fresh.length === 0) return;
        for (const b of fresh) taken.current.add(b.id);
        setQueue((q) => [...q, ...fresh]);
      }),
    [],
  );

  // Next in line once the banner is free.
  useEffect(() => {
    if (shown || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    setQueue(rest);
    setShown({ broadcast: next, leaving: false });
  }, [shown, queue]);

  // On screen for its seconds, then out.
  useEffect(() => {
    if (!shown || shown.leaving) return;
    const timer = setTimeout(() => setShown({ ...shown, leaving: true }), shown.broadcast.seconds * 1000);
    return () => clearTimeout(timer);
  }, [shown]);

  // After the exit animation: remembered as seen, and the banner is free.
  useEffect(() => {
    if (!shown?.leaving) return;
    const timer = setTimeout(() => {
      markBroadcastSeen(shown.broadcast.id);
      setShown(null);
    }, cssDurationMs('--duration-exit'));
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div class="broadcast" data-state={shown.leaving ? 'leaving' : 'shown'} role="status">
      <p class="broadcast__text user-text">{shown.broadcast.text}</p>
      <button
        type="button"
        class="broadcast__close"
        onClick={() => setShown((s) => (s ? { ...s, leaving: true } : s))}
      >
        {t('broadcasts.close')}
      </button>
    </div>
  );
}
