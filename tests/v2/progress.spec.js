// The streak freeze and the badges (docs/v2/PLAN.md 9, stage 3e-2; GOLDEN G3, G4) on
// the Firebase emulators. v1 writes both while rendering its dashboard; v2 records
// them through services, once, and keeps the gap a freeze covered bridged.
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

function utcDaysAgo(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

/** Day logs with points `n` days ago. */
async function activeDays(uid, agos) {
  for (const ago of agos) {
    await db.doc(`users/${uid}/dailyLog/${utcDaysAgo(ago)}`).set({ pointsEarned: 20, gamingMinutes: 0 });
  }
}

const profileOf = async (uid) => (await db.doc(`users/${uid}`).get()).data();

test('G3.3: the freeze bridging a gap is recorded once, and the gap stays bridged', async ({ page }) => {
  // Everything earned so far is held as badges, so the freeze is the only write.
  const account = await createUser({
    tag: 'freeze',
    profile: { points: { total: 60, earnedAllTime: 60, spentAllTime: 0 }, achievements: ['first_activity'] },
  });
  await activeDays(account.uid, [0, 2, 3]);
  await openSignedIn(page, account, '#/today');
  await expect(page.getByTestId('streak')).toHaveText('3 dni z rzędu');
  await expect(page.getByText('Zamrożenie serii przykryło jedną przerwę')).toBeVisible();
  await expect.poll(async () => (await profileOf(account.uid)).streakFreezeLastUsed).toBe(utcDaysAgo(0));

  // v1 would now count 1 day: the freeze is spent. v2 keeps the gap it covered.
  await page.reload();
  await expect(page.getByTestId('streak')).toHaveText('3 dni z rzędu');
  await expect(page.getByText('Zamrożenie serii przykryło jedną przerwę')).toBeVisible();
});

test('G4: new badges are recorded once, announced, and shown in Statistics', async ({ page }) => {
  const account = await createUser({ tag: 'badges', profile: { points: { total: 1200, earnedAllTime: 1200, spentAllTime: 0 } } });
  await openSignedIn(page, account, '#/today');
  await expect(page.getByText('Nowa odznaka: ✨ Pierwsza iskra, 💰 Tysiąc punktów!')).toBeVisible();
  await expect.poll(async () => (await profileOf(account.uid)).achievements).toEqual(['first_activity', 'pts_1000']);

  await page.goto(page.url().replace('#/today', '#/stats'));
  await expect(page.getByTestId('badges-count')).toHaveText('2 z 14');
  const badges = page.getByRole('list', { name: 'Osiągnięcia' }).getByRole('listitem');
  await expect(badges).toHaveCount(14);
  await expect(badges.nth(0)).toContainText('Pierwsza iskra');
  await expect(badges.nth(0)).toContainText('zdobyte');
  await expect(badges.nth(2)).toContainText('Pięć tysięcy');
  await expect(badges.nth(2)).toContainText('jeszcze nie');

  // Nothing new on the next visit.
  await page.goto(page.url().replace('#/stats', '#/today'));
  await expect(page.getByTestId('streak')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText(/Nowa odznaka/)).toHaveCount(0);
  expect((await profileOf(account.uid)).achievements).toEqual(['first_activity', 'pts_1000']);
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity G4: v1 adds the same badges for the same account', async ({ page, context }) => {
    const account = await createUser({ tag: 'badges-v1', profile: { points: { total: 1200, earnedAllTime: 1200, spentAllTime: 0 } } });
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await expect.poll(async () => (await profileOf(account.uid)).achievements).toEqual(['first_activity', 'pts_1000']);
  });
});
