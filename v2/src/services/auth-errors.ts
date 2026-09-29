// Firebase Auth error codes → i18n keys, with v1's wording (index.html translateError).

export type AuthErrorKey =
  | 'auth.errors.fillAll'
  | 'auth.errors.userNotFound'
  | 'auth.errors.wrongPassword'
  | 'auth.errors.invalidCredential'
  | 'auth.errors.invalidEmail'
  | 'auth.errors.popupClosed'
  | 'auth.errors.popupBlocked'
  | 'auth.errors.tooManyRequests'
  | 'auth.errors.network'
  | 'auth.errors.unknown';

const BY_CODE: Record<string, AuthErrorKey> = {
  'auth/user-not-found': 'auth.errors.userNotFound',
  'auth/wrong-password': 'auth.errors.wrongPassword',
  'auth/invalid-credential': 'auth.errors.invalidCredential',
  'auth/invalid-login-credentials': 'auth.errors.invalidCredential',
  'auth/invalid-email': 'auth.errors.invalidEmail',
  'auth/popup-closed-by-user': 'auth.errors.popupClosed',
  'auth/cancelled-popup-request': 'auth.errors.popupClosed',
  'auth/popup-blocked': 'auth.errors.popupBlocked',
  'auth/too-many-requests': 'auth.errors.tooManyRequests',
  'auth/network-request-failed': 'auth.errors.network',
};

export function authErrorKey(error: unknown): AuthErrorKey {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return (typeof code === 'string' && BY_CODE[code]) || 'auth.errors.unknown';
}
