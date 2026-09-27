// Characterization tests: the REAL v1 app (app.html + ES modules) against the
// Firebase emulators. They pin down what v1 writes to Firestore today, so the
// v2 domain can be checked against the same numbers (docs/v2/GOLDEN.md).
// A failure here means v1's behaviour changed, not that the test is flaky.
const { test, expect } = require('@playwright/test');
const { db, serveCdnFromNpm, createUser, todayUtcKey, signInToApp } = require('../support/emulator');

test.beforeEach(async ({ context }) => {
  await serveCdnFromNpm(context);
});

/** Poll Firestore (admin) until `check` passes — v1 writes asynchronously after the click. */
async function eventually(check, timeout = 10000) {
  const until = Date.now() + timeout;
  let lastErr;
  while (Date.now() < until) {
    try { return await check(); } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw lastErr;
}

test('boots against the emulator and renders profile numbers on the dashboard', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const user = await createUser({
    tag: 'boot',
    profile: { points: { total: 120, earnedAllTime: 620, spentAllTime: 0 }, dailyLimit: 150 },
  });
  await db.doc(`users/${user.uid}/dailyLog/${todayUtcKey()}`).set({ pointsEarned: 30, gamingMinutes: 0 });

  await signInToApp(page, user);

  // XP_PER_LEVEL = 500 → 620 XP is level 2 with 120 XP into it.
  await expect(page.locator('#dash-level')).toHaveText('Poziom 2');
  await expect(page.locator('#dash-level-xp')).toHaveText('120 / 500 XP');
  await expect(page.locator('#dash-pts-num')).toHaveText('120');
  // Default general rate: 1 zł per 10 pts.
  await expect(page.locator('#dash-pln')).toHaveText('12,00 zł');
  await expect(page.locator('#dash-limit-text')).toHaveText('30 / 150 pkt');
  expect(errors).toEqual([]);
});

test('logging an activity is capped by the remaining daily limit', async ({ page }) => {
  const user = await createUser({
    tag: 'cap',
    profile: { points: { total: 120, earnedAllTime: 620, spentAllTime: 0 }, dailyLimit: 150 },
  });
  const dayKey = todayUtcKey();
  await db.doc(`users/${user.uid}/dailyLog/${dayKey}`).set({ pointsEarned: 130, gamingMinutes: 0 });

  await signInToApp(page, user);
  await page.click('#page-dashboard .action-row .btn-success');
  // 'learning' is seeded by the app itself with 40 pts/h.
  await page.selectOption('#act-type', 'learning');
  await page.fill('#act-minutes', '60');
  await page.click('#page-log-activity button');

  // 60 min × 40 pts/h = 40 pts, but only 150 − 130 = 20 remain today.
  await eventually(async () => {
    const profile = (await db.doc(`users/${user.uid}`).get()).data();
    expect(profile.points).toEqual({ total: 140, earnedAllTime: 640, spentAllTime: 0 });
  });
  const day = (await db.doc(`users/${user.uid}/dailyLog/${dayKey}`).get()).data();
  expect(day.pointsEarned).toBe(150);
  const acts = await db.collection(`users/${user.uid}/activities`).get();
  expect(acts.size).toBe(1);
  expect(acts.docs[0].data()).toMatchObject({ type: 'learning', duration: 60, points: 20, desc: '' });
});

test('an expense lowers the Money balance and charges LifeXP points', async ({ page }) => {
  const user = await createUser({
    tag: 'expense',
    profile: { points: { total: 120, earnedAllTime: 620, spentAllTime: 0 } },
  });
  await db.doc(`users/${user.uid}/money/balance`).set({ current: 50 });

  await signInToApp(page, user);
  await page.click('.sidebar .nav-item[data-page="money"]');
  await page.click('#page-money .action-row .btn-success');
  await page.fill('#mtx-amount', '5');
  // Categories are seeded on first Money load (kieszonkowe, gry, jedzenie, szkoła, inne).
  await page.selectOption('#mtx-category', 'jedzenie');
  await page.click('#mtx-save-btn');

  // Points cost = ceil(5 zł / 0.10 zł per pt) = 50, capped at the points the user has.
  await eventually(async () => {
    const balance = (await db.doc(`users/${user.uid}/money/balance`).get()).data();
    expect(balance.current).toBe(45);
    const profile = (await db.doc(`users/${user.uid}`).get()).data();
    expect(profile.points).toEqual({ total: 70, earnedAllTime: 620, spentAllTime: 50 });
  });
  const txs = await db.collection(`users/${user.uid}/moneyTransactions`).get();
  expect(txs.size).toBe(1);
  expect(txs.docs[0].data()).toMatchObject({ type: 'expense', amount: 5, category: 'jedzenie', source: 'manual', pointsCost: 50 });
});

test('settling chores archives the entries and pays them into Money as income', async ({ page }) => {
  const user = await createUser({ tag: 'settle' });
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dateISO = `${monthKey}-01`;
  for (const points of [10, 30]) {
    await db.collection(`users/${user.uid}/chores`).add({
      choreId: 'dishwasher', choreName: 'Opróżnienie zmywarki', choreEmoji: '', points, dateISO, monthKey, createdAt: new Date(),
    });
  }

  await signInToApp(page, user);
  await page.click('.sidebar .nav-item[data-page="chores"]');
  await expect(page.locator('#chore-outstanding-pts')).toHaveText('40');
  await page.click('#chore-settle-btn');
  await page.click('#confirm-modal-ok');

  // Default chores rate: 0.45 zł per pt → 40 pts = 18,00 zł.
  await eventually(async () => {
    const balance = (await db.doc(`users/${user.uid}/money/balance`).get()).data();
    expect(balance.current).toBe(18);
  });
  expect((await db.collection(`users/${user.uid}/chores`).get()).size).toBe(0);
  const payouts = await db.collection(`users/${user.uid}/chorePayouts`).get();
  expect(payouts.size).toBe(1);
  expect(payouts.docs[0].data()).toMatchObject({ points: 40, amountPln: 18, fromISO: dateISO, toISO: dateISO });
  const txs = await db.collection(`users/${user.uid}/moneyTransactions`).get();
  expect(txs.size).toBe(1);
  expect(txs.docs[0].data()).toMatchObject({ type: 'income', amount: 18, source: 'chore_payout' });
  const profile = (await db.doc(`users/${user.uid}`).get()).data();
  expect(profile.moneyIncomeAllTime).toBe(18);
});
