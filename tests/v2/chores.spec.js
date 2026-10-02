// Chores (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8) on the Firebase emulators.
// Parity (PLAN.md 8.3): logging the same chore in v1 and v2 writes the same entry,
// and v1's calendar shows what v2 logged; paying out and the list of chores likewise.
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
  await expect(page.getByTestId('unpaid-points')).toHaveText('15 pkt');
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
  await expect(page.getByTestId('unpaid-points')).toHaveText('25 pkt');

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

// ── Payout (stage 3b-2; G8.5–G8.8) ──

/** Two unpaid entries (10 + 30 pts on two days), a 50,00 zł balance, nothing earned yet. */
async function payoutAccount(tag) {
  const account = await choresAccount(tag);
  const user = db.doc(`users/${account.uid}`);
  await user.collection('money').doc('balance').set({ current: 50, currency: 'PLN', monthlyLimit: 0 });
  await entriesOf(account.uid).add({
    choreId: 'x10', choreName: 'Dziesięć', choreEmoji: '🧹', points: 10, dateISO: localDay(0), monthKey: localDay(0).slice(0, 7), createdAt: new Date(),
  });
  await entriesOf(account.uid).add({
    choreId: 'x30', choreName: 'Trzydzieści', choreEmoji: '🧽', points: 30, dateISO: localDay(-2), monthKey: localDay(-2).slice(0, 7), createdAt: new Date(),
  });
  return account;
}

/** Everything a payout touches, ids and creation times aside. */
async function payoutState(uid) {
  const user = db.doc(`users/${uid}`);
  const strip = (docs) => docs.map((d) => {
    const { createdAt, ...rest } = d.data();
    return rest;
  });
  return {
    payouts: strip((await user.collection('chorePayouts').get()).docs),
    entries: (await entriesOf(uid).get()).size,
    balance: (await user.collection('money').doc('balance').get()).data(),
    transactions: strip((await user.collection('moneyTransactions').get()).docs),
    moneyIncomeAllTime: (await user.get()).data().moneyIncomeAllTime ?? null,
  };
}

const utcToday = () => new Date().toISOString().slice(0, 10);
const paidState = () => ({
  payouts: [{ points: 40, amountPln: 18, fromISO: localDay(-2), toISO: localDay(0) }],
  entries: 0,
  balance: { current: 68, currency: 'PLN', monthlyLimit: 0 },
  transactions: [{ type: 'income', amount: 18, category: 'Obowiązki domowe', note: '', date: utcToday(), source: 'chore_payout' }],
  moneyIncomeAllTime: 18,
});

async function settleInV2(page) {
  await page.getByRole('button', { name: 'Rozlicz wypłatę' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Rozliczyć 18,00 zł?' });
  await expect(dialog).toContainText('40 pkt');
  await dialog.getByRole('button', { name: 'Rozlicz wypłatę' }).click();
  // Until its exit animation ends the dialog (by then titled with the new amount)
  // still has a "Rozlicz wypłatę" button too.
  await expect(page.getByRole('alertdialog')).toBeHidden();
}

test('G8.5: paying out 10 + 30 pts moves 18,00 zł into Money in one go', async ({ page }) => {
  const account = await payoutAccount('payout-v2');
  await openSignedIn(page, account, '#/chores');
  await expect(page.getByTestId('unpaid-money')).toHaveText('18,00 zł');
  await expect(page.getByTestId('unpaid-points')).toHaveText('40 pkt');
  await settleInV2(page);

  await expect(page.getByText('Rozliczono 18,00 zł')).toBeVisible();
  expect(await payoutState(account.uid)).toEqual(paidState());
  await expect(page.getByTestId('unpaid-money')).toHaveText('0,00 zł');
  await expect(page.getByTestId('unpaid-points')).toHaveText('0 pkt');
  await expect(page.getByRole('button', { name: 'Rozlicz wypłatę' })).toBeDisabled();
  const history = page.getByRole('list', { name: 'Historia wypłat' }).getByRole('listitem');
  await expect(history).toHaveCount(1);
  await expect(history.first()).toContainText('18,00 zł');
  await expect(history.first()).toContainText('40 pkt');
});

test('a payout cut off by a lost connection changes nothing, and goes through afterwards', async ({ page, context }) => {
  const account = await payoutAccount('payout-offline');
  const before = await payoutState(account.uid);
  await openSignedIn(page, account, '#/chores');
  await expect(page.getByTestId('unpaid-money')).toHaveText('18,00 zł');
  await expect(page.getByTestId('unpaid-points')).toHaveText('40 pkt');

  await context.setOffline(true);
  await settleInV2(page);
  await expect(page.getByText('Rozliczenie się nie udało i nic nie zostało zmienione.', { exact: false })).toBeVisible({
    timeout: 30000,
  });
  await context.setOffline(false);
  // Nothing half-done: no record without deletions, no money without a record.
  expect(await payoutState(account.uid)).toEqual(before);

  await settleInV2(page);
  await expect(page.getByText('Rozliczono 18,00 zł')).toBeVisible();
  expect(await payoutState(account.uid)).toEqual(paidState());
});

test.describe('v1 on a desktop: payout', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity: v1 pays out the same account to the same state (achievements aside)', async ({ page, context }) => {
    const account = await payoutAccount('payout-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="chores"]');
    await expect(page.locator('#chore-outstanding')).toHaveText('18,00 zł');
    await page.click('#chore-settle-btn');
    await page.click('#confirm-modal-ok');
    await expect.poll(async () => (await payoutState(account.uid)).transactions.length).toBe(1);
    await expect.poll(async () => (await payoutState(account.uid)).moneyIncomeAllTime).toBe(18);
    expect(await payoutState(account.uid)).toEqual(paidState());
  });
});

