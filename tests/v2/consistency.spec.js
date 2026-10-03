// "Sprawdź spójność" (docs/v2/PLAN.md 5.5 point 4) on the Firebase emulators: the
// account's counters against what its history adds up to, read from the server,
// with not a single write; and an account v2 itself wrote to stays consistent.
const { Timestamp } = require('firebase-admin/firestore');
const { createUser, db } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

function utcDaysAgo(n) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

const noonUtc = (day) => Timestamp.fromDate(new Date(`${day}T12:00:00Z`));

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
 * Activities 30 + 20 two days ago and 40 yesterday (90 earned); an expense of 15 zł
 * for 15 points and a v1 shop purchase for 5 (20 spent); income 100 zł by hand and
 * 20 zł from a chore payout (with its payout record); 105 zł on the balance.
 */
async function seedAccount(tag, patch = {}) {
  const d2 = utcDaysAgo(2);
  const d1 = utcDaysAgo(1);
  const account = await createUser({
    tag,
    profile: { points: { total: 70, earnedAllTime: 90, spentAllTime: 20 }, moneyIncomeAllTime: 120, ...patch.profile },
  });
  const user = db.doc(`users/${account.uid}`);
  const activity = (type, points, day) => ({ type, duration: 60, points, desc: '', timestamp: noonUtc(day) });
  await user.collection('activities').add(activity('learning', 30, d2));
  await user.collection('activities').add(activity('reading', 20, d2));
  await user.collection('activities').add(activity('learning', 40, d1));
  await user.collection('dailyLog').doc(d2).set({ pointsEarned: patch.d2Log ?? 50, gamingMinutes: 0 });
  await user.collection('dailyLog').doc(d1).set({ pointsEarned: 40, gamingMinutes: 0 });
  const tx = (type, amount, source, pointsCost, date) => ({
    type,
    amount,
    category: 'inne',
    note: '',
    date,
    source,
    pointsCost,
    createdAt: noonUtc(date),
  });
  await user.collection('moneyTransactions').add(tx('income', 100, 'manual', 0, d2));
  await user.collection('moneyTransactions').add(tx('income', 20, 'chore_payout', 0, d2));
  await user.collection('moneyTransactions').add(tx('expense', 15, 'manual', 15, d1));
  await user.collection('purchases').add({ description: 'Gra', amount: 0.5, pointsCost: 5, timestamp: noonUtc(d1) });
  for (const amountPln of patch.payouts ?? [20]) {
    await user.collection('chorePayouts').add({ points: 40, amountPln, fromISO: d2, toISO: d2, createdAt: noonUtc(d2) });
  }
  for (const loan of patch.loans ?? []) await user.collection('moneyLoans').add(loan);
  await user.collection('money').doc('balance').set({ current: patch.balance ?? 105 });
  return account;
}

async function runCheck(page) {
  await page.getByRole('button', { name: 'Sprawdź spójność' }).click();
  return page.getByRole('list', { name: 'Wynik sprawdzenia' });
}

test('an account whose counters match its history: every check matches, nothing is written', async ({ page }) => {
  const account = await seedAccount('consistency-ok');
  const before = await snapshotAccount(account.uid);
  await openSignedIn(page, account, '#/settings');
  await page.getByRole('link', { name: /Spójność danych/ }).click();
  await expect(page.getByRole('heading', { name: 'Spójność danych' })).toBeVisible();

  const checks = await runCheck(page);
  await expect(page.getByRole('status').filter({ hasText: 'Wszystko się zgadza.' })).toBeVisible();
  await expect(checks.getByRole('listitem')).toHaveCount(6);
  await expect(checks.getByText('Zgadza się', { exact: true })).toHaveCount(6);
  const earned = checks.getByRole('listitem').filter({ hasText: 'Punkty zdobyte' });
  await expect(earned).toContainText('Suma aktywności');
  await expect(earned).toContainText('90 pkt');
  await expect(checks.getByRole('listitem').filter({ hasText: 'Saldo' })).toContainText('105,00 zł');
  await expect(page.getByRole('list', { name: 'Dni, które się nie zgadzają' })).toHaveCount(0);
  expect(await snapshotAccount(account.uid)).toEqual(before);
});

