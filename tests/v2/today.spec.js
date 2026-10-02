// Today (docs/v2/PLAN.md 9, stage 2a) on the Firebase emulators. The Definition of
// Done of stage 2: the numbers on v2's Today equal v1's dashboard on the same
// account, and v2 writes nothing.
const { Timestamp } = require('firebase-admin/firestore');
const { createUser, db, serveCdnFromNpm, signInToApp, todayUtcKey } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

function utcDaysAgo(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

/**
 * 1234 points (620 earned all time → level 2), 95 of 150 today, 45 min of gaming,
 * active today and the two days before, a gap, then one more day: a streak of 3.
 * The freeze was used today, so it is not available and v1 writes nothing for it.
 */
async function seededAccount() {
  const account = await createUser({
    tag: 'today',
    profile: {
      name: 'Ala Nowak',
      points: { total: 1234, earnedAllTime: 620, spentAllTime: 50 },
      dailyLimit: 150,
      streakFreezeLastUsed: todayUtcKey(),
    },
  });
  const user = db.doc(`users/${account.uid}`);
  const logs = { 0: [95, 45], 1: [40, 0], 2: [30, 0], 4: [20, 0] };
  for (const [ago, [pointsEarned, gamingMinutes]] of Object.entries(logs)) {
    await user.collection('dailyLog').doc(utcDaysAgo(Number(ago))).set({ pointsEarned, gamingMinutes });
  }
  await user
    .collection('activityDefs')
    .doc('learning')
    .set({ name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 });
  await user.collection('activities').add({
    type: 'learning',
    duration: 60,
    points: 40,
    desc: '',
    timestamp: Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000)),
  });
  await user.collection('activities').add({
    type: 'custom_type',
    duration: 30,
    points: 15,
    desc: 'rozdział 3',
    timestamp: Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000)),
  });
  await user.collection('money').doc('balance').set({ current: 50.5, currency: 'PLN', monthlyLimit: 0 });
  return account;
}

/** Every document of the account with its last update time: equal before and after = nothing written. */
async function snapshotAccount(uid) {
  const user = db.doc(`users/${uid}`);
  const state = { [user.path]: (await user.get()).updateTime.toMillis() };
  for (const collection of await user.listCollections()) {
    for (const d of (await collection.get()).docs) state[d.ref.path] = d.updateTime.toMillis();
  }
  return state;
}

const text = (locator) => locator.evaluate((el) => el.textContent.replace(/\s+/g, ' ').trim());

test('Today shows v1 dashboard numbers from the account, and writes nothing', async ({ page }) => {
  const account = await seededAccount();
  const before = await snapshotAccount(account.uid);

  await openSignedIn(page, account, '#/today');
  await expect(page.getByRole('heading', { name: 'Cześć, Ala' })).toBeVisible();
  await expect(page.getByTestId('points-total')).toBeVisible();
  // Polish does not group four-digit numbers (CLDR), so this matches v1's "1234".
  expect(await text(page.getByTestId('points-total'))).toBe('1234');
  await expect(page.getByText('≈ 123,40 zł')).toBeVisible();
  await expect(page.getByTestId('level')).toHaveText('Poziom 2');
  await expect(page.getByText('120 / 500 XP')).toBeVisible();
  await expect(page.getByTestId('streak')).toHaveText('3 dni z rzędu');
  await expect(page.getByTestId('today-points')).toHaveText('95');
  await expect(page.getByText('z 150 dziennego limitu')).toBeVisible();
  await expect(page.getByTestId('gaming')).toHaveText('45 min');
  expect(await text(page.getByTestId('balance'))).toBe('50,50 zł');

  const week = page.getByRole('list', { name: 'Ten tydzień' });
  await expect(week.getByRole('listitem')).toHaveCount(7);

  const recent = page.getByRole('list', { name: 'Ostatnie aktywności' }).getByRole('listitem');
  await expect(recent).toHaveCount(2);
  await expect(recent.nth(0)).toContainText('Nauka');
  await expect(recent.nth(0)).toContainText('+40 pkt');
  await expect(recent.nth(0)).toContainText('1 h ·');
  // A type without a definition shows its raw id, as in v1.
  await expect(recent.nth(1)).toContainText('custom_type');
  await expect(recent.nth(1)).toContainText('rozdział 3');

  // Give any stray write time to land, then compare every document.
  await page.waitForTimeout(500);
  expect(await snapshotAccount(account.uid)).toEqual(before);
});

