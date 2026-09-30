// One note: title, icon, colour and Markdown content, with Edit | Preview for the content
// (v1's editor, notes.js:437-500). Saving keeps the note open — a new one moves to
// its own address — so Back returns to wherever the person came from.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  NOTE_COLORS,
  NOTE_ICONS,
  NOTE_TITLE_MAX,
  NOTES_MAX,
  canAddNote,
  isNoteIcon,
  type Note,
  type NoteDraft,
  type NoteIcon,
  type NoteProblem,
} from '@/domain/notes';
import { locale, t } from '@/i18n';
import { formatLongDate } from '@/lib/dates';
import { applyMarkdownFormat, type MarkdownFormat } from '@/lib/markdown-edit';
import type { Navigate } from '@/lib/route-match';
import { archiveNote, createNote, deleteNote, updateNote, type NoteRejection } from '@/services/notes';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState } from '@/ui/components/Display';
import { SegmentedControl, TextAreaField, TextField } from '@/ui/components/Fields';
import { Card } from '@/ui/components/Layout';
import { Markdown } from '@/ui/components/Markdown';
import { afterModalHistory } from '@/ui/components/useModal';
import { NoteBadge, noteIconOf } from './NoteBadge';

const NEW = 'new';
const FORMATS: readonly MarkdownFormat[] = ['bold', 'italic', 'heading', 'bullets', 'numbers'];

type NoteColor = (typeof NOTE_COLORS)[number];
type ColorKey = NoteColor extends `#${infer Hex}` ? Hex : never;

const isNoteColor = (color: string): color is NoteColor => (NOTE_COLORS as readonly string[]).includes(color);

/** The preset's name; a colour v1 allowed that is not a preset shows as its code. */
function colorName(color: string): string {
  return isNoteColor(color) ? t(`notes.colors.${color.slice(1) as ColorKey}`) : color;
}

type IconKey = NoteIcon extends `ti-${infer Name}` ? Name : never;

function iconName(icon: string): string {
  return isNoteIcon(icon) ? t(`notes.icons.${icon.slice(3) as IconKey}`) : t('notes.defaultIcon');
}

