// Offline drafts (docs/v2/PLAN.md 9, stage 3f; v1 offline.js) on the Firebase
// emulators. v1 and v2 share the queue in localStorage (same origin, same key, same
// format): drafts made in v1 are confirmed in v2 (the stage's definition of done),
// and confirming the same drafts in either app leaves the same account.
const { Timestamp } = require('firebase-admin/firestore');
const { createUser, db, serveCdnFromNpm, signInToApp, todayUtcKey } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const QUEUE_KEY = 'lifexp-offline-queue';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One hour ago: the entries keep the time the drafts were made. */
const madeAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

/** Three drafts as v1 queueOfflineDraft() writes them. */
function v1Drafts() {
  return [
    {
      id: 'a1',
      type: 'activity',
      summary: 'Nauka — 45 min (~30 pkt)',
      payload: { type: 'learning', minutes: 45, desc: 'offline', ptsPerHour: 40, dateStr: todayUtcKey() },
      createdAtLocal: madeAt,
    },
    {
      id: 'c1',
      type: 'chore',
      summary: 'Opróżnienie zmywarki (+15 pkt)',
      payload: { choreId: 'dishwasher', choreName: 'Opróżnienie zmywarki', choreEmoji: '🍽️', points: 15, oneTime: false, dateISO: localToday() },
      createdAtLocal: madeAt,
    },
    {
      id: 'm1',
      type: 'money_tx',
      summary: 'Wydatek 12,50 zł — jedzenie',
      payload: { txType: 'expense', amount: 12.5, category: 'jedzenie', note: 'bułki', date: todayUtcKey() },
      createdAtLocal: madeAt,
    },
  ];
}

/** The queue goes into localStorage once, before the app's first page loads. */
function seedQueue(page, queue) {
  return page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('queue-seeded')) return;
      sessionStorage.setItem('queue-seeded', '1');
      localStorage.setItem(key, value);
    },
    [QUEUE_KEY, JSON.stringify(queue)],
  );
}

/** 300 points, 50 zł in Money with one category, v1's "learning" type. */
async function draftsAccount(tag) {
  const account = await createUser({
    tag,
    profile: { points: { total: 300, earnedAllTime: 300, spentAllTime: 0 }, achievements: ['first_activity'] },
  });
  const user = db.doc(`users/${account.uid}`);
  await user.collection('money').doc('balance').set({ current: 50 });
  await user.collection('money').doc('settings').set({ monthlyLimit: 200, currency: 'PLN' });
  await user.collection('moneyCategories').doc('food').set({ name: 'jedzenie', color: '#4ecca3' });
  await user.collection('activityDefs').doc('learning').set({ name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 });
  return account;
}

/** What the drafts wrote, with each entry's time checked against the draft's. */
async function accountState(uid) {
  const user = db.doc(`users/${uid}`);
  const strip = (field) => (d) => {
    const { [field]: at, ...rest } = d.data();
    expect(at).toBeInstanceOf(Timestamp);
    expect(at.toDate().toISOString()).toBe(madeAt);
    return rest;
  };
  return {
    points: (await user.get()).data().points,
    day: (await user.collection('dailyLog').doc(todayUtcKey()).get()).data(),
    activities: (await user.collection('activities').get()).docs.map(strip('timestamp')),
    chores: (await user.collection('chores').get()).docs.map(strip('createdAt')),
    money: (await user.collection('moneyTransactions').get()).docs.map(strip('createdAt')),
    balance: (await user.collection('money').doc('balance').get()).data(),
    categories: (await user.collection('moneyCategories').get()).size,
  };
}

const confirmed = {
  points: { total: 205, earnedAllTime: 330, spentAllTime: 125 },
  day: { pointsEarned: 30, gamingMinutes: 0 },
  activities: [{ type: 'learning', duration: 45, points: 30, desc: 'offline' }],
  chores: [
    {
      choreId: 'dishwasher',
      choreName: 'Opróżnienie zmywarki',
      choreEmoji: '🍽️',
      points: 15,
      dateISO: localToday(),
      monthKey: localToday().slice(0, 7),
    },
  ],
  money: [{ type: 'expense', amount: 12.5, category: 'jedzenie', note: 'bułki', date: todayUtcKey(), source: 'manual', pointsCost: 125 }],
  balance: { current: 37.5 },
  categories: 1,
};

