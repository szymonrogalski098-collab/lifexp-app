// Settings (docs/v2/PLAN.md 9, stage 4) on the Firebase emulators. Parity (PLAN.md
// 8.3): the name, the daily limit and both rates saved in v2 leave the same profile
// fields (SAVED) as saving the same values in v1's Settings, and v1 shows them.
const { createUser, db, openApp, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const FIELDS = ['name', 'dailyLimit', 'lang', 'pointsRateGeneralZl', 'pointsRateGeneralPts', 'pointsRateChoresZl', 'pointsRateChoresPts'];

/** The settings fields of the profile as the server has them. */
async function settingsOf(uid) {
  const data = (await db.doc(`users/${uid}`).get()).data();
  return Object.fromEntries(FIELDS.filter((f) => f in data).map((f) => [f, data[f]]));
}

/** What the parity tests save, in v1 and in v2 alike. */
const SAVED = {
  name: 'Aleksandra',
  lang: 'pl',
  dailyLimit: 200,
  pointsRateGeneralZl: 2.5,
  pointsRateGeneralPts: 20,
  pointsRateChoresZl: 0.5,
  pointsRateChoresPts: 1,
};

function settingsAccount(tag) {
  return createUser({ tag, profile: { name: 'Ola', lang: 'pl', dailyLimit: 150 } });
}

test('the list says what each section is set to; theme and language change from Wygląd', async ({ page }) => {
  const account = await settingsAccount('settings-appearance');
  await openSignedIn(page, account, '#/settings');
  const list = page.getByRole('list', { name: 'Aplikacja' });
  await expect(list.getByRole('link', { name: /Wygląd/ })).toContainText('LifeXP · Ciemny · Polski');
  await expect(list.getByRole('link', { name: /Konto/ })).toContainText('Ola');
  await expect(list.getByRole('link', { name: /Punkty i nagrody/ })).toContainText('Limit 150 pkt dziennie');
  await expect(page.getByRole('list', { name: 'W modułach' }).getByRole('link', { name: /Pieniądze/ })).toHaveAttribute(
    'href',
    '#/money/settings',
  );

  await list.getByRole('link', { name: /Wygląd/ }).click();
  await expect(page).toHaveURL(/#\/settings\/appearance$/);
  await page.getByRole('radio', { name: 'iOS' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ios');
  await page.getByRole('radio', { name: 'Jasny' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await page.getByRole('radio', { name: 'Gold' }).check();
  await expect(page.getByText('Gold ma tylko tryb ciemny.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');

  // The language goes to the profile (other devices, v1) and to v1's key on this one.
  await page.getByRole('radio', { name: 'English' }).check();
  await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
  await expect.poll(async () => (await settingsOf(account.uid)).lang).toBe('en');
  expect(await page.evaluate(() => localStorage.getItem('lifexp-lang'))).toBe('en');

  await page.getByRole('link', { name: '‹ Settings' }).click();
  await expect(page.getByRole('list', { name: 'App' }).getByRole('link', { name: /Appearance/ })).toContainText('Gold · Dark · English');
});

test('Konto: the name is saved trimmed; a name over 30 characters is not', async ({ page }) => {
  const account = await settingsAccount('settings-name');
  await openSignedIn(page, account, '#/settings/account');
  const name = page.getByLabel('Imię');
  await expect(name).toHaveValue('Ola');
  await name.fill('x'.repeat(31));
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Imię może mieć najwyżej 30 znaków.')).toBeVisible();
  expect((await settingsOf(account.uid)).name).toBe('Ola');

  await name.fill('  Aleksandra ');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano.')).toBeVisible();
  await expect.poll(async () => (await settingsOf(account.uid)).name).toBe('Aleksandra');
  await page.locator('.tabbar').getByRole('link', { name: 'Dziś' }).click();
  await expect(page.getByText('Cześć, Aleksandra')).toBeVisible();
});

test('Punkty: the limit stays within 50–500; both rates are saved as v1 stores them', async ({ page }) => {
  const account = await settingsAccount('settings-points');
  await openSignedIn(page, account, '#/settings/points');
  const limit = page.getByLabel('Limit na dzień');
  await expect(limit).toHaveValue('150');
  await limit.fill('20');
  await page.getByRole('button', { name: 'Zapisz limit' }).click();
  await expect(page.getByText('Wpisz liczbę od 50 do 500.')).toBeVisible();
  await limit.fill('200');
  await page.getByRole('button', { name: 'Zapisz limit' }).click();
  await expect(page.getByText('Dzienny limit: 200 pkt.')).toBeVisible();

  // Defaults shown until set: 1 zł for 10 points, 0,45 zł for 1 point.
  const general = page.locator('section', { has: page.getByRole('heading', { name: 'Kurs punktów' }) });
  const chores = page.locator('section', { has: page.getByRole('heading', { name: 'Kurs obowiązków' }) });
  await expect(general.getByLabel('Złotych')).toHaveValue('1,00');
  await expect(general.getByLabel('Za punktów')).toHaveValue('10');
  await expect(chores.getByLabel('Złotych')).toHaveValue('0,45');
  await expect(chores.getByLabel('Za punktów')).toHaveValue('1');

  await general.getByLabel('Za punktów').fill('');
  await general.getByRole('button', { name: 'Zapisz kurs' }).click();
  await expect(general.getByText('Wpisz co najmniej 1 punkt.')).toBeVisible();
  await general.getByLabel('Złotych').fill('2,50');
  await general.getByLabel('Za punktów').fill('20');
  await expect(general.getByText('1 pkt = 0,13 zł')).toBeVisible();
  await general.getByRole('button', { name: 'Zapisz kurs' }).click();
  await chores.getByLabel('Złotych').fill('0,5');
  await chores.getByRole('button', { name: 'Zapisz kurs' }).click();

  await expect.poll(() => settingsOf(account.uid)).toEqual({ ...SAVED, name: 'Ola' });
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 Settings shows what v2 saved', async ({ page, context }) => {
    const account = await settingsAccount('settings-v2-to-v1');
    await openSignedIn(page, account, '#/settings/account');
    await page.getByLabel('Imię').fill('Aleksandra');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await page.getByRole('link', { name: '‹ Ustawienia' }).click();
    await page.getByRole('link', { name: /Punkty i nagrody/ }).click();
    await page.getByLabel('Limit na dzień').fill('200');
    await page.getByRole('button', { name: 'Zapisz limit' }).click();
    const general = page.locator('section', { has: page.getByRole('heading', { name: 'Kurs punktów' }) });
    await general.getByLabel('Złotych').fill('2,50');
    await general.getByLabel('Za punktów').fill('20');
    await general.getByRole('button', { name: 'Zapisz kurs' }).click();
    const chores = page.locator('section', { has: page.getByRole('heading', { name: 'Kurs obowiązków' }) });
    await chores.getByLabel('Złotych').fill('0,50');
    await chores.getByRole('button', { name: 'Zapisz kurs' }).click();
    await expect.poll(() => settingsOf(account.uid)).toEqual(SAVED);

    await serveCdnFromNpm(context);
    await openApp(page);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await expect(page.locator('#set-name')).toHaveValue('Aleksandra');
    await expect(page.locator('#set-daily-limit')).toHaveValue('200');
    await expect(page.locator('#econ-general-zl')).toHaveValue('2.5');
    await expect(page.locator('#econ-general-pts')).toHaveValue('20');
    await expect(page.locator('#econ-chore-zl')).toHaveValue('0.5');
    await expect(page.locator('#econ-chore-pts')).toHaveValue('1');
  });

  test('parity: the same values saved in v1 Settings leave the same fields', async ({ page, context }) => {
    const account = await settingsAccount('settings-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await page.click('#settings-cat-account .settings-cat-label');
    await page.fill('#set-name', 'Aleksandra');
    await page.click('#settings-cat-dashboard .settings-cat-label');
    await page.fill('#set-daily-limit', '200');
    await page.click('#settings-cat-dashboard button[onclick="saveSettings()"]');
    // v1 reloads the profile after each save and fills every field again: wait for it.
    await expect.poll(async () => (await settingsOf(account.uid)).dailyLimit).toBe(200);
    await expect(page.locator('#set-daily-limit')).toHaveValue('200');
    await page.click('#settings-cat-expenses .settings-cat-label');
    await page.fill('#econ-general-zl', '2.5');
    await page.fill('#econ-general-pts', '20');
    await page.click('button[onclick="saveEconomyGeneral()"]');
    await expect.poll(async () => (await settingsOf(account.uid)).pointsRateGeneralPts).toBe(20);
    await expect(page.locator('#econ-general-pts')).toHaveValue('20');
    await page.click('#settings-cat-chores .settings-cat-label');
    await page.fill('#econ-chore-zl', '0.5');
    await page.fill('#econ-chore-pts', '1');
    await page.click('button[onclick="saveEconomyChores()"]');
    await expect.poll(() => settingsOf(account.uid)).toEqual(SAVED);
  });
});
