import { describe, expect, test } from 'vitest';
import type { Profile, SessionUser } from '@/domain/profile';
import type { ProfileState } from '@/stores/session';
import { sessionGate } from './gates';

const user: SessionUser = { uid: 'u1', email: 'ala@example.com', displayName: null, emailVerified: false };
const ready: Profile = {
  name: 'Ala',
  email: 'ala@example.com',
  emailVerified: true,
  accountModeChosen: true,
  modulesChosen: true,
  enabledModules: ['chores'],
  lang: 'pl',
  points: { total: 0, earnedAllTime: 0, spentAllTime: 0 },
  dailyLimit: null,
  rateGeneral: { zloty: null, points: null },
  rateChores: { zloty: null, points: null },
  streakFreezeLastUsed: null,
  pcBuild: null,
};

const signedIn = (profile: ProfileState, u: SessionUser = user) => sessionGate({ status: 'signedIn', user: u, profile });

describe('boot gates', () => {
  test('before Firebase answers, and while the profile loads: boot screen', () => {
    expect(sessionGate({ status: 'loading' })).toEqual({ kind: 'boot' });
    expect(signedIn('loading')).toEqual({ kind: 'boot' });
  });

  test('signed out: login', () => {
    expect(sessionGate({ status: 'signedOut' })).toEqual({ kind: 'login' });
  });

  test('Firebase or the profile could not load: failure screen', () => {
    expect(sessionGate({ status: 'failed' })).toEqual({ kind: 'failed', signedIn: false });
    expect(signedIn('error')).toEqual({ kind: 'failed', signedIn: true });
  });

  test('a set-up, verified account: ready, with who it is', () => {
    expect(signedIn(ready)).toEqual({ kind: 'ready', user, profile: ready });
  });

  test('no profile document yet (first Google sign-in): v1 creates it', () => {
    expect(signedIn(null)).toEqual({ kind: 'finishSetup' });
  });

  test('e-mail not verified anywhere: verify in v1', () => {
    expect(signedIn({ ...ready, emailVerified: false })).toEqual({ kind: 'verify', email: 'ala@example.com' });
  });

  test('verified in Auth only (Google): passes, as in v1', () => {
    expect(signedIn({ ...ready, emailVerified: false }, { ...user, emailVerified: true }).kind).toBe('ready');
  });

  test('verification comes before setup, as in v1', () => {
    expect(signedIn({ ...ready, emailVerified: false, accountModeChosen: false }).kind).toBe('verify');
  });

  test('account mode or module survey missing: finish setup in v1', () => {
    expect(signedIn({ ...ready, accountModeChosen: false })).toEqual({ kind: 'finishSetup' });
    expect(signedIn({ ...ready, modulesChosen: false })).toEqual({ kind: 'finishSetup' });
  });
});
