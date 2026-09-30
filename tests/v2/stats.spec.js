// Statistics and History (docs/v2/PLAN.md 9, stage 2c) on the Firebase emulators:
// the same numbers as v1's stats page and dashboard on the same account, the
// history a page at a time, and not a single write from v2.
const { Timestamp } = require('firebase-admin/firestore');
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

function utcDaysAgo(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

const minutesAgo = (n) => Timestamp.fromDate(new Date(Date.now() - n * 60 * 1000));

/** Every document of the account with its last update time: equal before and after = nothing written. */
async function snapshotAccount(uid) {
  const user = db.doc(`users/${uid}`);
  const state = { [user.path]: (await user.get()).updateTime.toMillis() };
  for (const collection of await user.listCollections()) {
    for (const d of (await collection.get()).docs) state[d.ref.path] = d.updateTime.toMillis();
  }
  return state;
}

/**
 * This week (today − 6 … today): 60 points two days ago with 90 min of gaming and
 * 60 points today with 30 min → 120 points, 2 h. Last week: 50 points and 30 min
 * nine days ago. Activities: "Nauka" three times (40 + 40 + 40), one type without
 * a definition. At v1's default rate (1 zł / 10 pkt) the week is worth 12,00 zł.
 */
async function statsAccount() {
  const account = await createUser({
    tag: 'stats',
    profile: { name: 'Ala Nowak', points: { total: 570, earnedAllTime: 620, spentAllTime: 50 } },
  });
  const user = db.doc(`users/${account.uid}`);
  const logs = { 0: [60, 30], 2: [60, 90], 9: [50, 30] };
  for (const [ago, [pointsEarned, gamingMinutes]] of Object.entries(logs)) {
    await user.collection('dailyLog').doc(utcDaysAgo(Number(ago))).set({ pointsEarned, gamingMinutes });
  }
  await user
    .collection('activityDefs')
    .doc('learning')
    .set({ name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 });
  const activities = [
    ['learning', 40, 10],
    ['custom_type', 15, 20],
    ['learning', 40, 30],
    ['learning', 40, 40],
  ];
  for (const [type, points, ago] of activities) {
    await user.collection('activities').add({ type, duration: 60, points, desc: '', timestamp: minutesAgo(ago) });
  }
  return account;
}

const text = (locator) => locator.evaluate((el) => el.textContent.replace(/\s+/g, ' ').trim());
const metric = (page, label) => page.locator('.ui-metric', { hasText: label }).locator('.ui-metric__value');

test('Statistics shows v1 numbers, charts, top activities and facts, and writes nothing', async ({ page }) => {
  const account = await statsAccount();
  const before = await snapshotAccount(account.uid);

  await openSignedIn(page, account, '#/stats');
  await expect(page.getByRole('link', { name: 'Przegląd' })).toHaveAttribute('aria-current', 'page');
  await expect(metric(page, 'Łącznie zarobione')).toHaveText('620');
  await expect(metric(page, 'Łącznie wydane')).toHaveText('50');
  await expect(metric(page, 'Granie w 7 dni')).toHaveText('2 h');

  // One bar per day, oldest first; every value is in the text, not only in the bar.
  const points = page.getByRole('list', { name: 'Punkty — ostatnie 7 dni' }).getByRole('listitem');
  await expect(points).toHaveCount(7);
  await expect(points.nth(6)).toContainText(': 60 pkt');
  await expect(points.nth(4)).toContainText(': 60 pkt');
  await expect(points.nth(5)).toContainText(': 0 pkt');
  const gaming = page.getByRole('list', { name: 'Granie — ostatnie 7 dni (minuty)' }).getByRole('listitem');
  await expect(gaming.nth(4)).toContainText(': 1 h 30 min');
  // Direct labels only on the highest bar and today's.
  await expect(page.locator('.ui-bars').first().locator('.ui-bars__value')).toHaveText(['60', '60']);

  const top = page.getByRole('list', { name: 'Najczęstsze aktywności' }).getByRole('listitem');
  await expect(top).toHaveCount(2);
  await expect(top.nth(0)).toContainText('Nauka');
  await expect(top.nth(0)).toContainText('3×');
  await expect(top.nth(0)).toContainText('+120 pkt');
  // A type without a definition shows its raw id, as in v1.
  await expect(top.nth(1)).toContainText('custom_type');

  const facts = page.getByRole('list', { name: 'Ciekawostki' }).getByRole('listitem');
  await expect(facts).toHaveCount(5);
  await expect(facts.nth(0)).toContainText('Nauka');
  await expect(facts.nth(0)).toContainText('3×');
  await expect(facts.nth(1)).toContainText('70 pkt więcej');
  await expect(facts.nth(1)).toContainText('(120 vs 50 pkt)');
  expect(await text(facts.nth(2))).toContain('12,00 zł');
  await expect(facts.nth(3)).toContainText('1 h 30 min więcej');
  // Two days with 60 points: the older one is the best, as in v1.
  const bestDay = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${utcDaysAgo(2)}T00:00:00Z`),
  );
  await expect(facts.nth(4)).toContainText(`${bestDay}, 60 pkt`);

  await page.waitForTimeout(500);
  expect(await snapshotAccount(account.uid)).toEqual(before);
});

test('a bar shows its day and value on hover', async ({ page }) => {
  const account = await statsAccount();
  await openSignedIn(page, account, '#/stats');
  const today = page.getByRole('list', { name: 'Punkty — ostatnie 7 dni' }).getByRole('listitem').last();
  const tip = today.locator('.ui-bars__tip');
  await expect(tip).toHaveCSS('opacity', '0');
  await today.hover();
  await expect(tip).toHaveCSS('opacity', '1');
  await expect(tip).toContainText('60 pkt');
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 shows the same totals, top activity and facts', async ({ page, context }) => {
    const account = await statsAccount();
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    // The dashboard carries v1's top activities and facts.
    await expect(page.locator('#top-activities-list')).toContainText('Nauka');
    await expect(page.locator('#top-activities-list')).toContainText('3×');
    await expect(page.locator('#top-activities-list')).toContainText('+120');
    const facts = page.locator('#facts-list > div');
    await expect(facts).toHaveCount(5);
    await expect(facts.nth(1)).toContainText('70 pkt więcej');
    await expect(facts.nth(1)).toContainText('(120 vs 50 pkt)');
    await expect(facts.nth(2)).toContainText('12.00 zł');
    await expect(facts.nth(3)).toContainText('1h 30m więcej');
    await expect(facts.nth(4)).toContainText('— 60 pkt');

    await page.click('.sidebar .nav-item[data-page="stats"]');
    await expect(page.locator('#stats-earned')).toHaveText('620');
    await expect(page.locator('#stats-spent')).toHaveText('50');
    await expect(page.locator('#stats-gaming')).toHaveText('2h 0m');
  });

  test('v1 counts the same history', async ({ page, context }) => {
    const account = await historyAccount();
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="history"]');
    await expect(page.locator('#history-page-info')).toHaveText('Strona 1 / 2 · 20 aktywności');
    await expect(page.locator('#history-list .activity-item')).toHaveCount(15);
  });
});

/** 20 activities a minute apart; "wpis 1" is the newest. */
async function historyAccount() {
  const account = await createUser({ tag: 'history' });
  const activities = db.collection(`users/${account.uid}/activities`);
  for (let i = 1; i <= 20; i++) {
    await activities.add({ type: 'custom_type', duration: 15, points: i, desc: `wpis ${i}`, timestamp: minutesAgo(i) });
  }
  return account;
}

test('History: newest first, 15 at a time, the rest on request, and writes nothing', async ({ page }) => {
  const account = await historyAccount();
  const before = await snapshotAccount(account.uid);

  await openSignedIn(page, account, '#/stats/history');
  await expect(page.getByRole('link', { name: 'Historia' })).toHaveAttribute('aria-current', 'page');
  const rows = page.getByRole('list', { name: 'Pełna historia aktywności' }).getByRole('listitem');
  await expect(rows).toHaveCount(15);
  await expect(rows.nth(0)).toContainText('wpis 1');
  await expect(rows.nth(14)).toContainText('wpis 15');
  await expect(page.getByText('Pokazano 15 z 20 aktywności')).toBeVisible();

  await page.getByRole('button', { name: 'Pokaż więcej' }).click();
  await expect(rows).toHaveCount(20);
  await expect(rows.nth(19)).toContainText('wpis 20');
  await expect(page.getByText('Pokazano 20 z 20 aktywności')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pokaż więcej' })).toHaveCount(0);

  await page.waitForTimeout(500);
  expect(await snapshotAccount(account.uid)).toEqual(before);
});

test('a fresh account: zeros, no facts, empty top list and history', async ({ page, account }) => {
  await openSignedIn(page, account, '#/stats');
  await expect(metric(page, 'Łącznie zarobione')).toHaveText('0');
  await expect(metric(page, 'Granie w 7 dni')).toHaveText('0 min');
  await expect(page.getByText('Brak danych. Zaloguj kilka aktywności!')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ciekawostki' })).toHaveCount(0);
  // Empty days draw no bars and no labels.
  await expect(page.locator('.ui-bars__bar')).toHaveCount(0);

  await page.getByRole('link', { name: 'Historia' }).click();
  await expect(page).toHaveURL(/#\/stats\/history$/);
  await expect(page.getByText('Brak aktywności. Zacznij zarabiać punkty!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pokaż więcej' })).toHaveCount(0);
});
