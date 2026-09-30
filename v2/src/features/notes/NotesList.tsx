// The list of notes: active or archived, newest first. A note's saved colour is its
// mark (PLAN.md 7.1: v1's icons stay in the data but are not shown).
import { Plus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { activeNoteCount, noteExcerpt, notesInView, NOTES_MAX, type Note } from '@/domain/notes';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { EmptyState, List, ListRow } from '@/ui/components/Display';
import { SegmentedControl } from '@/ui/components/Fields';
import { Card } from '@/ui/components/Layout';

type View = 'active' | 'archived';

export function NoteMark({ color }: { color: string }) {
  return <span class="notes-mark" style={{ '--note-color': color || 'var(--color-border)' }} aria-hidden="true" />;
}

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
                leading={<NoteMark color={note.color} />}
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
