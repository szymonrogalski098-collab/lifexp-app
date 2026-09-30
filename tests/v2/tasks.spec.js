// Tasks and the PC build (docs/v2/PLAN.md 9, stage 3a; GOLDEN G9) on the Firebase
// emulators. Parity (PLAN.md 8.3): v1 and v2 write the same task and build the
// same way; penalties and pieces follow G9 on real documents.
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** v1 dateISOLocal(): tasks use the device's calendar (G13). */
function localDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const tasksOf = (uid) => db.collection(`users/${uid}/todos`);
const userDoc = (uid) => db.doc(`users/${uid}`);

const ORDER = ['case', 'motherboard', 'gpu', 'cpu', 'psu', 'ram'];
function build(pieces, current) {
  return {
    componentOrder: ORDER,
    progress: Object.fromEntries(ORDER.map((c, i) => [c, pieces[i] ?? 0])),
    currentComponentIndex: current,
  };
}

function seedTask(uid, patch) {
  return tasksOf(uid).add({
    text: 'Zadanie',
    dueDate: localDay(0),
    size: 'S',
    done: false,
    createdAt: new Date().toISOString(),
    penaltyApplied: false,
    ...patch,
  });
}

async function onlyTask(uid) {
  await expect.poll(async () => (await tasksOf(uid).get()).size).toBe(1);
  return (await tasksOf(uid).get()).docs[0];
}

/** A task and a fresh build as v1 writes them, ids, times and the random order aside. */
async function comparableState(uid) {
  const { createdAt, ...task } = (await onlyTask(uid)).data();
  expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
  await expect.poll(async () => (await userDoc(uid).get()).data().pcBuild).toBeTruthy();
  const { componentOrder, progress, currentComponentIndex } = (await userDoc(uid).get()).data().pcBuild;
  return {
    task,
    firstTwo: componentOrder.slice(0, 2),
    rest: [...componentOrder.slice(2)].sort(),
    progress: Object.values(progress),
    currentComponentIndex,
  };
}

const TEXT = 'Wypracowanie z historii';
const expectedState = (due) => ({
  task: { text: TEXT, dueDate: due, size: 'M', done: false, penaltyApplied: false },
  firstTwo: ['case', 'motherboard'],
  rest: ['cpu', 'gpu', 'psu', 'ram'],
  progress: [0, 0, 0, 0, 0, 0],
  currentComponentIndex: 0,
});

test('the first task in v2: v1\'s task document and a new build with v1\'s rules', async ({ page, account }) => {
  const due = localDay(2);
  await openSignedIn(page, account, '#/tasks');
  await expect(page.getByText('Dodaj pierwsze zadanie, żeby zacząć budowę.')).toBeVisible();
  await page.getByRole('button', { name: 'Nowe zadanie' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowe zadanie' });
  await sheet.getByLabel('Co jest do zrobienia?').fill(TEXT);
  await sheet.getByLabel('Termin').fill(due);
  await sheet.getByRole('radio', { name: 'M · 2 kawałki' }).check();
  await expect(sheet.getByText(/Niewykonanie do .* odbierze kawałek budowy PC\./)).toBeVisible();
  await sheet.getByRole('button', { name: 'Dodaj zadanie' }).click();

  await expect(page.getByText('Zadanie zapisane.')).toBeVisible();
  expect(await comparableState(account.uid)).toEqual(expectedState(due));
  const open = page.getByRole('list', { name: 'Do zrobienia' }).getByRole('listitem');
  await expect(open).toHaveCount(1);
  await expect(open.first()).toContainText(TEXT);
  await expect(page.getByTestId('pc-status')).toHaveText('Budowane teraz: Obudowa');
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity: v1 writes the same first task and build', async ({ page, context }) => {
    const account = await createUser({ tag: 'tasks-v1' });
    const due = localDay(2);
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="notes"]');
    await page.click('#notes-tabs .seg-btn[data-tab="todos"]');
    await page.click('button[onclick="openTodoForm()"]');
    await page.fill('#todo-text', TEXT);
    await page.fill('#todo-due', due);
    await page.click('#todo-size-tabs .seg-btn[data-size="M"]');
    await page.click('#todo-form button[onclick="saveTodo()"]');
    await page.click('#confirm-modal-ok');
    expect(await comparableState(account.uid)).toEqual(expectedState(due));
  });

  test('parity: v1 applies the same overdue penalty as v2 (G9.4)', async ({ page, context }) => {
    const account = await createUser({ tag: 'tasks-penalty-v1', profile: { pcBuild: build([3, 3, 1], 2) } });
    const task = await seedTask(account.uid, { dueDate: localDay(-2) });
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="notes"]');
    await expect.poll(async () => (await task.get()).data().penaltyApplied).toBe(true);
    // v1 writes the task first and the build after it: wait for both.
    await expect.poll(async () => (await userDoc(account.uid).get()).data().pcBuild).toEqual(build([3, 2, 1], 2));
  });

  test('v1 lists a task that v2 wrote', async ({ page, context }) => {
    const account = await createUser({ tag: 'tasks-v2-to-v1' });
    await openSignedIn(page, account, '#/tasks/new');
    const sheet = page.getByRole('dialog', { name: 'Nowe zadanie' });
    await sheet.getByLabel('Co jest do zrobienia?').fill(TEXT);
    await sheet.getByLabel('Termin').fill(localDay(1));
    await sheet.getByRole('button', { name: 'Dodaj zadanie' }).click();
    await onlyTask(account.uid);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="notes"]');
    await page.click('#notes-tabs .seg-btn[data-tab="todos"]');
    await expect(page.locator('#todos-list .todo-item')).toHaveCount(1);
    await expect(page.locator('#todos-list .todo-item')).toContainText(TEXT);
  });
});

