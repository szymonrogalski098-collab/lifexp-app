// The Money balance alone, live (stage 3d: deposits onto goals). The Goals screen
// starts the listener when it mounts and stops it when it leaves.
import { signal } from '@preact/signals';

/** Grosze; null = no money/balance document yet; undefined = still loading. */
export const balance = signal<number | null | undefined>(undefined);

export function watchBalance(uid: string): () => void {
  let stopped = false;
  let stop: (() => void) | null = null;
  void import('@/data/repos/today')
    .then((repo) => {
      if (stopped) return;
      stop = repo.watchMoneyBalance(
        uid,
        (grosze) => {
          if (!stopped) balance.value = grosze;
        },
        () => undefined,
      );
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    stop?.();
    balance.value = undefined;
  };
}