test('differences: each counter with its difference, the days, the balance from goals and loans, old payouts', async ({
  page,
}) => {
  const account = await seedAccount('consistency-off', {
    // 10 points more than the activities; total still 70, so "to spend" is off too.
    profile: {
      points: { total: 70, earnedAllTime: 100, spentAllTime: 20 },
      moneyIncomeAllTime: 120,
      goals: [{ id: 'g1', name: 'Rower', type: 'money', amount: 500, saved: 30, celebrated: false }],
    },
    d2Log: 45,
    // 20 zł lent, 5 back: 15 zł still out of the balance.
    loans: [{ person: 'Ola', direction: 'lent', amount: 20, repaidAmount: 5, note: '', date: utcDaysAgo(1), createdAt: noonUtc(utcDaysAgo(1)) }],
    // A 12 zł payout from before payouts went into the history.
    payouts: [20, 12],
    balance: 105 - 30 - 15 + 12,
  });
  const before = await snapshotAccount(account.uid);
  await openSignedIn(page, account, '#/settings/consistency');

  const checks = await runCheck(page);
  await expect(page.getByRole('status').filter({ hasText: '4 rzeczy się nie zgadzają.' })).toBeVisible();
  const row = (title) => checks.getByRole('listitem').filter({ hasText: title });
  await expect(row('Punkty zdobyte')).toContainText('Nie zgadza się');
  await expect(row('Punkty zdobyte')).toContainText('+10 pkt');
  await expect(row('Punkty wydane')).toContainText('Zgadza się');
  await expect(row('Punkty do wydania')).toContainText('−10 pkt');
  await expect(row('Punkty dzień po dniu')).toContainText('1 dzień się nie zgadza');
  await expect(row('Przychody łącznie')).toContainText('Zgadza się');
  await expect(row('Saldo')).toContainText('Z historii');
  await expect(row('Saldo')).toContainText('60,00 zł');
  await expect(row('Saldo')).toContainText('+12,00 zł');

  const days = page.getByRole('list', { name: 'Dni, które się nie zgadzają' });
  await expect(days.getByRole('listitem')).toHaveCount(1);
  await expect(days).toContainText('Aktywności 50 pkt · zapis dnia 45 pkt');
  await expect(days).toContainText('−5 pkt');

  const balance = page.getByRole('list', { name: 'Skąd saldo z historii' });
  await expect(balance.getByRole('listitem').filter({ hasText: 'Przychody minus wydatki' })).toContainText('105,00 zł');
  await expect(balance.getByRole('listitem').filter({ hasText: 'Odłożone na cele' })).toContainText('30,00 zł');
  await expect(balance.getByRole('listitem').filter({ hasText: 'Nieoddane pożyczki' })).toContainText('15,00 zł');
  await expect(page.getByText('Wypłaty obowiązków bez wpisu w historii: 12,00 zł.', { exact: false })).toBeVisible();
  expect(await snapshotAccount(account.uid)).toEqual(before);
});

test('what v2 writes keeps the account consistent: an activity logged on Today', async ({ page }) => {
  const account = await seedAccount('consistency-v2-writes');
  await openSignedIn(page, account, '#/today');
  await page.getByRole('button', { name: 'Zapisz aktywność' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowa aktywność' });
  await sheet.getByLabel('Aktywność', { exact: true }).selectOption({ label: 'Nauka (JS, Unity, C#) · 40 pkt/h' });
  await sheet.getByRole('button', { name: '30 min' }).click();
  await sheet.getByRole('button', { name: 'Zapisz aktywność' }).click();
  await expect(page.getByText('+20 pkt za: Nauka (JS, Unity, C#)')).toBeVisible();
  // The check reads the server: wait until the entry is there.
  await expect.poll(async () => (await db.collection(`users/${account.uid}/activities`).get()).size).toBe(4);

  await page.evaluate(() => (location.hash = '#/settings/consistency'));
  await runCheck(page);
  await expect(page.getByRole('status').filter({ hasText: 'Wszystko się zgadza.' })).toBeVisible();
});
