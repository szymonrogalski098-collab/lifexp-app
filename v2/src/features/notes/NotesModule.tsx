// Notes (docs/v2/PLAN.md 9, stage 3a): the list at #/notes, one note at #/notes/:id
// (#/notes/new for a new one). The first v2 module that writes; the documents keep
// v1's shape exactly (GOLDEN G15), so v1 shows what v2 saves and the other way round.
import { useEffect } from 'preact/hooks';
import { t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { notes as notesState, watchNotes } from '@/stores/notes';
import { account } from '@/stores/session';
import { Skeleton } from '@/ui/components/Display';
import { Card, Page, Stack } from '@/ui/components/Layout';
import { NoteEditor } from './NoteEditor';
import { NotesList } from './NotesList';
import './notes.css';

export default function NotesModule({ params, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  // Started here, not per view: going list → note → list keeps one listener.
  useEffect(() => (uid ? watchNotes(uid) : undefined), [uid]);
  if (!current || !uid) return null;

  const { list, failed } = notesState.value;
  return (
    <Page>
      <Stack>
        {failed && (
          <p class="notes-error" role="alert">
            {t('notes.loadFailed')}
          </p>
        )}
        {list === undefined ? (
          <Card>
            <Skeleton lines={4} />
          </Card>
        ) : params.id ? (
          <NoteEditor key={params.id} uid={uid} id={params.id} notes={list} navigate={navigate} />
        ) : (
          <NotesList notes={list} />
        )}
      </Stack>
    </Page>
  );
}
