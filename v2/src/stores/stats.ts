// Live data behind Statistics and History (stage 2c), read-only. Each screen starts
// its sources when it mounts and stops them when it leaves.
import { signal } from '@preact/signals';
import type { ActivityPager } from '@/data/repos/history';
import type { Activity, DayLog } from '@/domain/activity';
import { TOP_SAMPLE } from '@/domain/stats';

/** undefined = still loading. */
export interface StatsSources {
  days: ReadonlyMap<string, DayLog> | undefined;
  /** The newest TOP_SAMPLE activities. */
  latest: readonly Activity[] | undefined;
  activityNames: ReadonlyMap<string, string> | undefined;
  failed: boolean;
}

const NO_STATS: StatsSources = { days: undefined, latest: undefined, activityNames: undefined, failed: false };

export const stats = signal<StatsSources>(NO_STATS);

export function watchStats(uid: string): () => void {
  stats.value = NO_STATS;
  let stopped = false;
  const stops: (() => void)[] = [];
  const set = (patch: Partial<StatsSources>) => {
    if (!stopped) stats.value = { ...stats.value, ...patch };
  };
  const fail = () => set({ failed: true });

  void import('@/data/repos/today')
    .then((repo) => {
      if (stopped) return;
      stops.push(
        repo.watchDayLogs(uid, (days) => set({ days }), fail),
        repo.watchRecentActivities(uid, TOP_SAMPLE, (latest) => set({ latest }), fail),
        repo.watchActivityDefNames(uid, (activityNames) => set({ activityNames }), fail),
      );
    })
    .catch(fail);

  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}

/** v1 shows 15 activities per history page. */
export const HISTORY_PAGE_SIZE = 15;

export interface HistoryState {
  activities: readonly Activity[];
  /** A page is on its way (the first one or "show more"). */
  loading: boolean;
  hasMore: boolean;
  /** The last page request failed; "show more" retries it. */
  failed: boolean;
  /** Every activity of the account; null until counted or when offline. */
  total: number | null;
  activityNames: ReadonlyMap<string, string>;
}

const NO_HISTORY: HistoryState = {
  activities: [],
  loading: true,
  hasMore: false,
  failed: false,
  total: null,
  activityNames: new Map(),
};

export const history = signal<HistoryState>(NO_HISTORY);

export interface HistoryHandle {
  /** Loads the next page; ignored while one is loading or when there is none. */
  more(): void;
  stop(): void;
}

export function openHistory(uid: string): HistoryHandle {
  history.value = NO_HISTORY;
  let stopped = false;
  let busy = false;
  let stopNames: (() => void) | null = null;
  let pager: ActivityPager | null = null;
  const set = (patch: Partial<HistoryState>) => {
    if (!stopped) history.value = { ...history.value, ...patch };
  };

  const loadPage = async () => {
    if (busy || stopped) return;
    busy = true;
    set({ loading: true, failed: false });
    try {
      if (!pager) {
        const [historyRepo, todayRepo] = await Promise.all([
          import('@/data/repos/history'),
          import('@/data/repos/today'),
        ]);
        if (stopped) return;
        pager = historyRepo.activityPager(uid, HISTORY_PAGE_SIZE);
        // Without definitions the rows show raw type ids, as v1 does for a deleted one.
        stopNames = todayRepo.watchActivityDefNames(
          uid,
          (activityNames) => set({ activityNames }),
          () => {},
        );
        historyRepo
          .countActivities(uid)
          .then((total) => set({ total }))
          .catch(() => {});
      }
      const page = await pager.next();
      set({ activities: [...history.value.activities, ...page.activities], hasMore: page.hasMore });
    } catch {
      set({ failed: true });
    } finally {
      busy = false;
      set({ loading: false });
    }
  };

  void loadPage();

  return {
    more() {
      const { hasMore, failed } = history.value;
      if (hasMore || failed) void loadPage();
    },
    stop() {
      stopped = true;
      stopNames?.();
    },
  };
}
