// users/{uid}/notes (docs/v2/PLAN.md 9, stage 3a). Writes resolve when the server
// has them; offline, Firestore keeps them queued and the listener already shows
// them, so callers do not wait for the promise to update the screen.
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import type { Note, NoteDraft } from '@/domain/notes';
import { newNoteData, noteEditData, noteFromData } from '../converters/notes';
import { db } from '../firebase';

type OnError = (error: unknown) => void;

const notesOf = (uid: string) => collection(db, 'users', uid, 'notes');

/** Every note, newest first — v1's query (a note without createdAt is not listed there either). */
export function watchNotes(uid: string, onChange: (notes: Note[]) => void, onError: OnError) {
  return onSnapshot(
    query(notesOf(uid), orderBy('createdAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => noteFromData(d.id, d.data()))),
    onError,
  );
}

/** A new document id, known before the write, so the screen can open the note at once. */
export function newNoteId(uid: string): string {
  return doc(notesOf(uid)).id;
}

export function addNote(uid: string, id: string, draft: NoteDraft, now: Date): Promise<void> {
  return setDoc(doc(notesOf(uid), id), newNoteData(draft, now));
}

export function editNote(uid: string, id: string, draft: NoteDraft): Promise<void> {
  return updateDoc(doc(notesOf(uid), id), noteEditData(draft));
}

export function setNoteArchived(uid: string, id: string, archived: boolean): Promise<void> {
  return updateDoc(doc(notesOf(uid), id), { archived });
}

export function removeNote(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(notesOf(uid), id));
}
