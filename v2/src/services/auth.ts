// Sign-in use cases. Results instead of exceptions, so screens only translate a key.
import { signInWithEmail, signInWithGoogle, signOutUser } from '@/data/auth';
import { authErrorKey, type AuthErrorKey } from './auth-errors';

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorKey };

export async function login(email: string, password: string): Promise<AuthResult> {
  if (!email.trim() || !password) return { ok: false, error: 'auth.errors.fillAll' };
  try {
    await signInWithEmail(email.trim(), password);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: authErrorKey(e) };
  }
}

export async function loginWithGoogle(): Promise<AuthResult> {
  try {
    await signInWithGoogle();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: authErrorKey(e) };
  }
}

export function logout(): Promise<void> {
  return signOutUser();
}
