// Live data behind the Today screen (stage 2a). The screen starts the listeners when
// it mounts and stops them when it leaves; each source fills in on its own, so the
// page shows what has arrived instead of waiting for everything.
import { signal } from '@preact/signals';
import type { Activity, ActivityDef, DayLog } from '@/domain/activity';
import type { ChoreDef, ChoreEntry } from '@/domain/chores';

/** undefined = still loading. */
export interface TodaySources {
  days: ReadonlyMap<string, DayLog> | undefined;
  recent: readonly Activity[] | undefined;
  /** What can be logged, in v1's order. */
  activityDefs: readonly ActivityDef[] | undefined;
  activityNames: ReadonlyMap<string, string> | undefined;
  /** Grosze; null = no money/balance document. */
  balance: number | null | undefined;
  choreDefs: readonly ChoreDef[] | undefined;
  /** Every unpaid chore entry. */
  choreEntries: readonly ChoreEntry[] | undefined;
  failed: boolean;
}

const EMPTY: TodaySources = {
  days: undefined,
  recent: undefined,
  activityDefs: undefined,
  activityNames: undefined,
  balance: undefined,
  choreDefs: undefined,
  choreEntries: undefined,
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

  void Promise.all([import('@/data/repos/today'), import('@/data/repos/activities')])
    .then(([repo, activities]) => {
      if (stopped) return;
      stops.push(
        repo.watchDayLogs(uid, (days) => set({ days }), fail),
        repo.watchRecentActivities(uid, RECENT_COUNT, (recent) => set({ recent }), fail),
        activities.watchActivityDefs(
          uid,
          (activityDefs) => set({ activityDefs, activityNames: new Map(activityDefs.map((d) => [d.id, d.name])) }),
          fail,
        ),
        repo.watchMoneyBalance(uid, (balance) => set({ balance }), fail),
        repo.watchChoreDefs(uid, (choreDefs) => set({ choreDefs }), fail),
        repo.watchChoreEntries(uid, (choreEntries) => set({ choreEntries }), fail),
      );
    })
    .catch(fail);

  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
