// notes documents ↔ domain values (docs/v2/INVENTORY.md: 8 notes, every field
// present, createdAt an ISO string). v2 writes exactly v1's shape (GOLDEN G15),
// so v1 reads what v2 saves.
import type { DocumentData } from 'firebase/firestore';
import type { Note, NoteDraft } from '@/domain/notes';
import { dateOrNull, stringOr } from './fields';

export function noteFromData(id: string, data: DocumentData): Note {
  return {
    id,
    title: stringOr(data.title),
    content: stringOr(data.content),
    icon: stringOr(data.icon),
    color: stringOr(data.color),
    createdAt: dateOrNull(data.createdAt),
    archived: data.archived === true,
  };
}

/** v1 saveNote() for a new note: nothing chosen = "", createdAt as an ISO string. */
export function newNoteData(draft: NoteDraft, now: Date): DocumentData {
  return {
    title: draft.title,
    content: draft.content,
    icon: draft.icon,
    color: draft.color,
    createdAt: now.toISOString(),
    archived: false,
  };
}

/** v1 saveNote() for an edit. */
export function noteEditData(draft: NoteDraft): DocumentData {
  return { title: draft.title, content: draft.content, icon: draft.icon, color: draft.color };
}
