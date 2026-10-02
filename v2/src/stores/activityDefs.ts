// Activity types, live, for the screens that manage them (Settings → Aktywności,
// stage 4c). The screen starts the listener when it mounts and stops it when it leaves.
import { signal } from '@preact/signals';
import type { ActivityDef } from '@/domain/activity';

/** undefined = still loading. */
export interface ActivityDefsState {
  defs: readonly ActivityDef[] | undefined;
  failed: boolean;
}

const EMPTY: ActivityDefsState = { defs: undefined, failed: false };

export const activityDefs = signal<ActivityDefsState>(EMPTY);

export function watchActivityDefsState(uid: string): () => void {
  activityDefs.value = EMPTY;
  let stopped = false;
  let stop: (() => void) | null = null;
  const fail = () => {
    if (!stopped) activityDefs.value = { ...activityDefs.value, failed: true };
  };
  void import('@/data/repos/activities')
    .then((repo) => {
      if (stopped) return;
      stop = repo.watchActivityDefs(uid, (defs) => !stopped && (activityDefs.value = { defs, failed: false }), fail);
    })
    .catch(fail);
  return () => {
    stopped = true;
    stop?.();
  };
}