test('done in time: pieces go to the current component, the extra is lost (G9.2)', async ({ page }) => {
  const account = await createUser({ tag: 'tasks-done', profile: { pcBuild: build([2], 0) } });
  const task = await seedTask(account.uid, { text: 'Duże zadanie', size: 'L' });
  await openSignedIn(page, account, '#/tasks');
  await page.getByRole('button', { name: 'Oznacz jako zrobione: Duże zadanie' }).click();
  await expect(page.getByText('Nieźle — +3 kawałki do budowy.')).toBeVisible();
  expect((await task.get()).data().done).toBe(true);
  expect((await userDoc(account.uid).get()).data().pcBuild).toEqual(build([3, 0], 1));
  await expect(page.getByTestId('pc-status')).toHaveText('Budowane teraz: Płyta główna');
  await expect(page.getByRole('list', { name: 'Zrobione' }).getByRole('listitem')).toHaveCount(1);
});

test('done late: no pieces (G9.3); an overdue task is penalised once (G9.4, G9.5)', async ({ page }) => {
  const account = await createUser({ tag: 'tasks-late', profile: { pcBuild: build([3, 3, 1], 2) } });
  const overdue = await seedTask(account.uid, { text: 'Zaległe', dueDate: localDay(-3) });

  await openSignedIn(page, account, '#/tasks');
  await expect.poll(async () => (await overdue.get()).data().penaltyApplied).toBe(true);
  expect((await userDoc(account.uid).get()).data().pcBuild).toEqual(build([3, 2, 1], 2));
  await expect(page.getByRole('list', { name: 'Po terminie' }).getByRole('listitem')).toHaveCount(1);

  // Opening the list again does not penalise the same task twice.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Po terminie' })).toBeVisible();
  await page.waitForTimeout(500);
  expect((await userDoc(account.uid).get()).data().pcBuild).toEqual(build([3, 2, 1], 2));

  await page.getByRole('button', { name: 'Oznacz jako zrobione: Zaległe' }).click();
  await expect(page.getByText('Zrobione, ale po terminie — tym razem bez kawałków.')).toBeVisible();
  expect((await overdue.get()).data().done).toBe(true);
  expect((await userDoc(account.uid).get()).data().pcBuild).toEqual(build([3, 2, 1], 2));
});

test('edit keeps the rules; delete with undo brings the same task back', async ({ page, account }) => {
  const task = await seedTask(account.uid, { text: 'Stary opis', dueDate: localDay(3), size: 'S' });
  const original = (await task.get()).data();

  await openSignedIn(page, account, '#/tasks');
  await page.locator('.tasks-row__body--action', { hasText: 'Stary opis' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edytuj zadanie' });
  await sheet.getByLabel('Termin').fill(localDay(-1));
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sheet.getByText('Termin nie może być w przeszłości.')).toBeVisible();
  await sheet.getByLabel('Termin').fill(localDay(4));
  await sheet.getByLabel('Co jest do zrobienia?').fill('Nowy opis');
  await sheet.getByRole('button', { name: 'Zapisz' }).click();
  await expect(sheet).toBeHidden();
  await expect
    .poll(async () => (await task.get()).data())
    .toEqual({ ...original, text: 'Nowy opis', dueDate: localDay(4) });

  await page.locator('.tasks-row__body--action', { hasText: 'Nowy opis' }).click();
  await page.getByRole('dialog', { name: 'Edytuj zadanie' }).getByRole('button', { name: 'Usuń zadanie' }).click();
  await expect(page.getByText('Zadanie usunięte.')).toBeVisible();
  await expect.poll(async () => (await task.get()).exists).toBe(false);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect
    .poll(async () => (await task.get()).data())
    .toEqual({ ...original, text: 'Nowy opis', dueDate: localDay(4) });
});

test('30 tasks, done ones included, block a new one', async ({ page, account }) => {
  const batch = db.batch();
  for (let i = 0; i < 30; i++) {
    batch.set(tasksOf(account.uid).doc(), {
      text: `Zadanie ${i}`,
      dueDate: localDay(1),
      size: 'S',
      done: i < 20,
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      penaltyApplied: false,
    });
  }
  await batch.commit();
  await openSignedIn(page, account, '#/tasks');
  await expect(page.getByText('30 z 30 zadań')).toBeVisible();
  await page.getByRole('button', { name: 'Nowe zadanie' }).click();
  await expect(page.getByText('Limit osiągnięty: 30 zadań. Usuń zrobione, żeby dodać nowe.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Nowe zadanie' })).toHaveCount(0);
});

test('"+" → Zadanie opens the form over the task list', async ({ page, account }) => {
  await openSignedIn(page, account, '#/today');
  await page.locator('.tabbar').getByRole('button', { name: 'Dodaj' }).click();
  await page.getByRole('dialog', { name: 'Dodaj' }).getByRole('button', { name: 'Zadanie' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowe zadanie' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/#\/tasks$/);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/#\/tasks$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/today$/);
});
