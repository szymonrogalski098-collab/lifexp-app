// Modules (docs/v2/PLAN.md 9, stage 4; 5.4 M3; 2.3 B9) on the Firebase emulators. A
// module turned off leaves the menu, the tab bar, "+" and Today, and its address
// leads to Today (v1 showPage). v1 keeps reading enabledModules, so turning a module
// off in v2 or v1 leaves the same list there; v2 also writes disabledModules.
const { createUser, db, openApp, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function modulesOf(uid) {
  const { enabledModules, disabledModules } = (await db.doc(`users/${uid}`).get()).data();
  return { enabledModules, disabledModules };
}

async function turnOff(page, name) {
  await page.getByRole('switch', { name }).uncheck();
  await expect(page.getByText('Moduł zaktualizowany.')).toBeVisible();
}

test('turning Money off takes it out of the tab bar, the menu, "+" and Today; turning it on brings it back', async ({ page }) => {
  const account = await createUser({ tag: 'modules-money' });
  await db.doc(`users/${account.uid}/money/balance`).set({ current: 50 });
  await openSignedIn(page, account, '#/settings/modules');
  const tabbar = page.locator('.tabbar');
  await expect(tabbar.getByRole('link', { name: 'Pieniądze' })).toBeVisible();

  await turnOff(page, 'Pieniądze');
  await expect.poll(() => modulesOf(account.uid)).toEqual({
    enabledModules: ['chores', 'games', 'stats', 'notes', 'aichat'],
    disabledModules: ['money'],
  });
  // The bar stays full: the next module of the menu takes the place.
  await expect(tabbar.getByRole('link', { name: 'Pieniądze' })).toHaveCount(0);
  await expect(tabbar.getByRole('link')).toHaveText(['Dziś', 'Obowiązki', 'Zadania']);
  await tabbar.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Nawigacja' });
  await expect(menu.getByRole('link', { name: 'Notatki' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Pieniądze' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await tabbar.getByRole('button', { name: 'Dodaj' }).click();
  const add = page.getByRole('dialog', { name: 'Dodaj' });
  await expect(add.getByRole('button', { name: 'Zadanie' })).toBeVisible();
  await expect(add.getByRole('button', { name: 'Wydatek' })).toHaveCount(0);
  await add.getByRole('button', { name: 'Zamknij' }).click();

  // An old link to Money leads to Today.
  await page.goto(page.url().replace(/#.*$/, '#/money'));
  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByText('50,00 zł')).toHaveCount(0);

  await page.goto(page.url().replace(/#.*$/, '#/settings/modules'));
  await page.getByRole('switch', { name: 'Pieniądze' }).check();
  await expect(tabbar.getByRole('link', { name: 'Pieniądze' })).toBeVisible();
  await expect.poll(() => modulesOf(account.uid)).toEqual({
    enabledModules: ['chores', 'money', 'games', 'stats', 'notes', 'aichat'],
    disabledModules: [],
  });
});

test('with XP stats off, Today has no activity logging and "+" offers none', async ({ page }) => {
  const account = await createUser({ tag: 'modules-stats', profile: { enabledModules: ['chores', 'money', 'notes'] } });
  await openSignedIn(page, account, '#/today');
  await expect(page.getByTestId('today-points')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zapisz aktywność' })).toHaveCount(0);
  await page.locator('.tabbar').getByRole('button', { name: 'Dodaj' }).click();
  const add = page.getByRole('dialog', { name: 'Dodaj' });
  await expect(add.getByRole('button', { name: 'Zadanie' })).toBeVisible();
  await expect(add.getByRole('button', { name: 'Aktywność' })).toHaveCount(0);
  await add.getByRole('button', { name: 'Zamknij' }).click();
  await page.goto(page.url().replace(/#.*$/, '#/stats'));
  await expect(page).toHaveURL(/#\/today$/);
});

test('B9 / M3: an account that chose the Planner before 24.08 sees Notes', async ({ page }) => {
  const account = await createUser({ tag: 'modules-planner', profile: { enabledModules: ['chores', 'planner', 'stats'] } });
  await openSignedIn(page, account, '#/today');
  await page.locator('.tabbar').getByRole('button', { name: 'Menu' }).click();
  await page.locator('#app-nav').getByRole('link', { name: 'Notatki' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  await expect(page.getByRole('link', { name: 'Nowa notatka' })).toBeVisible();
  // Money stays off, as chosen then; the next change writes Notes into v1's list too.
  await page.goto(page.url().replace(/#.*$/, '#/settings/modules'));
  await expect(page.getByRole('switch', { name: 'Notatki' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Pieniądze' })).not.toBeChecked();
  await turnOff(page, 'Statystyki XP');
  await expect.poll(() => modulesOf(account.uid)).toEqual({
    enabledModules: ['chores', 'notes'],
    disabledModules: ['money', 'stats', 'games', 'aichat'],
  });
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 hides a module turned off in v2', async ({ page, context }) => {
    const account = await createUser({ tag: 'modules-v2-to-v1' });
    await openSignedIn(page, account, '#/settings/modules');
    await turnOff(page, 'Pieniądze');
    await expect.poll(async () => (await modulesOf(account.uid)).disabledModules).toEqual(['money']);
    await serveCdnFromNpm(context);
    await openApp(page);
    await expect(page.locator('.sidebar .nav-item[data-page="chores"]')).toBeVisible();
    await expect(page.locator('.sidebar .nav-item[data-page="money"]')).toHaveCount(0);
  });

  test('parity: turning Money off in v1 leaves the same enabledModules as in v2', async ({ page, context }) => {
    const account = await createUser({ tag: 'modules-v1' });
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await page.click('#settings-cat-modules .settings-cat-label');
    // v1 calls Money "Money" in Polish too.
    await page.locator('#settings-modules-list .module-toggle-row', { hasText: 'Money' }).locator('.toggle').click();
    await expect.poll(async () => (await modulesOf(account.uid)).enabledModules).toEqual([
      'chores',
      'games',
      'stats',
      'notes',
      'aichat',
    ]);
  });
});
