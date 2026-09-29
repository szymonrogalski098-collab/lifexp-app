// Live data behind the Today screen (stage 2a), read-only. The screen starts the
// listeners when it mounts and stops them when it leaves; each source fills in on
// its own, so the page shows what has arrived instead of waiting for everything.
import { signal } from '@preact/signals';
import type { Activity, DayLog } from '@/domain/activity';

/** undefined = still loading. */
export interface TodaySources {
  days: ReadonlyMap<string, DayLog> | undefined;
  recent: readonly Activity[] | undefined;
  activityNames: ReadonlyMap<string, string> | undefined;
  /** Grosze; null = no money/balance document. */
  balance: number | null | undefined;
  failed: boolean;
}

const EMPTY: TodaySources = {
  days: undefined,
  recent: undefined,
  activityNames: undefined,
  balance: undefined,
  failed: false,
};

export const today = signal<TodaySources>(EMPTY);

/** v1's dashboard shows the last five activities. */
export const RECENT_COUNT = 5;

export function watchToday(uid: string): () => void {
  today.value = EMPTY;
  let stopped = false;
  const stops: (() => void)[] = [];
  const set = (patch: Partial<TodaySources>) => {
    if (!stopped) today.value = { ...today.value, ...patch };
  };
  const fail = () => set({ failed: true });

  void import('@/data/repos/today')
    .then((repo) => {
      if (stopped) return;
      stops.push(
        repo.watchDayLogs(uid, (days) => set({ days }), fail),
        repo.watchRecentActivities(uid, RECENT_COUNT, (recent) => set({ recent }), fail),
        repo.watchActivityDefNames(uid, (activityNames) => set({ activityNames }), fail),
        repo.watchMoneyBalance(uid, (balance) => set({ balance }), fail),
      );
    })
    .catch(fail);

  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
