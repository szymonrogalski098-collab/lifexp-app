import { expect, test } from 'vitest';
import { authErrorKey } from './auth-errors';

test.each([
  [{ code: 'auth/invalid-credential' }, 'auth.errors.invalidCredential'],
  [{ code: 'auth/wrong-password' }, 'auth.errors.wrongPassword'],
  [{ code: 'auth/popup-closed-by-user' }, 'auth.errors.popupClosed'],
  [{ code: 'auth/network-request-failed' }, 'auth.errors.network'],
  [{ code: 'auth/something-new' }, 'auth.errors.unknown'],
  [new Error('boom'), 'auth.errors.unknown'],
  [null, 'auth.errors.unknown'],
])('%o → %s', (error, key) => {
  expect(authErrorKey(error)).toBe(key);
});