const queueIn = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), QUEUE_KEY);

test("v1's drafts confirmed in v2: written as v1 writes them, at the drafts' time", async ({ page }) => {
  const account = await draftsAccount('drafts-v2');
  await seedQueue(page, v1Drafts());
  await openSignedIn(page, account, '#/today');
  const sheet = page.getByRole('dialog', { name: 'Szkice zrobione offline' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('listitem')).toHaveCount(3);

  for (const summary of ['Nauka — 45 min (~30 pkt)', 'Opróżnienie zmywarki (+15 pkt)', 'Wydatek 12,50 zł — jedzenie']) {
    await sheet.getByRole('button', { name: `Dodaj: ${summary}` }).click();
    await expect(sheet.getByText(summary)).toHaveCount(0);
  }
  await expect(sheet.getByText('Wszystkie szkice przetworzone.')).toBeVisible();
  expect(await queueIn(page)).toEqual([]);
  await expect.poll(() => accountState(account.uid)).toEqual(confirmed);
});

test('a gaming draft can only be discarded; one v2 cannot read stays for v1; Today reminds', async ({ page }) => {
  const account = await draftsAccount('drafts-other');
  const unknown = { id: 'x1', type: 'teleport', summary: 'Coś z przyszłości', payload: { to: 'Mars' }, createdAtLocal: madeAt };
  const gaming = {
    id: 'g1',
    type: 'gaming',
    summary: 'Minecraft — 30 min',
    payload: { game: 'Minecraft', minutes: 30, date: todayUtcKey() },
    createdAtLocal: madeAt,
  };
  await seedQueue(page, [gaming, unknown]);
  await openSignedIn(page, account, '#/today');
  const sheet = page.getByRole('dialog', { name: 'Szkice zrobione offline' });
  const items = sheet.getByRole('listitem');
  await expect(items.nth(0)).toContainText('Sesję grania dodasz w obecnej wersji LifeXP');
  await expect(items.nth(0).getByRole('button', { name: /Dodaj/ })).toHaveCount(0);
  await expect(items.nth(1)).toContainText('Ten szkic otworzysz w obecnej wersji LifeXP');
  await expect(items.nth(1).getByRole('button')).toHaveCount(0);

  await sheet.getByRole('button', { name: 'Odrzuć: Minecraft — 30 min' }).click();
  await expect(page.getByText('Szkic odrzucony.')).toBeVisible();
  // Every other entry is written back exactly as it was.
  expect(await queueIn(page)).toEqual([unknown]);

  await sheet.getByRole('button', { name: 'Zamknij' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Masz 1 szkic do zatwierdzenia')).toBeVisible();
  await page.getByRole('button', { name: 'Przejrzyj' }).click();
  await expect(sheet).toBeVisible();
});

test('offline in v2: an activity and an expense wait as v1 drafts, confirmed once back online', async ({ page, context }) => {
  const account = await draftsAccount('drafts-offline-v2');
  // Both screens are opened online first: their code is loaded, their data cached.
  await openSignedIn(page, account, '#/money');
  await expect(page.getByTestId('money-balance')).toHaveText('50,00 zł');
  await page.locator('.tabbar').getByRole('link', { name: 'Dziś' }).click();
  await expect(page.getByTestId('today-points')).toBeVisible();
  // The activity types have arrived from the server.
  await page.getByRole('button', { name: 'Zapisz aktywność' }).click();
  await expect(page.getByRole('dialog', { name: 'Nowa aktywność' }).getByRole('option', { name: 'Nauka · 40 pkt/h' })).toBeAttached();
  await page.getByRole('dialog', { name: 'Nowa aktywność' }).getByRole('button', { name: 'Zamknij' }).click();
  await expect(page.getByRole('dialog', { name: 'Nowa aktywność' })).toBeHidden();

  await context.setOffline(true);
  await expect(page.getByText('Jesteś offline: nowe wpisy zapiszą się jako szkice do zatwierdzenia.')).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz aktywność' }).click();
  const activity = page.getByRole('dialog', { name: 'Nowa aktywność' });
  await activity.getByLabel('Aktywność', { exact: true }).selectOption({ label: 'Nauka · 40 pkt/h' });
  await activity.getByRole('button', { name: '45 min' }).click();
  await activity.getByRole('button', { name: 'Zapisz aktywność' }).click();
  await expect(page.getByText('Brak internetu: zapisano jako szkic. Zatwierdzisz go po powrocie online.')).toBeVisible();
  await expect(activity).toBeHidden();
  await expect(page.getByText('Masz 1 szkic do zatwierdzenia')).toBeVisible();

  await page.locator('.tabbar').getByRole('link', { name: 'Pieniądze' }).click();
  await page.getByRole('button', { name: 'Dodaj transakcję' }).click();
  const tx = page.getByRole('dialog', { name: 'Nowa transakcja' });
  await tx.getByRole('radio', { name: 'Wydatek' }).check();
  await tx.getByLabel('Kwota').fill('12,50');
  await tx.getByLabel('Kategoria').selectOption({ label: 'jedzenie' });
  await tx.getByLabel('Notatka (opcjonalnie)').fill('bułki');
  await tx.getByRole('button', { name: 'Zapisz transakcję' }).click();
  await expect(tx).toBeHidden();

  // In the queue in v1's format, and nothing on the account yet.
  const queue = await queueIn(page);
  expect(queue.map(({ type, payload }) => ({ type, payload }))).toEqual([
    { type: 'activity', payload: { type: 'learning', minutes: 45, desc: '', ptsPerHour: 40, dateStr: todayUtcKey() } },
    { type: 'money_tx', payload: { txType: 'expense', amount: 12.5, category: 'jedzenie', note: 'bułki', date: todayUtcKey() } },
  ]);
  // formatMoney puts a no-break space before the currency.
  expect(queue.map((d) => d.summary)).toEqual(['Aktywność: Nauka — 45 min (~30 pkt)', 'Wydatek: 12,50\u00a0zł — jedzenie']);
  expect((await db.collection(`users/${account.uid}/activities`).get()).size).toBe(0);

  // Back online: the review opens by itself.
  await context.setOffline(false);
  const review = page.getByRole('dialog', { name: 'Szkice zrobione offline' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Dodaj: Aktywność: Nauka — 45 min (~30 pkt)' }).click();
  await review.getByRole('button', { name: 'Dodaj: Wydatek: 12,50\u00a0zł — jedzenie' }).click();
  await expect(review.getByText('Wszystkie szkice przetworzone.')).toBeVisible();
  await expect
    .poll(async () => (await db.doc(`users/${account.uid}`).get()).data().points)
    .toEqual({ total: 205, earnedAllTime: 330, spentAllTime: 125 });
  await expect(page.getByText(/Jesteś offline/)).toHaveCount(0);
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity: v1 confirms the same drafts to the same account', async ({ page, context }) => {
    const account = await draftsAccount('drafts-v1');
    await serveCdnFromNpm(context);
    await seedQueue(page, v1Drafts());
    await signInToApp(page, account);
    const add = page.locator('#offline-review-list .btn-success');
    await expect(add).toHaveCount(3);
    for (let left = 3; left > 0; left -= 1) {
      await add.first().click();
      await expect(add).toHaveCount(left - 1);
    }
    await expect.poll(() => accountState(account.uid)).toEqual(confirmed);
  });

  test('a draft made in v1 with no connection is confirmed in v2', async ({ page, context }) => {
    const account = await draftsAccount('drafts-v1-offline');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await context.setOffline(true);
    await page.click('#page-dashboard .action-row .btn-success');
    await page.selectOption('#act-type', 'learning');
    await page.fill('#act-minutes', '45');
    await page.click('#page-log-activity button');
    await expect.poll(async () => (await queueIn(page)).length).toBe(1);
    expect((await db.collection(`users/${account.uid}/activities`).get()).size).toBe(0);

    await context.setOffline(false);
    await openSignedIn(page, account, '#/today');
    const sheet = page.getByRole('dialog', { name: 'Szkice zrobione offline' });
    await sheet.getByRole('button', { name: /^Dodaj: / }).click();
    await expect(sheet.getByText('Wszystkie szkice przetworzone.')).toBeVisible();
    await expect
      .poll(async () => (await db.collection(`users/${account.uid}/activities`).get()).docs.map((d) => d.data().points))
      .toEqual([30]);
    expect((await db.doc(`users/${account.uid}`).get()).data().points).toMatchObject({ total: 330, earnedAllTime: 330 });
  });
});
