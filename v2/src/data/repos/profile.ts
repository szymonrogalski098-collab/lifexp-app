// Live users/{uid}: one listener for the whole session (PLAN.md 4.5).
import { doc, onSnapshot } from 'firebase/firestore';
import type { Profile } from '@/domain/profile';
import { profileFromData } from '../converters/profile';
import { db } from '../firebase';

/** `null` = the document does not exist (v1 creates it on its next start). */
export function watchProfile(
  uid: string,
  onChange: (profile: Profile | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => onChange(snap.exists() ? profileFromData(snap.data()) : null),
    onError,
  );
}