// ── The list of chores (stage 3b-3; v1 Settings → "Zarządzaj obowiązkami") ──

/** Every definition of the account, as written, sorted by id. */
async function defsState(uid) {
  const snap = await defsOf(uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
}

/** The new definition (the one outside DEFS), without its generated id. */
async function addedDef(uid) {
  await expect.poll(async () => (await defsOf(uid).get()).size).toBe(DEFS.length + 1);
  const known = new Set(DEFS.map(([id]) => id));
  const [added] = (await defsOf(uid).get()).docs.filter((d) => !known.has(d.id));
  return added.data();
}

const flowers = { name: 'Podlanie kwiatów', desc: 'salon i kuchnia', emoji: '🪴', points: 12, oneTime: true, order: 3 };

test('adding a chore to the list writes v1\'s definition, checked as v1 checks it', async ({ page }) => {
  const account = await choresAccount('defs-v2');
  await openSignedIn(page, account, '#/chores/defs');
  const list = page.getByRole('list', { name: 'Lista obowiązków' }).getByRole('listitem');
  await expect(list).toHaveCount(3);
  await expect(list.nth(2)).toContainText('Mycie okien');
  await expect(list.nth(2)).toContainText('jednorazowy');

  await page.getByRole('button', { name: 'Nowy obowiązek' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy obowiązek' });
  await sheet.getByRole('button', { name: 'Dodaj obowiązek' }).click();
  await expect(sheet.getByText('Podaj nazwę.')).toBeVisible();
  await sheet.getByLabel('Nazwa').fill('  Podlanie kwiatów ');
  await sheet.getByRole('button', { name: 'Dodaj obowiązek' }).click();
  await expect(sheet.getByText('Podaj liczbę punktów większą od zera.')).toBeVisible();
  await sheet.getByLabel('Punkty').fill('10001');
  await sheet.getByRole('button', { name: 'Dodaj obowiązek' }).click();
  await expect(sheet.getByText('Najwięcej 10 000 pkt.')).toBeVisible();

  await sheet.getByLabel('Punkty').fill('12');
  await sheet.getByLabel('Opis (opcjonalnie)').fill('salon i kuchnia');
  await sheet.getByRole('radio', { name: '🪴' }).check();
  await expect(sheet.getByText('Emoji: 🪴')).toBeVisible();
  await sheet.getByRole('radio', { name: 'Jednorazowy' }).check();
  await expect(sheet.getByText('Zniknie z listy po pierwszym zapisaniu.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Dodaj obowiązek' }).click();

  await expect(page.getByText('Dodano do listy: Podlanie kwiatów')).toBeVisible();
  expect(await addedDef(account.uid)).toEqual(flowers);
  await expect(list).toHaveCount(4);
  await expect(list.nth(3)).toContainText('salon i kuchnia · jednorazowy');

  // It can be logged straight away.
  await page.getByRole('link', { name: 'Przegląd' }).click();
  await page.getByRole('button', { name: 'Dodaj obowiązek' }).click();
  await expect(page.getByRole('dialog', { name: 'Który obowiązek?' }).getByRole('button', { name: /Podlanie kwiatów/ })).toBeVisible();
});

test('removing a chore from the list, and undo brings back the same definition', async ({ page }) => {
  const account = await choresAccount('defs-delete');
  await seedEntry(account.uid, 'vacuum_stairs', localDay(0));
  const before = await defsState(account.uid);
  await openSignedIn(page, account, '#/chores/defs');

  await page.getByRole('button', { name: 'Usuń: Odkurzanie schodów' }).click();
  await expect(page.getByText('Usunięto z listy: Odkurzanie schodów')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Lista obowiązków' }).getByRole('listitem')).toHaveCount(2);
  await expect.poll(async () => (await defsState(account.uid)).map((d) => d.id)).toEqual(['dishwasher', 'windows_once']);
  // The entry logged from it stays, with its own name and points.
  expect((await entries(account.uid, 1))[0]).toMatchObject({ choreId: 'vacuum_stairs', choreName: 'Odkurzanie schodów', points: 5 });

  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect(page.getByRole('list', { name: 'Lista obowiązków' }).getByRole('listitem')).toHaveCount(3);
  await expect.poll(() => defsState(account.uid)).toEqual(before);
});

test('an account without a single chore gets v1\'s list when Chores opens', async ({ page }) => {
  const account = await createUser({ tag: 'defs-seed-v2' });
  await openSignedIn(page, account, '#/chores/defs');
  await expect(page.getByRole('list', { name: 'Lista obowiązków' }).getByRole('listitem')).toHaveCount(8);
  await expect.poll(async () => (await defsState(account.uid)).length).toBe(8);
});

test.describe('v1 on a desktop: the list of chores', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity: v1 adds the same definition for the same form', async ({ page, context }) => {
    const account = await choresAccount('defs-v1');
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await page.click('#settings-cat-chores .settings-cat-label');
    await page.fill('#cd-name', '  Podlanie kwiatów ');
    await page.fill('#cd-desc', 'salon i kuchnia');
    await page.fill('#cd-points', '12');
    await page.click('#cd-emoji-picker button[data-emoji="🪴"]');
    await page.check('#cd-onetime');
    await page.click('button[onclick="addChoreDef()"]');
    expect(await addedDef(account.uid)).toEqual(flowers);
  });

  test('parity: v1 seeds the same list v2 does', async ({ page, context }) => {
    const inV2 = await createUser({ tag: 'defs-seed-v2b' });
    await openSignedIn(page, inV2, '#/chores');
    await expect.poll(async () => (await defsState(inV2.uid)).length).toBe(8);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    const inV1 = await createUser({ tag: 'defs-seed-v1' });
    await serveCdnFromNpm(context);
    await signInToApp(page, inV1);
    await page.click('.sidebar .nav-item[data-page="chores"]');
    await expect.poll(async () => (await defsState(inV1.uid)).length).toBe(8);
    expect(await defsState(inV2.uid)).toEqual(await defsState(inV1.uid));
  });

  test('v1 lists a chore that v2 added', async ({ page, context }) => {
    const account = await choresAccount('defs-v2-to-v1');
    await openSignedIn(page, account, '#/chores/defs');
    await page.getByRole('button', { name: 'Nowy obowiązek' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nowy obowiązek' });
    await sheet.getByLabel('Nazwa').fill('Podlanie kwiatów');
    await sheet.getByLabel('Punkty').fill('12');
    await sheet.getByRole('button', { name: 'Dodaj obowiązek' }).click();
    await addedDef(account.uid);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="chores"]');
    await page.click('#chore-fab');
    await expect(page.locator('#chore-sheet-list')).toContainText('Podlanie kwiatów');
  });
});

// ── Today's card (owner's requests 2026-10-02): 3–4 drawn a day or a chosen list,
// each done once a day there, with "Cofnij" ──

test('Today draws repeating chores; a tap logs one for today, once, and "Cofnij" takes it back', async ({ page }) => {
  const account = await choresAccount('chores-today-tap');
  await openSignedIn(page, account, '#/today');
  await expect(page.getByText('Wylosowane na dziś')).toBeVisible();
  const chores = page.getByRole('list', { name: 'Obowiązki dziś' });
  // Two repeating chores, fewer than a draw: both; the one-time chore is never drawn.
  await expect(chores.getByRole('listitem')).toHaveCount(2);
  await expect(chores).not.toContainText('Mycie okien');
  await expect(page.getByTestId('chores-progress')).toHaveText('0 z 2 zrobione');

  const dishes = chores.getByRole('button', { name: /Opróżnienie zmywarki/ });
  await dishes.click();
  await expect(page.getByText('Dodano: Opróżnienie zmywarki (+15 pkt)')).toBeVisible();
  await expect(dishes).toBeDisabled();
  await expect(dishes).toContainText('Zrobione dziś');
  await expect(page.getByTestId('chores-progress')).toHaveText('1 z 2 zrobione');
  await expect.poll(async () => (await entriesOf(account.uid).get()).docs.map((d) => d.data().dateISO)).toEqual([localDay()]);

  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect.poll(async () => (await entriesOf(account.uid).get()).size).toBe(0);
  await expect(dishes).toBeEnabled();
  await expect(page.getByTestId('chores-progress')).toHaveText('0 z 2 zrobione');
});

test("the card's editor: a chosen list with a one-time chore, kept on the account", async ({ page }) => {
  const account = await choresAccount('chores-today-editor');
  await openSignedIn(page, account, '#/today');
  await page.getByRole('button', { name: 'Edytuj listę' }).click();
  const sheet = page.getByRole('dialog', { name: 'Lista na „Dziś”' });
  await sheet.getByRole('radio', { name: 'Wybrane' }).check();
  // It starts from what the card shows today.
  await expect(sheet.getByRole('checkbox', { name: 'Opróżnienie zmywarki' })).toBeChecked();
  await sheet.getByRole('checkbox', { name: 'Odkurzanie schodów' }).uncheck();
  await sheet.getByRole('checkbox', { name: 'Mycie okien' }).check();
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Zapisano listę na „Dziś”.')).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect
    .poll(async () => (await db.doc(`users/${account.uid}`).get()).data().choresCard)
    .toEqual({ mode: 'chosen', ids: ['dishwasher', 'windows_once'] });

  await expect(page.getByText('Twoja lista')).toBeVisible();
  const chores = page.getByRole('list', { name: 'Obowiązki dziś' });
  await expect(chores.getByRole('listitem')).toHaveCount(2);
  // A one-time chore leaves the definitions when logged, stays done on the card, and comes back with "Cofnij".
  await chores.getByRole('button', { name: /Mycie okien/ }).click();
  await expect.poll(async () => (await defsOf(account.uid).doc('windows_once').get()).exists).toBe(false);
  await expect(chores.getByRole('button', { name: /Mycie okien/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect.poll(async () => (await defsOf(account.uid).doc('windows_once').get()).data()).toEqual({
    name: 'Mycie okien',
    desc: '',
    emoji: '🪟',
    points: 20,
    oneTime: true,
    order: 2,
  });
  await expect.poll(async () => (await entriesOf(account.uid).get()).size).toBe(0);

  // An empty chosen list is not saved; the chore list itself is one tap away.
  await page.getByRole('button', { name: 'Edytuj listę' }).click();
  await sheet.getByRole('checkbox', { name: 'Opróżnienie zmywarki' }).uncheck();
  await sheet.getByRole('checkbox', { name: 'Mycie okien' }).uncheck();
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Zaznacz co najmniej jeden obowiązek.');
  await sheet.getByRole('button', { name: 'Dodaj lub usuń obowiązki' }).click();
  await expect(page).toHaveURL(/#\/chores\/defs$/);
  await expect(sheet).toBeHidden();
});
