// Chores (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8) on the Firebase emulators.
// Parity (PLAN.md 8.3): logging the same chore in v1 and v2 writes the same entry,
// and v1's calendar shows what v2 logged.
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** v1 dateISOLocal(): chores use the device's calendar (G13). */
function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const entriesOf = (uid) => db.collection(`users/${uid}/chores`);
const defsOf = (uid) => db.collection(`users/${uid}/choreDefs`);

const DEFS = [
  ['dishwasher', 'Opróżnienie zmywarki', '🍽️', 15, false],
  ['vacuum_stairs', 'Odkurzanie schodów', '🧹', 5, false],
  ['windows_once', 'Mycie okien', '🪟', 20, true],
];

async function choresAccount(tag) {
  const account = await createUser({ tag });
  for (const [i, [id, name, emoji, points, oneTime]] of DEFS.entries()) {
    await defsOf(account.uid).doc(id).set({ name, desc: '', emoji, points, oneTime, order: i });
  }
  return account;
}

function seedEntry(uid, choreId, dateISO) {
  const [, name, emoji, points] = DEFS.find((d) => d[0] === choreId);
  return entriesOf(uid).add({
    choreId,
    choreName: name,
    choreEmoji: emoji,
    points,
    dateISO,
    monthKey: dateISO.slice(0, 7),
    createdAt: new Date(),
  });
}

/** The account's entries once the writes reached the server, ids and creation times aside. */
async function entries(uid, count) {
  await expect.poll(async () => (await entriesOf(uid).get()).size).toBe(count);
  return (await entriesOf(uid).get()).docs.map((d) => {
    const { createdAt, ...rest } = d.data();
    expect(createdAt.toDate()).toBeInstanceOf(Date);
    return rest;
  });
}

const dishwasherToday = () => ({
  choreId: 'dishwasher',
  choreName: 'Opróżnienie zmywarki',
  choreEmoji: '🍽️',
  points: 15,
  dateISO: localDay(0),
  monthKey: localDay(0).slice(0, 7),
});

async function logInV2(page, name) {
  await page.getByRole('button', { name: 'Dodaj obowiązek' }).click();
  await page.getByRole('dialog', { name: 'Który obowiązek?' }).getByRole('button', { name: new RegExp(name) }).click();
}

test('logging a chore in v2 writes v1\'s entry and shows it in the calendar', async ({ page }) => {
  const account = await choresAccount('chores-v2');
  await openSignedIn(page, account, '#/chores');
  await logInV2(page, 'Opróżnienie zmywarki');

  await expect(page.getByText('Dodano: Opróżnienie zmywarki (+15 pkt)')).toBeVisible();
  expect(await entries(account.uid, 1)).toEqual([dishwasherToday()]);
  await expect(page.getByTestId('month-points')).toHaveText('15 pkt');
  // The day it went to is selected and lists the entry.
  const day = page.getByRole('list', { name: /^Wpisy z dnia/ }).getByRole('listitem');
  await expect(day).toHaveCount(1);
  await expect(day.first()).toContainText('Opróżnienie zmywarki');
  await expect(page.getByTestId('unpaid')).toContainText('15 pkt');
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity: v1 writes the same entry for the same chore', async ({ page, context }) => {
    const account = await choresAccount('chores-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="chores"]');
    await page.click('#chore-fab');
    await page.click('#chore-sheet-list .sheet-chore[onclick*="dishwasher"]');
    expect(await entries(account.uid, 1)).toEqual([dishwasherToday()]);
  });

  test('v1 shows an entry that v2 logged', async ({ page, context }) => {
    const account = await choresAccount('chores-v2-to-v1');
    await openSignedIn(page, account, '#/chores');
    await logInV2(page, 'Odkurzanie schodów');
    await entries(account.uid, 1);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="chores"]');
    const day = page.locator('#chore-cal .cal-cell.has');
    await expect(day).toHaveCount(1);
    await expect(day).toContainText(String(Number(localDay(0).slice(8))));
    await expect(day.locator('.cal-pts')).toHaveText('5');
  });
});

