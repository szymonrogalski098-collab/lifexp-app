// Bug reports (docs/v2/PLAN.md 9, stage 4) on the Firebase emulators, against the
// real rules. Parity (PLAN.md 8.3): a report sent in v2 is the document v1 writes
// for the same input, and v1 lists it; replies use arrayUnion, so a reply written at
// the same time as another one keeps both (B13).
const { Timestamp } = require('firebase-admin/firestore');
const { FieldValue } = require('firebase-admin/firestore');
const { createUser, db, openApp, serveCdnFromNpm, signInToApp, todayUtcKey } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function reportsOf(uid) {
  const snap = await db.collection('bugReports').where('reporterUid', '==', uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** A report's fields without its id and time, as both apps write them. */
function written({ id, createdAt, ...rest }) {
  expect(createdAt).toBeInstanceOf(Timestamp);
  return rest;
}

async function fillReport(page, { title, area, description }) {
  await page.getByRole('button', { name: 'Zgłoś błąd' }).click();
  const sheet = page.getByRole('dialog', { name: 'Zgłoś błąd' });
  await sheet.getByLabel('Tytuł').fill(title);
  await sheet.getByLabel('Gdzie się zdarzyło?').selectOption({ label: area });
  await sheet.getByLabel('Opis').fill(description);
  return sheet;
}

const SALDO = { title: 'Saldo', area: 'Pieniądze', description: 'Saldo nie działa po wypłacie' };
const SALDO_DOC = (account) => ({
  reporterUid: account.uid,
  reporterName: 'Ola',
  title: 'Saldo',
  area: 'money',
  description: 'Saldo nie działa po wypłacie',
  status: 'new',
  messages: [],
});

test("a report is checked, sent with today's count, and then the day is used", async ({ page }) => {
  const account = await createUser({ tag: 'reports-send', profile: { name: 'Ola' } });
  await openSignedIn(page, account, '#/reports');
  await expect(page.getByText('Nie masz jeszcze zgłoszeń.')).toBeVisible();

  await page.getByRole('button', { name: 'Zgłoś błąd' }).click();
  const sheet = page.getByRole('dialog', { name: 'Zgłoś błąd' });
  await sheet.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(sheet.getByText('Wpisz tytuł.')).toBeVisible();
  await sheet.getByLabel('Tytuł').fill(SALDO.title);
  await sheet.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(sheet.getByText('Wybierz, gdzie się zdarzyło.')).toBeVisible();
  await sheet.getByLabel('Gdzie się zdarzyło?').selectOption({ label: SALDO.area });
  await sheet.getByLabel('Opis').fill(SALDO.description);
  await expect(sheet.getByText('28 / 400')).toBeVisible();
  await sheet.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(page.getByText('Zgłoszenie wysłane. Dzięki!')).toBeVisible();
  await expect(sheet).toBeHidden();

  const list = page.getByRole('list', { name: 'Moje zgłoszenia' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem')).toContainText('Saldo');
  await expect(list.getByRole('listitem')).toContainText('Nowe');
  await expect.poll(async () => (await reportsOf(account.uid)).map(written)).toEqual([SALDO_DOC(account)]);
  const { lastBugReportAt } = (await db.doc(`users/${account.uid}`).get()).data();
  expect(lastBugReportAt.slice(0, 10)).toBe(todayUtcKey());

  await expect(page.getByText('Dzisiejsze zgłoszenie już wysłane. Następne możesz wysłać jutro.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zgłoś błąd' })).toBeDisabled();
});

test("without any of the admin's words it goes to spam, which the reporter sees as under review", async ({ page }) => {
  const account = await createUser({ tag: 'reports-spam' });
  await db.doc('bugReportsConfig/keywords').set({ words: ['nie działa', 'błąd'] });
  await openSignedIn(page, account, '#/reports');
  const sheet = await fillReport(page, { title: 'Hej', area: 'Inne', description: 'Fajna apka' });
  await sheet.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(page.getByRole('list', { name: 'Moje zgłoszenia' }).getByRole('listitem')).toContainText('Sprawdzane');
  await expect.poll(async () => (await reportsOf(account.uid)).map((r) => r.status)).toEqual(['spam']);
});

test("an accepted report's bonus sends one more today, and is then spent", async ({ page }) => {
  const sentToday = `${todayUtcKey()}T08:00:00.000Z`;
  const account = await createUser({ tag: 'reports-bonus', profile: { name: 'Ola', lastBugReportAt: sentToday } });
  await db.collection('bugReports').doc(`bonus-${account.uid}`).set({
    reporterUid: account.uid,
    reporterName: 'Ola',
    title: 'Stare',
    area: 'other',
    description: 'Przycisk nie działa',
    status: 'accepted',
    messages: [],
    createdAt: Timestamp.fromDate(new Date(Date.now() - 86400000)),
    bonusGranted: true,
  });
  await openSignedIn(page, account, '#/reports');
  await expect(page.getByText('Dzisiejsze zgłoszenie już wysłane, ale masz dodatkowe za przyjęte zgłoszenie.')).toBeVisible();
  const sheet = await fillReport(page, SALDO);
  await sheet.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(page.getByText('Zgłoszenie wysłane. Dzięki!')).toBeVisible();
  await expect.poll(async () => (await db.doc(`bugReports/bonus-${account.uid}`).get()).data().bonusUsed).toBe(true);
  expect((await db.doc(`users/${account.uid}`).get()).data().lastBugReportAt).toBe(sentToday);
  await expect(page.getByRole('button', { name: 'Zgłoś błąd' })).toBeDisabled();
});

test('a new message from the admin is marked, read in the thread, and a reply keeps a message written meanwhile (B13)', async ({ page }) => {
  const account = await createUser({ tag: 'reports-thread' });
  const ref = db.collection('bugReports').doc(`thread-${account.uid}`);
  await ref.set({
    reporterUid: account.uid,
    reporterName: 'Ola',
    title: 'Saldo',
    area: 'money',
    description: 'Saldo nie działa',
    status: 'new',
    messages: [{ text: 'Na którym ekranie?', isAdmin: true, at: '2026-10-02T10:00:00.000Z' }],
    createdAt: Timestamp.now(),
  });
  await openSignedIn(page, account, '#/reports');
  const row = page.getByRole('list', { name: 'Moje zgłoszenia' }).getByRole('listitem');
  await expect(row).toContainText('Nowa wiadomość');
  await row.getByRole('button').click();
  const thread = page.getByRole('dialog', { name: 'Saldo' });
  await expect(thread.getByText('Na którym ekranie?')).toBeVisible();

  // The admin writes again while the thread is open; the reply must not drop it.
  await ref.update({ messages: FieldValue.arrayUnion({ text: 'I kiedy?', isAdmin: true, at: '2026-10-02T10:05:00.000Z' }) });
  await thread.getByLabel('Odpowiedź').fill('Na Pieniądzach');
  await thread.getByRole('button', { name: 'Wyślij' }).click();
  await expect(thread.getByText('Na Pieniądzach')).toBeVisible();
  await expect
    .poll(async () => (await ref.get()).data().messages.map((m) => [m.text, m.isAdmin]))
    .toEqual([
      ['Na którym ekranie?', true],
      ['I kiedy?', true],
      ['Na Pieniądzach', false],
    ]);
  await thread.getByRole('button', { name: 'Zamknij' }).click();
  await expect(row).not.toContainText('Nowa wiadomość');
  // Read marks live under v1's key, so v1 on this device counts it read too.
  const marks = await page.evaluate(() => JSON.parse(localStorage.getItem('lifexp-bug-read') || '{}'));
  expect(marks[`thread-${account.uid}`]).toBeTruthy();
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 lists a report sent in v2', async ({ page, context }) => {
    const account = await createUser({ tag: 'reports-v2-to-v1', profile: { name: 'Ola' } });
    await openSignedIn(page, account, '#/reports');
    const sheet = await fillReport(page, SALDO);
    await sheet.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
    await expect.poll(async () => (await reportsOf(account.uid)).length).toBe(1);
    await serveCdnFromNpm(context);
    await openApp(page);
    await page.evaluate(() => window.showPage('report-bug'));
    await expect(page.locator('#my-bug-reports')).toContainText('Saldo');
  });

  test('parity: v1 sends the same report as the same document', async ({ page, context }) => {
    const account = await createUser({ tag: 'reports-v1', profile: { name: 'Ola' } });
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.evaluate(() => window.showPage('report-bug'));
    await page.fill('#bug-title', SALDO.title);
    await page.selectOption('#bug-area', 'money');
    await page.fill('#bug-desc', SALDO.description);
    await page.click('#bug-submit-btn');
    await expect.poll(async () => (await reportsOf(account.uid)).map(written)).toEqual([SALDO_DOC(account)]);
    const { lastBugReportAt } = (await db.doc(`users/${account.uid}`).get()).data();
    expect(lastBugReportAt.slice(0, 10)).toBe(todayUtcKey());
  });
});
