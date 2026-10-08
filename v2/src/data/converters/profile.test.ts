import { describe, expect, test } from 'vitest';
import { DEFAULT_NAME, choresCardFromData, profileFromData } from './profile';

describe('profile converter', () => {
  test('a fully set-up profile', () => {
    expect(
      profileFromData({
        name: 'Ala',
        email: 'ala@example.com',
        emailVerified: true,
        accountMode: 'solo',
        parentEmail: '',
        parentEmailVerifiedAt: '2026-09-01T10:00:00.000Z',
        autoReport: true,
        enabledModules: ['chores', 'money'],
        lang: 'en',
        points: { total: 1234, earnedAllTime: 620, spentAllTime: 50 },
        dailyLimit: 120,
        pointsRateGeneralZl: 2,
        pointsRateGeneralPts: 10,
        pointsRateChoresZl: 0.5,
        pointsRateChoresPts: 1,
        streakFreezeLastUsed: '2026-09-20',
        goals: [
          { id: 'g1', type: 'money', saved: 12.5 },
          { id: 'g2', type: 'points', saved: 99 },
          { id: 'g3', type: 'money', saved: 0.1 },
        ],
        moneyIncomeAllTime: 18.45,
        achievements: ['first_activity', 3, 'streak_7'],
      }),
    ).toEqual({
      name: 'Ala',
      email: 'ala@example.com',
      emailVerified: true,
      accountModeChosen: true,
      accountMode: 'solo',
      parentEmail: '',
      parentEmailVerifiedAt: '2026-09-01T10:00:00.000Z',
      pendingParentEmail: null,
      autoReport: true,
      modulesChosen: true,
      enabledModules: ['chores', 'money'],
      disabledModules: null,
      lang: 'en',
      points: { total: 1234, earnedAllTime: 620, spentAllTime: 50 },
      dailyLimit: 120,
      rateGeneral: { zloty: 2, points: 10 },
      rateChores: { zloty: 0.5, points: 1 },
      streakFreezeLastUsed: '2026-09-20',
      pcBuild: null,
      goals: [
        { id: 'g1', name: '', type: 'money', target: 0, saved: 1250, celebrated: false },
        { id: 'g2', name: '', type: 'points', target: 0, saved: 9900, celebrated: false },
        { id: 'g3', name: '', type: 'money', target: 0, saved: 10, celebrated: false },
      ],
      moneyIncomeAllTime: 1845,
      choresCard: { mode: 'random', ids: [] },
      achievements: ['first_activity', 'streak_7'],
      lastBugReportAt: null,
    });
  });

  // The 1 of 6 production profiles without accountMode/enabledModules/onboardingDone.
  test('a profile v1 has not finished setting up', () => {
    const p = profileFromData({ name: 'Ola', email: 'o@example.com', emailVerified: true, points: {} });
    expect(p.accountModeChosen).toBe(false);
    expect(p.modulesChosen).toBe(false);
    expect(p.enabledModules).toBeNull();
    expect(p.accountMode).toBeNull();
    expect(p.lang).toBeNull();
  });

  test('an empty module list still counts as chosen, as in v1', () => {
    expect(profileFromData({ enabledModules: [] }).modulesChosen).toBe(true);
    // M3: written by v2; anything but strings is left out.
    expect(profileFromData({ disabledModules: ['games', 3] }).disabledModules).toEqual(['games']);
  });

  // INVENTORY: pointsRateChoresZl is int or float; only 3 of 6 profiles set a limit or rate.
  test('rates as int or float; absent limit and rates stay null (v1 defaults apply later)', () => {
    const p = profileFromData({ pointsRateGeneralZl: 1.5, points: { total: 3 } });
    expect(p.rateGeneral).toEqual({ zloty: 1.5, points: null });
    expect(p.dailyLimit).toBeNull();
    expect(p.points).toEqual({ total: 3, earnedAllTime: 0, spentAllTime: 0 });
  });

  test('missing or odd values get v1 defaults', () => {
    expect(
      profileFromData({
        name: '  ',
        lang: 'de',
        emailVerified: 'yes',
        points: 'lots',
        dailyLimit: 0,
        streakFreezeLastUsed: 'yesterday',
        enabledModules: ['chores', 7],
        parentEmail: 7,
        pendingParentEmail: '',
        autoReport: 'yes',
      }),
    ).toEqual({
      name: DEFAULT_NAME,
      email: '',
      emailVerified: false,
      accountModeChosen: false,
      accountMode: null,
      parentEmail: '',
      parentEmailVerifiedAt: null,
      pendingParentEmail: null,
      autoReport: false,
      modulesChosen: true,
      enabledModules: ['chores'],
      disabledModules: null,
      lang: null,
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
      lastBugReportAt: null,
    });
  });
});

describe('choresCard (v2 only)', () => {
  test('random without the field or with anything odd; chosen keeps string ids', () => {
    expect(choresCardFromData(undefined)).toEqual({ mode: 'random', ids: [] });
    expect(choresCardFromData({ mode: 'lottery', ids: ['a'] })).toEqual({ mode: 'random', ids: [] });
    expect(choresCardFromData({ mode: 'chosen', ids: ['a', 7, 'b'] })).toEqual({ mode: 'chosen', ids: ['a', 'b'] });
    expect(choresCardFromData({ mode: 'chosen' })).toEqual({ mode: 'chosen', ids: [] });
  });
});
