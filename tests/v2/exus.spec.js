// Ex-us slash commands (docs/v2/PLAN.md 6, stage 5a) on the Firebase emulators:
// read and run locally, through the same services as the screens, no backend call.
const { createUser, db } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const tasksOf = async (uid) => (await db.collection(`users/${uid}/todos`).get()).docs.map((d) => d.data());

async function send(page, text) {
  await page.getByLabel('Wiadomość do Ex-us').fill(text);
  await page.getByRole('button', { name: 'Wyślij' }).click();
}

const log = (page) => page.getByRole('log', { name: 'Rozmowa z Ex-us' });

test('the menu opens Ex-us; /pomoc lists the commands, other text and unknown commands say what to do', async ({ page }) => {
  const account = await createUser({ tag: 'exus-help' });
  await openSignedIn(page, account, '#/today');
  await page.locator('.tabbar').getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Zapytaj Ex-us' }).click();
  await expect(page).toHaveURL(/#\/exus$/);
  await expect(log(page)).toContainText('Wpisz /pomoc');

  await send(page, '/pomoc');
  await expect(log(page)).toContainText('/zadanie <treść> <termin> [S/M/L] — Nowe zadanie');
  await expect(log(page)).toContainText('/dzis — Podsumowanie dnia');
  await send(page, 'odłóż 50 zł na rower');
  await expect(log(page)).toContainText('Rozmowa z AI dojdzie w następnym kroku.');
  await send(page, '/latanie');
  await expect(log(page)).toContainText('Nie znam komendy /latanie.');
});

test('/zadanie creates the task in any argument order; "Cofnij" takes it back', async ({ page }) => {
  const account = await createUser({ tag: 'exus-task' });
  await openSignedIn(page, account, '#/exus');
  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  await send(page, '/zadanie Kupić mleko');
  await expect(log(page)).toContainText('Brakuje: termin.');
  expect(await tasksOf(account.uid)).toEqual([]);

  await send(page, '/zadanie L jutro Kupić mleko');
  await expect(log(page)).toContainText('Dodano zadanie „Kupić mleko”');
  await expect.poll(() => tasksOf(account.uid)).toEqual([
    expect.objectContaining({ text: 'Kupić mleko', dueDate: tomorrow, size: 'L', done: false }),
  ]);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect(log(page)).toContainText('Cofnięto.');
  await expect.poll(() => tasksOf(account.uid)).toEqual([]);
});

test('/dzis sums the day up from the account', async ({ page }) => {
  const account = await createUser({
    tag: 'exus-today',
    profile: { points: { total: 1240, earnedAllTime: 1300, spentAllTime: 60 }, dailyLimit: 200 },
  });
  await openSignedIn(page, account, '#/exus');
  await send(page, '/dziś');
  await expect(log(page)).toContainText('dziś 0 z limitu 200');
  await expect(log(page)).toContainText('Zadania na dziś i zaległe: 0.');
});

test('with Ex-us off, the menu has no Ex-us and its address leads to Today', async ({ page }) => {
  const account = await createUser({ tag: 'exus-off', profile: { enabledModules: ['chores', 'money', 'stats', 'notes'] } });
  await openSignedIn(page, account, '#/exus');
  await expect(page).toHaveURL(/#\/today$/);
  await page.locator('.tabbar').getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('button', { name: 'Zapytaj Ex-us' })).toHaveCount(0);
});
