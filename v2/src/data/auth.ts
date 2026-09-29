// Firebase Auth for v2: the same accounts and the same signed-in session as v1.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import type { SessionUser } from '@/domain/profile';
import { auth } from './firebase';

function toSessionUser(user: User): SessionUser {
  return { uid: user.uid, email: user.email ?? '', displayName: user.displayName, emailVerified: user.emailVerified };
}

export function watchAuth(onChange: (user: SessionUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => onChange(user ? toSessionUser(user) : null));
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

/** Popup, as in v1. The profile document is created by v1 if it does not exist yet. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}
