// Activity types in Settings (docs/v2/PLAN.md 9, stage 4c) on the Firebase emulators.
// Parity (PLAN.md 8.3): a type added in v2 is the document v1 addActivityDef() writes
// for the same choices, and v1 lists it; changing a type is v2 only.
const { createUser, db, openApp, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** One type, v1's "learning", so the list is not seeded with v1's five. */
async function typesAccount(tag) {
  const account = await createUser({ tag });
  await db
    .doc(`users/${account.uid}/activityDefs/learning`)
    .set({ name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 });
  return account;
}

async function typesOf(uid) {
  const snap = await db.collection(`users/${uid}/activityDefs`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
}

/** What v1 and v2 write for "Gitara, 30 pts/h, music, red", id aside. */
const GITARA = { name: 'Gitara', points: 30, icon: 'ti-music', color: '#ff6b6b', order: 1 };

test('a new type is checked, saved as v1 writes it, and can be logged on Today', async ({ page }) => {
  const account = await typesAccount('types-new');
  await openSignedIn(page, account, '#/settings/activities');
  const list = page.getByRole('list', { name: 'Rodzaje aktywności' });
  await expect(list.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Nowy rodzaj' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy rodzaj' });
  await sheet.getByRole('button', { name: 'Dodaj rodzaj' }).click();
  await expect(sheet.getByText('Wpisz nazwę.')).toBeVisible();
  await sheet.getByLabel('Nazwa').fill('  Gitara ');
  await sheet.getByRole('button', { name: 'Dodaj rodzaj' }).click();
  await expect(sheet.getByText('Wpisz liczbę punktów większą od zera.')).toBeVisible();
  await sheet.getByLabel('Punkty').fill('30');
  await sheet.getByLabel('Ikona').selectOption({ label: 'Muzyka' });
  await sheet.getByRole('radio', { name: 'Czerwień' }).check();
  await sheet.getByRole('button', { name: 'Dodaj rodzaj' }).click();
  await expect(page.getByText('Dodano: Gitara.')).toBeVisible();
  await expect(sheet).toBeHidden();

  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').nth(1)).toContainText('Gitara30 pkt/h · Czerwień');
  await expect.poll(async () => (await typesOf(account.uid)).map(({ id, ...data }) => data)).toEqual([
    { name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 },
    GITARA,
  ]);

  await page.locator('.tabbar').getByRole('link', { name: 'Dziś' }).click();
  await page.getByRole('button', { name: 'Zapisz aktywność' }).click();
  await expect(page.getByRole('dialog', { name: 'Nowa aktywność' }).getByRole('option', { name: 'Gitara · 30 pkt/h' })).toBeAttached();
});

test('a type is changed in the same sheet and removed, each with undo', async ({ page }) => {
  const account = await typesAccount('types-edit');
  await openSignedIn(page, account, '#/settings/activities');
  await page.getByRole('button', { name: 'Zmień: Nauka' }).click();
  const sheet = page.getByRole('dialog', { name: 'Zmiana rodzaju' });
  await expect(sheet.getByLabel('Nazwa')).toHaveValue('Nauka');
  await expect(sheet.getByLabel('Ikona')).toHaveValue('ti-book');
  await sheet.getByLabel('Punkty').fill('45');
  await sheet.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect.poll(async () => (await typesOf(account.uid))[0].points).toBe(45);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect.poll(async () => (await typesOf(account.uid))[0].points).toBe(40);

  await page.getByRole('button', { name: 'Usuń: Nauka' }).click();
  await expect(page.getByText('Usunięto: Nauka.')).toBeVisible();
  await expect.poll(async () => (await typesOf(account.uid)).length).toBe(0);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect.poll(() => typesOf(account.uid)).toEqual([
    { id: 'learning', name: 'Nauka', points: 40, color: '#6c63ff', icon: 'ti-book', order: 0 },
  ]);
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 lists a type added in v2', async ({ page, context }) => {
    const account = await typesAccount('types-v2-to-v1');
    await openSignedIn(page, account, '#/settings/activities');
    await page.getByRole('button', { name: 'Nowy rodzaj' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nowy rodzaj' });
    await sheet.getByLabel('Nazwa').fill('Gitara');
    await sheet.getByLabel('Punkty').fill('30');
    await sheet.getByRole('button', { name: 'Dodaj rodzaj' }).click();
    await expect.poll(async () => (await typesOf(account.uid)).length).toBe(2);

    await serveCdnFromNpm(context);
    await openApp(page);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await page.click('#settings-cat-activities .settings-cat-label');
    await expect(page.locator('#activity-defs-list')).toContainText('Gitara — 30');
  });

  test('parity: v1 adds the same type as the same document', async ({ page, context }) => {
    const account = await typesAccount('types-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await page.click('#settings-cat-activities .settings-cat-label');
    await page.fill('#ad-name', 'Gitara');
    await page.fill('#ad-points', '30');
    await page.click('#ad-icon-picker button[data-icon="ti-music"]');
    await page.click('#ad-color-picker button[data-color="#ff6b6b"]');
    await page.click('button[onclick="addActivityDef()"]');
    await expect.poll(async () => (await typesOf(account.uid)).map(({ id, ...data }) => data)[1]).toEqual(GITARA);
  });
});
