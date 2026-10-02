// Logging and deleting activities (docs/v2/PLAN.md 9, stage 3e; GOLDEN G1, G11) on the
// Firebase emulators. Parity (PLAN.md 8.3): the same activity logged in v1 and in
// v2 leaves the same entry, day log, points and definitions; deleting one in either
// takes back the same points; v1 shows an activity logged in v2.
const { Timestamp } = require('firebase-admin/firestore');
const { createUser, db, serveCdnFromNpm, signInToApp, todayUtcKey } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** G1.2's account: 130 of the 150 points of today already earned. */
async function cappedAccount(tag, { earnedToday = 130, points = { total: 120, earnedAllTime: 620, spentAllTime: 0 } } = {}) {
  const account = await createUser({ tag, profile: { points, dailyLimit: 150 } });
  await db.doc(`users/${account.uid}/dailyLog/${todayUtcKey()}`).set({ pointsEarned: earnedToday, gamingMinutes: 0 });
  return account;
}

/** What an activity changes, once it reached the server (timestamps and ids aside). */
async function activityState(uid) {
  const user = db.doc(`users/${uid}`);
  const activities = (await user.collection('activities').get()).docs.map((d) => {
    const { timestamp, ...rest } = d.data();
    expect(timestamp).toBeInstanceOf(Timestamp);
    return rest;
  });
  const defs = Object.fromEntries((await user.collection('activityDefs').get()).docs.map((d) => [d.id, d.data()]));
  return {
    points: (await user.get()).data().points,
    day: (await user.collection('dailyLog').doc(todayUtcKey()).get()).data(),
    activities,
    defs,
  };
}

const LEARNING = 'Nauka (JS, Unity, C#) · 40 pkt/h';

