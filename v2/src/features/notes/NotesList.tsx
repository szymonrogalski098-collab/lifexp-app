// The list of notes: active or archived, newest first, each with its icon and colour.
import { Plus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { activeNoteCount, noteExcerpt, notesInView, NOTES_MAX, type Note } from '@/domain/notes';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { EmptyState, List, ListRow } from '@/ui/components/Display';
import { SegmentedControl } from '@/ui/components/Fields';
import { Card } from '@/ui/components/Layout';
import { NoteBadge } from './NoteBadge';

type View = 'active' | 'archived';

export function NotesList({ notes }: { notes: readonly Note[] }) {
  const [view, setView] = useState<View>('active');
  const shown = notesInView(notes, view === 'archived');
  const lang = locale();

  return (
    <>
      <div class="notes-head">
        <p class="notes-count numeric">{t('notes.count', { count: activeNoteCount(notes), max: NOTES_MAX })}</p>
        <ButtonLink variant="primary" href="#/notes/new">
          <Plus aria-hidden="true" />
          {t('notes.new')}
        </ButtonLink>
      </div>

      <SegmentedControl
        label={t('notes.views')}
        value={view}
        options={[
          { value: 'active', label: t('notes.active') },
          { value: 'archived', label: t('notes.archived') },
        ]}
        onChange={setView}
      />

      <Card padding="none">
        {shown.length === 0 ? (
          <EmptyState title={t(view === 'archived' ? 'notes.emptyArchived' : 'notes.empty')} />
        ) : (
          <List label={t(view === 'archived' ? 'notes.archived' : 'notes.active')}>
            {shown.map((note) => (
              <ListRow
                key={note.id}
                leading={<NoteBadge icon={note.icon} color={note.color} />}
                title={note.title}
                meta={noteExcerpt(note.content) || undefined}
                value={note.createdAt ? formatShortDate(note.createdAt, lang) : undefined}
                href={`#/notes/${encodeURIComponent(note.id)}`}
              />
            ))}
          </List>
        )}
      </Card>
    </>
  );
}