test('G8.2/G8.3: the same chore again today asks about yesterday (same month only)', async ({ page }) => {
  const account = await choresAccount('chores-yesterday');
  await seedEntry(account.uid, 'dishwasher', localDay(0));
  await openSignedIn(page, account, '#/chores');
  await logInV2(page, 'Opróżnienie zmywarki');

  const sameMonth = localDay(-1).slice(0, 7) === localDay(0).slice(0, 7);
  if (sameMonth) {
    const sheet = page.getByRole('dialog', { name: 'Kiedy?' });
    await expect(sheet).toContainText('„Opróżnienie zmywarki” jest już zapisany na dziś.');
    await sheet.getByRole('button', { name: 'Wczoraj' }).click();
    const days = (await entries(account.uid, 2)).map((e) => e.dateISO).sort();
    expect(days).toEqual([localDay(-1), localDay(0)]);
  } else {
    // G8.3: yesterday was last month, so it goes on today without asking.
    const days = (await entries(account.uid, 2)).map((e) => e.dateISO);
    expect(days).toEqual([localDay(0), localDay(0)]);
  }
});

test('G8.4: a one-time chore disappears from the list once logged', async ({ page }) => {
  const account = await choresAccount('chores-once');
  await openSignedIn(page, account, '#/chores');
  await logInV2(page, 'Mycie okien');
  await entries(account.uid, 1);
  await expect.poll(async () => (await defsOf(account.uid).doc('windows_once').get()).exists).toBe(false);
  await page.getByRole('button', { name: 'Dodaj obowiązek' }).click();
  const sheet = page.getByRole('dialog', { name: 'Który obowiązek?' });
  await expect(sheet.getByRole('button', { name: /Opróżnienie zmywarki/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Mycie okien/ })).toHaveCount(0);
});

test('the calendar, last month, and deleting an entry with undo', async ({ page }) => {
  const account = await choresAccount('chores-calendar');
  const today = localDay(0);
  await seedEntry(account.uid, 'dishwasher', today);
  await seedEntry(account.uid, 'vacuum_stairs', today);
  const lastMonth = new Date();
  lastMonth.setDate(0); // the last day of the previous month
  const lastMonthDay = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${String(lastMonth.getDate()).padStart(2, '0')}`;
  await seedEntry(account.uid, 'vacuum_stairs', lastMonthDay);

  await openSignedIn(page, account, '#/chores');
  await expect(page.getByTestId('month-points')).toHaveText('20 pkt');
  await expect(page.getByTestId('month-money')).toHaveText('9,00 zł');
  await expect(page.getByTestId('unpaid')).toContainText('25 pkt');

  const dayNumber = String(Number(today.slice(8)));
  const cell = page.getByRole('button', { name: new RegExp(`^${dayNumber} .*: 20 pkt$`) });
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  const list = page.getByRole('list', { name: /^Wpisy z dnia/ }).getByRole('listitem');
  await expect(list).toHaveCount(2);

  await page.getByRole('button', { name: 'Usuń: Odkurzanie schodów' }).click();
  await expect(list).toHaveCount(1);
  await expect.poll(async () => (await entriesOf(account.uid).get()).size).toBe(2);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect(list).toHaveCount(2);
  await expect.poll(async () => (await entriesOf(account.uid).get()).size).toBe(3);

  await page.getByRole('radio', { name: 'Poprzedni miesiąc' }).check();
  await expect(page.getByTestId('month-points')).toHaveText('5 pkt');
  await expect(page.getByRole('button', { name: 'Dodaj obowiązek' })).toHaveCount(0);
});

test('"+" → Obowiązek opens the list of chores', async ({ page }) => {
  const account = await choresAccount('chores-add');
  await openSignedIn(page, account, '#/today');
  await page.locator('.tabbar').getByRole('button', { name: 'Dodaj' }).click();
  await page.getByRole('dialog', { name: 'Dodaj' }).getByRole('button', { name: 'Obowiązek' }).click();
  await expect(page.getByRole('dialog', { name: 'Który obowiązek?' })).toBeVisible();
  await expect(page).toHaveURL(/#\/chores$/);
});