/** Opens the form from Today's day card. */
async function openForm(page) {
  await page.getByRole('button', { name: 'Zapisz aktywność' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowa aktywność' });
  // The definitions are seeded on first use, as v1 does.
  await expect(sheet.getByRole('option', { name: LEARNING })).toBeAttached();
  return sheet;
}

const save = (sheet) => sheet.getByRole('button', { name: 'Zapisz aktywność' }).click();

test('G1.2: v2 credits what is left of the daily limit and writes v1\'s entry', async ({ page }) => {
  const account = await cappedAccount('activity-cap-v2');
  await openSignedIn(page, account, '#/today');
  const sheet = await openForm(page);
  await sheet.getByLabel('Aktywność', { exact: true }).selectOption({ label: LEARNING });
  await sheet.getByRole('button', { name: '60 min' }).click();
  await expect(sheet.getByLabel('Czas', { exact: true })).toHaveValue('60');
  await expect(sheet.getByText('Dostaniesz 20 z 40 pkt: tyle zostało z dziennego limitu 150 pkt.')).toBeVisible();
  await save(sheet);

  await expect(page.getByText('+20 pkt za: Nauka (JS, Unity, C#)')).toBeVisible();
  await expect(sheet).toBeHidden();
  const state = await activityState(account.uid);
  expect(state.points).toEqual({ total: 140, earnedAllTime: 640, spentAllTime: 0 });
  expect(state.day).toEqual({ pointsEarned: 150, gamingMinutes: 0 });
  expect(state.activities).toEqual([{ type: 'learning', duration: 60, points: 20, desc: '' }]);
  expect(Object.keys(state.defs).sort()).toEqual(['exercise', 'learning', 'project', 'reading', 'school']);
  await expect(page.getByTestId('today-points')).toHaveText('150');
  await expect(page.getByRole('list', { name: 'Ostatnie aktywności' })).toContainText('+20 pkt');
});

test('G1.7, G1.8: no type, under 5 minutes or a full limit write nothing', async ({ page }) => {
  const account = await cappedAccount('activity-refused', { earnedToday: 150 });
  await openSignedIn(page, account, '#/today');
  const sheet = await openForm(page);
  await save(sheet);
  await expect(sheet.getByText('Wybierz rodzaj aktywności.')).toBeVisible();
  await sheet.getByLabel('Aktywność', { exact: true }).selectOption({ label: LEARNING });
  await sheet.getByLabel('Czas', { exact: true }).fill('4');
  await save(sheet);
  await expect(sheet.getByText('Co najmniej 5 minut.')).toBeVisible();

  await sheet.getByLabel('Czas', { exact: true }).fill('60');
  await expect(sheet.getByText('Dzienny limit 150 pkt jest już osiągnięty. Ta aktywność nie da dziś punktów.')).toBeVisible();
  await save(sheet);
  await expect(sheet.getByRole('alert')).toHaveText('Dzienny limit punktów jest już osiągnięty. Nic nie zapisano.');
  const state = await activityState(account.uid);
  expect(state.activities).toEqual([]);
  expect(state.day.pointsEarned).toBe(150);
  expect(state.points.total).toBe(120);
});

test('"+" → Aktywność opens the form on Today; a new level is announced', async ({ page }) => {
  const account = await cappedAccount('activity-level', {
    earnedToday: 0,
    points: { total: 10, earnedAllTime: 490, spentAllTime: 0 },
  });
  await openSignedIn(page, account, '#/stats');
  await page.locator('.tabbar').getByRole('button', { name: 'Dodaj' }).click();
  await page.getByRole('dialog', { name: 'Dodaj' }).getByRole('button', { name: 'Aktywność' }).click();
  await expect(page).toHaveURL(/#\/today$/);
  const sheet = page.getByRole('dialog', { name: 'Nowa aktywność' });
  await expect(sheet.getByRole('option', { name: LEARNING })).toBeAttached();
  await sheet.getByLabel('Aktywność', { exact: true }).selectOption({ label: LEARNING });
  await sheet.getByRole('button', { name: '45 min' }).click();
  await expect(sheet.getByText('Dostaniesz 30 pkt.')).toBeVisible();
  await sheet.getByLabel('Opis (opcjonalnie)').fill('  Rozdział 3 ');
  await save(sheet);

  await expect(page.getByText('+30 pkt. Nowy poziom: 2, Uczeń!')).toBeVisible();
  expect((await activityState(account.uid)).activities).toEqual([
    { type: 'learning', duration: 45, points: 30, desc: 'Rozdział 3' },
  ]);
  await expect(page.getByTestId('level')).toHaveText('Poziom 2');
});

/** One 40-point activity logged today, as v1 writes it. */
async function deleteAccount(tag) {
  const account = await createUser({ tag, profile: { points: { total: 300, earnedAllTime: 900, spentAllTime: 15 } } });
  const user = db.doc(`users/${account.uid}`);
  await user.collection('activityDefs').doc('learning').set({ name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 });
  await user.collection('dailyLog').doc(todayUtcKey()).set({ pointsEarned: 100, gamingMinutes: 20 });
  await user.collection('activities').add({ type: 'learning', duration: 60, points: 40, desc: '', timestamp: new Date() });
  return account;
}

const afterDelete = {
  points: { total: 260, earnedAllTime: 860, spentAllTime: 15 },
  day: { pointsEarned: 60, gamingMinutes: 20 },
  activities: [],
};

test('G11: deleting from the history takes its points back', async ({ page }) => {
  const account = await deleteAccount('activity-delete-v2');
  await openSignedIn(page, account, '#/stats/history');
  await expect(page.getByText('Pokazano 1 z 1 aktywności')).toBeVisible();
  await page.getByRole('button', { name: 'Usuń: Nauka' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć aktywność „Nauka”?' });
  await expect(dialog).toContainText('Odejmiemy 40 pkt z Twoich punktów i z dnia, w którym ją zapisano.');
  await dialog.getByRole('button', { name: 'Usuń' }).click();

  await expect(page.getByText('Usunięto aktywność. −40 pkt')).toBeVisible();
  await expect(page.getByText('Brak aktywności. Zacznij zarabiać punkty!')).toBeVisible();
  await expect.poll(async () => {
    const { defs, ...rest } = await activityState(account.uid);
    return rest;
  }).toEqual(afterDelete);
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity G1.2: v1 writes the same entry, day and points', async ({ page, context }) => {
    const account = await cappedAccount('activity-cap-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('#page-dashboard .action-row .btn-success');
    await page.selectOption('#act-type', 'learning');
    await page.fill('#act-minutes', '60');
    await page.click('#page-log-activity button');
    // v1 writes the entry, the day and the points one after another: wait for all three.
    await expect
      .poll(async () => {
        const { defs, ...rest } = await activityState(account.uid);
        return rest;
      })
      .toEqual({
        points: { total: 140, earnedAllTime: 640, spentAllTime: 0 },
        day: { pointsEarned: 150, gamingMinutes: 0 },
        activities: [{ type: 'learning', duration: 60, points: 20, desc: '' }],
      });
    const state = await activityState(account.uid);
    // v2 seeds the same definitions.
    expect(Object.keys(state.defs).sort()).toEqual(['exercise', 'learning', 'project', 'reading', 'school']);
    expect(state.defs.learning).toEqual({ name: 'Nauka (JS, Unity, C#)', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 });
  });

  test('parity G11: v1 deletes to the same state', async ({ page, context }) => {
    const account = await deleteAccount('activity-delete-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('#recent-list .activity-del');
    await page.click('#confirm-modal-ok');
    await expect
      .poll(async () => {
        const { defs, ...rest } = await activityState(account.uid);
        return rest;
      })
      .toEqual(afterDelete);
  });

  test('v1 shows an activity logged in v2', async ({ page, context }) => {
    const account = await cappedAccount('activity-v2-to-v1', { earnedToday: 0 });
    await openSignedIn(page, account, '#/today');
    const sheet = await openForm(page);
    await sheet.getByLabel('Aktywność', { exact: true }).selectOption({ label: LEARNING });
    await sheet.getByRole('button', { name: '30 min' }).click();
    await sheet.getByLabel('Opis (opcjonalnie)').fill('Z v2');
    await save(sheet);
    await expect.poll(async () => (await activityState(account.uid)).activities.length).toBe(1);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await expect(page.locator('#recent-list')).toContainText('Nauka (JS, Unity, C#)');
    await expect(page.locator('#recent-list')).toContainText('Z v2');
    await expect(page.locator('#recent-list')).toContainText('+20 pkt');
  });
});
