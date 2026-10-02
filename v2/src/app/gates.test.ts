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
  accountMode: 'solo',
  parentEmail: '',
  modulesChosen: true,
  enabledModules: ['chores'],
  disabledModules: null,
  lang: 'pl',
  points: { total: 0, earnedAllTime: 0, spentAllTime: 0 },
  dailyLimit: null,
  rateGeneral: { zloty: null, points: null },
  rateChores: { zloty: null, points: null },
  streakFreezeLastUsed: null,
  pcBuild: null,
  goals: [],
  moneyIncomeAllTime: null,
  choresCard: { mode: 'random', ids: [] },
  achievements: [],
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

  test('account mode, then the module survey, asked in v2 (stage 4b)', () => {
    const noMode = { ...ready, accountModeChosen: false, modulesChosen: false };
    expect(signedIn(noMode)).toEqual({ kind: 'setup', step: 'accountMode', user, profile: noMode });
    const noModules = { ...ready, modulesChosen: false };
    expect(signedIn(noModules)).toEqual({ kind: 'setup', step: 'modules', user, profile: noModules });
  });
});
