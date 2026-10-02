// The admin's messages, live, and which ones this device has shown (v1 keeps the
// same list under the same key, so a message shown in either app is not shown again).
import type { Broadcast } from '@/domain/broadcasts';
import { withSeen } from '@/domain/broadcasts';

/** v1 BROADCAST_SEEN_KEY. */
const SEEN_KEY = 'lifexp-seen-broadcasts';

export function readSeenBroadcasts(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markBroadcastSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(withSeen(readSeenBroadcasts(), id)));
  } catch {
    // Storage blocked: shown again on the next start, as nothing remembers it.
  }
}

/** The newest `count` messages, live; the repository is loaded on first use. Returns the stop function. */
export function watchLatestBroadcasts(
  count: number,
  onChange: (list: Broadcast[]) => void,
  onError: () => void = () => {},
): () => void {
  let stopped = false;
  let stop: (() => void) | null = null;
  void import('@/data/repos/broadcasts')
    .then((repo) => {
      if (!stopped) stop = repo.watchBroadcasts(count, (list) => !stopped && onChange(list), onError);
    })
    .catch(onError);
  return () => {
    stopped = true;
    stop?.();
  };
}
