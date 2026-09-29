import { describe, expect, test } from 'vitest';
import { DEFAULT_NAME, profileFromData } from './profile';

describe('profile converter', () => {
  test('a fully set-up profile', () => {
    expect(
      profileFromData({
        name: 'Ala',
        email: 'ala@example.com',
        emailVerified: true,
        accountMode: 'solo',
        enabledModules: ['chores'],
        lang: 'en',
        points: { total: 5 },
      }),
    ).toEqual({
      name: 'Ala',
      email: 'ala@example.com',
      emailVerified: true,
      accountModeChosen: true,
      modulesChosen: true,
      lang: 'en',
    });
  });

  // The 1 of 6 production profiles without accountMode/enabledModules/onboardingDone.
  test('a profile v1 has not finished setting up', () => {
    const p = profileFromData({ name: 'Ola', email: 'o@example.com', emailVerified: true, points: {} });
    expect(p.accountModeChosen).toBe(false);
    expect(p.modulesChosen).toBe(false);
    expect(p.lang).toBeNull();
  });

  test('an empty module list still counts as chosen, as in v1', () => {
    expect(profileFromData({ enabledModules: [] }).modulesChosen).toBe(true);
  });

  test('missing or odd values get v1 defaults', () => {
    expect(profileFromData({ name: '  ', lang: 'de', emailVerified: 'yes' })).toEqual({
      name: DEFAULT_NAME,
      email: '',
      emailVerified: false,
      accountModeChosen: false,
      modulesChosen: false,
      lang: null,
    });
  });
});
