// The admin's side of bug reports (docs/v2/PLAN.md 9, stage 4) on the Firebase
// emulators, against the real rules with a test address as the admin
// (tests/support/admin.js). Reports of other tests share the collection, so each
// test finds its own by a unique title.
const { Timestamp } = require('firebase-admin/firestore');
const { adminAccount } = require('../support/admin');
const { createUser, db } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedReport(reporter, title, patch = {}) {
  const ref = db.collection('bugReports').doc();
  await ref.set({
    reporterUid: reporter.uid,
    reporterName: 'Ola',
    title,
    area: 'money',
    description: 'Saldo nie działa',
    status: 'new',
    messages: [],
    createdAt: Timestamp.now(),
    ...patch,
  });
  return ref;
}

async function openReport(page, title) {
  await page.getByRole('button', { name: new RegExp(title) }).click();
  return page.getByRole('dialog', { name: title });
}

test('reports by tab; spam nobody rescued in 12 hours goes when the admin looks', async ({ page }) => {
  const admin = await adminAccount();
  const reporter = await createUser({ tag: 'admin-tabs-reporter' });
  const t = tag();
  await seedReport(reporter, `Nowe ${t}`);
  await seedReport(reporter, `Odłożone ${t}`, { status: 'postponed' });
  await seedReport(reporter, `Przyjęte ${t}`, { status: 'accepted', bonusGranted: true });
  await seedReport(reporter, `Spam ${t}`, { status: 'spam', createdAt: Timestamp.fromMillis(Date.now() - 2 * 3600_000) });
  const stale = await seedReport(reporter, `Stary spam ${t}`, {
    status: 'spam',
    createdAt: Timestamp.fromMillis(Date.now() - 13 * 3600_000),
  });

  await openSignedIn(page, admin, '#/reports');
  // The admin's view replaces the reporter's form.
  await expect(page.getByRole('button', { name: 'Zgłoś błąd' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Nowe', exact: true })).toContainText(`Nowe ${t}`);
  await expect.poll(async () => (await stale.get()).exists).toBe(false);

  await page.getByRole('radio', { name: /^Spam/ }).check();
  const spam = page.getByRole('list', { name: 'Spam', exact: true });
  await expect(spam).toContainText(`Spam ${t}`);
  await expect(spam).toContainText('Zniknie samo za 10 h, jeśli nic nie zrobisz.');
  await expect(spam).not.toContainText(`Stary spam ${t}`);
  await page.getByRole('radio', { name: /^Odłożone/ }).check();
  await expect(page.getByRole('list', { name: 'Odłożone', exact: true })).toContainText(`Odłożone ${t}`);
  await page.getByRole('radio', { name: /^Historia/ }).check();
  await expect(page.getByRole('list', { name: 'Historia', exact: true })).toContainText(`Przyjęte ${t}`);
});

test("accepting grants the reporter's bonus; the admin replies; spam is rescued; a deletion is asked first", async ({ page }) => {
  const admin = await adminAccount();
  const reporter = await createUser({ tag: 'admin-actions-reporter' });
  const t = tag();
  const accepted = await seedReport(reporter, `Do przyjęcia ${t}`);
  const rescued = await seedReport(reporter, `Nie spam ${t}`, { status: 'spam' });
  const deleted = await seedReport(reporter, `Do usunięcia ${t}`);
  await openSignedIn(page, admin, '#/reports');

  let thread = await openReport(page, `Do przyjęcia ${t}`);
  await thread.getByLabel('Odpowiedź').fill('Dzięki, poprawię');
  await thread.getByRole('button', { name: 'Wyślij' }).click();
  await thread.getByRole('button', { name: 'Przyjmij' }).click();
  await expect(page.getByText('Przyjęto. Zgłaszający dostał dodatkowe zgłoszenie.')).toBeVisible();
  await expect.poll(async () => {
    const data = (await accepted.get()).data();
    return { status: data.status, bonusGranted: data.bonusGranted, messages: data.messages.map((m) => [m.text, m.isAdmin]) };
  }).toEqual({ status: 'accepted', bonusGranted: true, messages: [['Dzięki, poprawię', true]] });
  await thread.getByRole('button', { name: 'Zamknij' }).click();

  await page.getByRole('radio', { name: /^Spam/ }).check();
  thread = await openReport(page, `Nie spam ${t}`);
  await thread.getByRole('button', { name: 'To nie spam' }).click();
  await expect.poll(async () => (await rescued.get()).data().status).toBe('new');
  await thread.getByRole('button', { name: 'Zamknij' }).click();

  await page.getByRole('radio', { name: /^Nowe/ }).check();
  thread = await openReport(page, `Do usunięcia ${t}`);
  await thread.getByRole('button', { name: 'Usuń' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Usunąć to zgłoszenie na stałe?' });
  await confirm.getByRole('button', { name: 'Anuluj' }).click();
  expect((await deleted.get()).exists).toBe(true);
  await thread.getByRole('button', { name: 'Usuń' }).click();
  await confirm.getByRole('button', { name: 'Usuń' }).click();
  await expect.poll(async () => (await deleted.get()).exists).toBe(false);
});

test("the spam filter's words: added once, removed with undo", async ({ page }) => {
  const admin = await adminAccount();
  await db.doc('bugReportsConfig/keywords').set({ words: ['błąd', 'nie działa'] });
  await openSignedIn(page, admin, '#/reports');
  const words = page.getByRole('list', { name: 'Filtr spamu' });
  await expect(words.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Nowe słowo').fill('BŁĄD');
  await page.getByRole('button', { name: 'Dodaj słowo' }).click();
  await expect(page.getByText('To słowo już jest na liście.')).toBeVisible();
  await page.getByLabel('Nowe słowo').fill(' saldo ');
  await page.getByRole('button', { name: 'Dodaj słowo' }).click();
  await expect.poll(async () => (await db.doc('bugReportsConfig/keywords').get()).data().words).toEqual([
    'błąd',
    'nie działa',
    'saldo',
  ]);
  await words.getByRole('button', { name: 'Usuń słowo: błąd' }).click();
  await expect.poll(async () => (await db.doc('bugReportsConfig/keywords').get()).data().words).toEqual(['nie działa', 'saldo']);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect.poll(async () => (await db.doc('bugReportsConfig/keywords').get()).data().words).toEqual([
    'błąd',
    'nie działa',
    'saldo',
  ]);
});
