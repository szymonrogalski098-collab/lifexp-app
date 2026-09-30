// Chore definitions, unpaid entries and past payouts, live (stage 3b). The Chores screen starts
// the listeners when it mounts and stops them when it leaves.
import { signal } from '@preact/signals';
import type { ChoreDef, ChoreEntry, ChorePayout } from '@/domain/chores';

/** undefined = still loading. */
export interface ChoresState {
  defs: readonly ChoreDef[] | undefined;
  entries: readonly ChoreEntry[] | undefined;
  payouts: readonly ChorePayout[] | undefined;
  failed: boolean;
}

const EMPTY: ChoresState = { defs: undefined, entries: undefined, payouts: undefined, failed: false };

export const chores = signal<ChoresState>(EMPTY);

export function watchChores(uid: string): () => void {
  chores.value = EMPTY;
  let stopped = false;
  const stops: (() => void)[] = [];
  const set = (patch: Partial<ChoresState>) => {
    if (!stopped) chores.value = { ...chores.value, ...patch };
  };
  const fail = () => set({ failed: true });
  void Promise.all([import('@/data/repos/today'), import('@/data/repos/chores')])
    .then(([todayRepo, choresRepo]) => {
      if (stopped) return;
      stops.push(
        todayRepo.watchChoreDefs(uid, (defs) => set({ defs }), fail),
        todayRepo.watchChoreEntries(uid, (entries) => set({ entries }), fail),
        choresRepo.watchChorePayouts(uid, (payouts) => set({ payouts }), fail),
      );
    })
    .catch(fail);
  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
