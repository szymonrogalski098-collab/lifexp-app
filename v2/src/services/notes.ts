// Note use cases (docs/v2/PLAN.md 9, stage 3a): the rules of domain/notes, then one
// write. A note is a single document, so every change is one atomic write; there
// is nothing to keep consistent across documents, hence no transaction.
//
// Results are returned at once, with `saved` settling when the server has the
// write: offline it stays pending (Firestore queues it and the list already shows
// it), so screens move on without waiting and only report a rejected `saved`.
import { addNote, editNote, newNoteId, removeNote, setNoteArchived } from '@/data/repos/notes';
import {
  canAddNote,
  normalizedDraft,
  noteProblem,
  NOTES_MAX,
  type Note,
  type NoteDraft,
  type NoteProblem,
} from '@/domain/notes';

export type NoteRejection = NoteProblem | { kind: 'limit'; max: number };

export type NoteSaveResult = { ok: true; id: string; saved: Promise<void> } | { ok: false; problem: NoteRejection };

/** v1 openNoteEditor() + saveNote(): the active limit first, then the note itself. */
export function createNote(uid: string, draft: NoteDraft, notes: readonly Note[], now = new Date()): NoteSaveResult {
  if (!canAddNote(notes)) return { ok: false, problem: { kind: 'limit', max: NOTES_MAX } };
  const problem = noteProblem(draft);
  if (problem) return { ok: false, problem };
  const id = newNoteId(uid);
  return { ok: true, id, saved: addNote(uid, id, normalizedDraft(draft), now) };
}

export function updateNote(uid: string, id: string, draft: NoteDraft): NoteSaveResult {
  const problem = noteProblem(draft);
  if (problem) return { ok: false, problem };
  return { ok: true, id, saved: editNote(uid, id, normalizedDraft(draft)) };
}

/** v1 noteMenuArchive(): one flag, the same action restores. */
export function archiveNote(uid: string, id: string, archived: boolean): Promise<void> {
  return setNoteArchived(uid, id, archived);
}

/** v1 noteMenuDelete(): the document is gone (after the screen's confirmation). */
export function deleteNote(uid: string, id: string): Promise<void> {
  return removeNote(uid, id);
}
