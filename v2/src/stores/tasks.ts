// The account's tasks, live (stage 3a). The Tasks screen starts the listener when it
// mounts and stops it when it leaves. The PC build comes with the profile (session).
import { signal } from '@preact/signals';
import type { Task } from '@/domain/tasks';

export interface TasksState {
  /** undefined = still loading. */
  list: readonly Task[] | undefined;
  failed: boolean;
}

const EMPTY: TasksState = { list: undefined, failed: false };

export const tasks = signal<TasksState>(EMPTY);

export function watchTasks(uid: string): () => void {
  tasks.value = EMPTY;
  let stopped = false;
  let stop: (() => void) | null = null;
  const fail = () => {
    if (!stopped) tasks.value = { ...tasks.value, failed: true };
  };
  void import('@/data/repos/tasks')
    .then((repo) => {
      if (stopped) return;
      stop = repo.watchTasks(
        uid,
        (list) => {
          if (!stopped) tasks.value = { list, failed: false };
        },
        fail,
      );
    })
    .catch(fail);
  return () => {
    stopped = true;
    stop?.();
  };
}