test('v1 dashboard shows the same numbers on the same account', async ({ page, context }) => {
  const account = await seededAccount();
  await serveCdnFromNpm(context);
  await signInToApp(page, account);
  await expect(page.locator('#dash-pts-num')).toHaveText('1234');
  await expect(page.locator('#dash-level')).toHaveText('Poziom 2');
  await expect(page.locator('#dash-streak-num')).toHaveText('3');
  await expect(page.locator('#dash-today-pts')).toHaveText('95');
  await expect(page.locator('#dash-gaming-today')).toHaveText('45m');
});

test('a fresh account: no streak yet, no activities, no balance card', async ({ page, account }) => {
  await openSignedIn(page, account, '#/today');
  await expect(page.getByTestId('streak')).toHaveText('Zdobądź dziś punkty, żeby zacząć serię');
  await expect(page.getByTestId('today-points')).toHaveText('0');
  await expect(page.getByText('Brak aktywności. Zacznij zarabiać punkty!')).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveCount(0);
});

test('shortcuts follow the modules turned on in v1', async ({ page }) => {
  const account = await createUser({ tag: 'today-modules', profile: { enabledModules: ['chores', 'notes'] } });
  await openSignedIn(page, account, '#/today');
  await expect(page.locator('.today-shortcut')).toHaveText(['Notatki']);
  await expect(page.locator('.today-shortcut')).toHaveAttribute('href', '#/notes');
});

/** v1 dateISOLocal(): chores use the local day (G8, G13). */
function localDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Three definitions; the first logged twice today, the third yesterday, and a
 * one-time chore (definition already gone) today: 45 unpaid points = 20,25 zł at
 * v1's default chores rate.
 */
async function choresAccount(profile = {}) {
  const account = await createUser({ tag: 'chores', profile });
  const user = db.doc(`users/${account.uid}`);
  const defs = [
    ['vacuum', 'Odkurzanie', '🧹', 10],
    ['dishes', 'Zmywarka', '🍽️', 15],
    ['trash', 'Śmieci', '🗑️', 5],
  ];
  for (const [id, name, emoji, points] of defs) {
    await user.collection('choreDefs').doc(id).set({ name, emoji, desc: '', points, oneTime: false, order: defs.findIndex((d) => d[0] === id) });
  }
  const entries = [
    ['vacuum', 'Odkurzanie', '🧹', 10, 0],
    ['vacuum', 'Odkurzanie', '🧹', 10, 0],
    ['trash', 'Śmieci', '🗑️', 5, 1],
    ['window_once', 'Mycie okien', '🪟', 20, 0],
  ];
  for (const [choreId, choreName, choreEmoji, points, ago] of entries) {
    const dateISO = localDaysAgo(ago);
    await user.collection('chores').add({ choreId, choreName, choreEmoji, points, dateISO, monthKey: dateISO.slice(0, 7), createdAt: new Date() });
  }
  return account;
}

test('chores today: the chosen list marked when done today, and what is left to pay out', async ({ page }) => {
  const account = await choresAccount({ choresCard: { mode: 'chosen', ids: ['vacuum', 'dishes', 'trash', 'window_once'] } });
  const before = await snapshotAccount(account.uid);

  await openSignedIn(page, account, '#/today');
  const chores = page.getByRole('list', { name: 'Obowiązki dziś' }).getByRole('listitem');
  await expect(chores).toHaveCount(4);
  await expect(page.getByText('Twoja lista')).toBeVisible();
  await expect(page.getByTestId('chores-progress')).toHaveText('2 z 4 zrobione');
  // Done today, twice in the Chores screen: done once here, and not again.
  await expect(chores.nth(0)).toContainText('Odkurzanie');
  await expect(chores.nth(0)).toContainText('Zrobione dziś');
  await expect(chores.nth(0).getByRole('button')).toBeDisabled();
  await expect(chores.nth(1)).toContainText('Zmywarka');
  await expect(chores.nth(1)).toContainText('+15 pkt');
  await expect(chores.nth(1).getByRole('button')).toBeEnabled();
  // Done yesterday is not done today.
  await expect(chores.nth(2)).not.toContainText('Zrobione');
  // A chosen one-time chore logged today stays on the list after its definition is gone.
  await expect(chores.nth(3)).toContainText('Mycie okien');
  await expect(chores.nth(3)).toContainText('Zrobione dziś');
  expect(await text(page.getByTestId('chores-unpaid-money'))).toBe('20,25 zł');
  expect(await text(page.getByTestId('chores-unpaid-points'))).toBe('45 pkt');

  await page.waitForTimeout(500);
  expect(await snapshotAccount(account.uid)).toEqual(before);
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 shows the same amount to pay out', async ({ page, context }) => {
    const account = await choresAccount();
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="chores"]');
    await expect(page.locator('#chore-outstanding-pts')).toHaveText('45');
    await expect(page.locator('#chore-outstanding')).toHaveText('20,25 zł');
  });
});
