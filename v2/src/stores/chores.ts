// Chore definitions and unpaid entries, live (stage 3b). The Chores screen starts
// the listeners when it mounts and stops them when it leaves.
import { signal } from '@preact/signals';
import type { ChoreDef, ChoreEntry } from '@/domain/chores';

/** undefined = still loading. */
export interface ChoresState {
  defs: readonly ChoreDef[] | undefined;
  entries: readonly ChoreEntry[] | undefined;
  failed: boolean;
}

const EMPTY: ChoresState = { defs: undefined, entries: undefined, failed: false };

export const chores = signal<ChoresState>(EMPTY);

export function watchChores(uid: string): () => void {
  chores.value = EMPTY;
  let stopped = false;
  const stops: (() => void)[] = [];
  const set = (patch: Partial<ChoresState>) => {
    if (!stopped) chores.value = { ...chores.value, ...patch };
  };
  const fail = () => set({ failed: true });
  void import('@/data/repos/today')
    .then((repo) => {
      if (stopped) return;
      stops.push(
        repo.watchChoreDefs(uid, (defs) => set({ defs }), fail),
        repo.watchChoreEntries(uid, (entries) => set({ entries }), fail),
      );
    })
    .catch(fail);
  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