function problemText(problem: NoteRejection): string {
  switch (problem.kind) {
    case 'titleRequired':
      return t('notes.needTitle');
    case 'tooManyLines':
      return t('notes.maxLines', { lines: problem.lines, max: problem.max });
    case 'limit':
      return t('notes.maxNotes', { max: problem.max });
  }
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const options = ['', ...NOTE_COLORS];
  return (
    <fieldset class="notes-colors">
      <legend class="ui-field__label">
        {t('notes.color')}: <span class="notes-colors__current">{value ? colorName(value) : t('notes.noColor')}</span>
      </legend>
      <div class="notes-colors__options">
        {options.map((color) => (
          <label key={color || 'none'} class="notes-colors__option">
            <input
              class="notes-colors__input"
              type="radio"
              name="note-color"
              value={color}
              checked={color === value}
              onChange={() => onChange(color)}
            />
            <span
              class={color ? 'notes-colors__swatch' : 'notes-colors__swatch notes-colors__swatch--none'}
              style={{ '--note-color': color || 'transparent' }}
              aria-hidden="true"
            />
            <span class="visually-hidden">{color ? colorName(color) : t('notes.noColor')}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** v1's icon grid as radios: the chosen name in the legend, each icon named for screen readers. */
function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (icon: string) => void }) {
  return (
    <fieldset class="notes-icons">
      <legend class="ui-field__label">
        {t('notes.icon')}: <span class="notes-icons__current">{iconName(value)}</span>
      </legend>
      <div class="notes-icons__options">
        {NOTE_ICONS.map((icon) => {
          const Icon = noteIconOf(icon);
          return (
            <label key={icon} class="notes-icons__option">
              <input
                class="notes-icons__input"
                type="radio"
                name="note-icon"
                value={icon}
                checked={icon === value}
                onChange={() => onChange(icon)}
              />
              <span
                class={color ? 'notes-icons__tile' : 'notes-icons__tile notes-icons__tile--plain'}
                style={{ '--note-color': color || 'var(--color-text-secondary)' }}
                aria-hidden="true"
              >
                <Icon />
              </span>
              <span class="visually-hidden">{iconName(icon)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface NoteEditorProps {
  uid: string;
  /** A note id, or "new". */
  id: string;
  notes: readonly Note[];
  navigate: Navigate;
}

export function NoteEditor({ uid, id, notes, navigate }: NoteEditorProps) {
  const isNew = id === NEW;
  const note = isNew ? null : (notes.find((n) => n.id === id) ?? null);
  const [draft, setDraft] = useState<NoteDraft>(() => ({
    title: note?.title ?? '',
    content: note?.content ?? '',
    icon: note?.icon ?? '',
    color: note?.color ?? '',
  }));
  const [mode, setMode] = useState<'edit' | 'preview'>(isNew ? 'edit' : 'preview');
  const [problem, setProblem] = useState<NoteProblem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** A note just created here: move to its address once the listener has it (at once, even offline). */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const lastToast = useRef<number | null>(null);

  const created = createdId !== null && notes.some((n) => n.id === createdId);
  useEffect(() => {
    // The new note replaces #/notes/new, so Back goes where it did before.
    if (createdId && created) navigate(`/notes/${encodeURIComponent(createdId)}`, { replace: true });
  }, [createdId, created]);

  // After deleting: to the list in place of this note, once the dialog's history entry is gone.
  useEffect(() => (leaving ? afterModalHistory(() => navigate('/notes', { replace: true })) : undefined), [leaving]);
  if (leaving) return null;

  const back = (
    <div class="notes-back">
      <ButtonLink variant="quiet" href="#/notes">
        ‹ {t('notes.back')}
      </ButtonLink>
    </div>
  );

  if (!isNew && !note) {
    return (
      <>
        {back}
        <Card>
          <EmptyState title={t('notes.notFound')} />
        </Card>
      </>
    );
  }
  if (isNew && createdId === null && !canAddNote(notes)) {
    return (
      <>
        {back}
        <Card>
          <EmptyState title={t('notes.maxNotes', { max: NOTES_MAX })} />
        </Card>
      </>
    );
  }

  const dirty =
    isNew ||
    !note ||
    draft.title !== note.title ||
    draft.content !== note.content ||
    draft.icon !== note.icon ||
    draft.color !== note.color;
  const set = (patch: Partial<NoteDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };

  // A newer message from this screen replaces the older one instead of queueing behind
  // it (e.g. "Deleted" after "Archived · Undo", whose undo no longer applies).
  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const reportFailure = () => notify({ message: t('notes.saveFailed'), tone: 'negative' });

  const save = () => {
    const result = isNew ? createNote(uid, draft, notes) : updateNote(uid, id, draft);
    if (!result.ok) {
      if (result.problem.kind === 'limit') notify({ message: problemText(result.problem), tone: 'negative' });
      else setProblem(result.problem);
      return;
    }
    result.saved.catch(reportFailure);
    notify({ message: t('notes.saved'), tone: 'positive' });
    setMode('preview');
    if (isNew) setCreatedId(result.id);
  };

  const toggleArchive = () => {
    if (!note) return;
    const archived = !note.archived;
    archiveNote(uid, note.id, archived).catch(reportFailure);
    notify({
      message: t(archived ? 'notes.archivedToast' : 'notes.restoredToast'),
      action: {
        label: t('ui.undo'),
        onAction: () => void archiveNote(uid, note.id, !archived).catch(reportFailure),
      },
    });
  };

  const remove = () => {
    if (!note) return;
    setConfirming(false);
    deleteNote(uid, note.id).catch(reportFailure);
    notify({ message: t('notes.deletedToast') });
    setLeaving(true);
  };

  const format = (kind: MarkdownFormat) => {
    const el = textarea.current;
    if (!el) return;
    const edit = applyMarkdownFormat(draft.content, el.selectionStart, el.selectionEnd, kind);
    set({ content: edit.value });
    // After Preact has written the new value, put the selection back on the text.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  const titleError = problem?.kind === 'titleRequired' ? problemText(problem) : null;
  const contentError = problem?.kind === 'tooManyLines' ? problemText(problem) : null;

  return (
    <>
      {back}

      <header class="notes-editor__head">
        <NoteBadge icon={draft.icon} color={draft.color} size="lg" />
        <div class="notes-editor__heading">
          <h2 class="notes-editor__title user-text">{isNew ? t('notes.new') : note?.title}</h2>
          {note && (
            <p class="notes-editor__meta">
              {note.createdAt && t('notes.createdOn', { date: formatLongDate(note.createdAt, locale()) })}
              {note.archived && <span class="notes-editor__badge">{t('notes.inArchive')}</span>}
            </p>
          )}
        </div>
      </header>

      <Card>
        <form
          class="stack notes-editor"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <TextField
            label={t('notes.titleLabel')}
            value={draft.title}
            onInput={(title) => set({ title })}
            error={titleError}
            maxLength={NOTE_TITLE_MAX}
          />

          <IconPicker value={draft.icon} color={draft.color} onChange={(icon) => set({ icon })} />
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} />

          <SegmentedControl
            label={t('notes.mode')}
            value={mode}
            options={[
              { value: 'edit', label: t('notes.modeEdit') },
              { value: 'preview', label: t('notes.modePreview') },
            ]}
            onChange={setMode}
          />

          {mode === 'edit' ? (
            <TextAreaField
              label={t('notes.contentLabel')}
              value={draft.content}
              onInput={(content) => set({ content })}
              placeholder={t('notes.contentPh')}
              error={contentError}
              textareaRef={textarea}
              rows={10}
              toolbar={
                <div class="notes-toolbar" role="toolbar" aria-label={t('notes.format')}>
                  {FORMATS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      class={`notes-toolbar__button notes-toolbar__button--${kind}`}
                      // Keep the textarea's selection: a pressed button must not take the focus first.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => format(kind)}
                    >
                      {t(`notes.formats.${kind}`)}
                    </button>
                  ))}
                </div>
              }
            />
          ) : (
            <div class="notes-preview" aria-label={t('notes.modePreview')}>
              {draft.content.trim() ? (
                <Markdown text={draft.content} />
              ) : (
                <p class="notes-preview__empty">{t('notes.previewEmpty')}</p>
              )}
              {contentError && (
                <p class="ui-field__error" role="alert">
                  {contentError}
                </p>
              )}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" block disabled={!dirty}>
            {t('notes.save')}
          </Button>
        </form>
      </Card>

      {note && (
        <div class="notes-editor__actions">
          <Button variant="secondary" onClick={toggleArchive}>
            {t(note.archived ? 'notes.restore' : 'notes.archive')}
          </Button>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t(note.archived ? 'notes.deleteForever' : 'notes.delete')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={t(note?.archived ? 'notes.confirmDeleteForever' : 'notes.confirmDelete')}
        body={t('notes.confirmBody')}
        confirmLabel={t(note?.archived ? 'notes.deleteForever' : 'notes.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
