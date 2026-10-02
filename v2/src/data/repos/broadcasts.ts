// Top-level broadcasts (v1 updates.js): everyone signed in reads, only the admin
// writes (firestore.rules).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { broadcastSeconds, type Broadcast } from '@/domain/broadcasts';
import { dateOrNull, stringOr } from '../converters/fields';
import { db } from '../firebase';

const broadcasts = () => collection(db, 'broadcasts');

function broadcastFromData(id: string, data: DocumentData): Broadcast {
  return { id, text: stringOr(data.text), seconds: broadcastSeconds(data.durationSec), createdAt: dateOrNull(data.createdAt) };
}

/** The newest `count`, newest first, live. */
export function watchBroadcasts(
  count: number,
  onChange: (list: Broadcast[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    query(broadcasts(), orderBy('createdAt', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.map((d) => broadcastFromData(d.id, d.data()))),
    onError,
  );
}

/** v1 sendBroadcast(). */
export async function addBroadcast(text: string, seconds: number, now: Date): Promise<void> {
  await addDoc(broadcasts(), { text, durationSec: seconds, createdAt: now });
}

/** v1 deleteBroadcast(). */
export function removeBroadcast(id: string): Promise<void> {
  return deleteDoc(doc(broadcasts(), id));
}
