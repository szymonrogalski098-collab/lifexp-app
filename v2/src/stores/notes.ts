// The account's notes, live (stage 3a). The notes screens start the listener when
// they mount and stop it when they leave.
import { signal } from '@preact/signals';
import type { Note } from '@/domain/notes';

export interface NotesState {
  /** undefined = still loading. */
  list: readonly Note[] | undefined;
  failed: boolean;
}

const EMPTY: NotesState = { list: undefined, failed: false };

export const notes = signal<NotesState>(EMPTY);

export function watchNotes(uid: string): () => void {
  notes.value = EMPTY;
  let stopped = false;
  let stop: (() => void) | null = null;
  void import('@/data/repos/notes')
    .then((repo) => {
      if (stopped) return;
      stop = repo.watchNotes(
        uid,
        (list) => {
          if (!stopped) notes.value = { list, failed: false };
        },
        () => {
          if (!stopped) notes.value = { ...notes.value, failed: true };
        },
      );
    })
    .catch(() => {
      if (!stopped) notes.value = { ...notes.value, failed: true };
    });
  return () => {
    stopped = true;
    stop?.();
  };
}
