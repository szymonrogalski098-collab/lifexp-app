// Notes (docs/v2/PLAN.md 9, stage 3a) on the Firebase emulators: the first v2 module
// that writes. Parity (PLAN.md 8.3): the same note written in v1 and in v2 is the
// same document once ids and timestamps are set aside, and each version shows what
// the other one saved.
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const notesOf = (uid) => db.collection(`users/${uid}/notes`);

/** The account's one note, once the write has reached the server (screens do not wait for it). */
async function onlyNote(uid) {
  await expect.poll(async () => (await notesOf(uid).get()).size).toBe(1);
  const snap = await notesOf(uid).get();
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

/** A note as v1 would compare it: no id, no creation time. */
function comparable(data) {
  const { createdAt, ...rest } = data;
  expect(typeof createdAt).toBe('string');
  expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
  return rest;
}

const TITLE = 'Zakupy';
const CONTENT = 'Na sobotę:\n- mleko\n- **chleb**';
const GREEN = '#4ecca3';

async function writeNoteInV2(page) {
  await page.getByRole('link', { name: 'Nowa notatka' }).click();
  await expect(page).toHaveURL(/#\/notes\/new$/);
  await page.getByLabel('Tytuł').fill(TITLE);
  await page.getByLabel('Treść').fill(CONTENT);
  await page.getByLabel('Zielony').check();
  await page.getByRole('button', { name: 'Zapisz' }).click();
}

test('a note written in v2 has v1\'s shape, gets its own address and shows as Markdown', async ({ page, account }) => {
  await openSignedIn(page, account, '#/notes');
  await expect(page.getByText('Brak notatek. Napisz pierwszą.')).toBeVisible();
  await writeNoteInV2(page);

  await expect(page.getByText('Notatka zapisana.')).toBeVisible();
  await expect(page).toHaveURL(/#\/notes\/[A-Za-z0-9]{20}$/);
  const { id, data } = await onlyNote(account.uid);
  expect(page.url()).toContain(id);
  expect(comparable(data)).toEqual({ title: TITLE, content: CONTENT, icon: '', color: GREEN, archived: false });

  // After saving, the content is shown rendered, not as the source.
  await expect(page.locator('.ui-markdown strong')).toHaveText('chleb');
  await expect(page.locator('.ui-markdown li')).toHaveCount(2);

  // Back from the note returns to the list (the "new" address was replaced).
  await page.goBack();
  await expect(page).toHaveURL(/#\/notes$/);
  const rows = page.getByRole('list', { name: 'Aktywne' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(TITLE);
  await expect(rows.first()).toContainText('Na sobotę: mleko chleb');
  await expect(page.getByText('1 z 30 aktywnych')).toBeVisible();
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('parity: v1 writes the same note document as v2', async ({ page, context }) => {
    const account = await createUser({ tag: 'notes-v1' });
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="notes"]');
    await page.click('#notes-fab');
    await page.fill('#note-title', TITLE);
    await page.fill('#note-content', CONTENT);
    await page.click(`#note-color-picker button[data-color="${GREEN}"]`);
    await page.click('#note-editor button[onclick="saveNote()"]');
    await expect(page.locator('#notes-list .note-item')).toHaveCount(1);

    const { data } = await onlyNote(account.uid);
    expect(comparable(data)).toEqual({ title: TITLE, content: CONTENT, icon: '', color: GREEN, archived: false });
  });

  test('v1 lists and opens a note that v2 wrote', async ({ page, context }) => {
    const account = await createUser({ tag: 'notes-v2-to-v1' });
    await openSignedIn(page, account, '#/notes');
    await writeNoteInV2(page);
    await expect(page.getByText('Notatka zapisana.')).toBeVisible();
    await onlyNote(account.uid);
    // v1 and v2 share the session: sign out, so v1's login form shows.
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="notes"]');
    const row = page.locator('#notes-list .note-item');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.ni-title')).toHaveText(TITLE);
    await row.click();
    await expect(page.locator('#note-title')).toHaveValue(TITLE);
    await expect(page.locator('#note-content')).toHaveValue(CONTENT);
  });
});

test('editing keeps v1\'s icon; archive, undo, restore and delete', async ({ page, account }) => {
  const ref = await notesOf(account.uid).add({
    title: 'Pomysły',
    content: 'pierwsza wersja',
    icon: 'ti-bulb',
    color: '#ff6b6b',
    createdAt: new Date('2026-09-01T10:00:00Z').toISOString(),
    archived: false,
  });

  await openSignedIn(page, account, '#/notes');
  await page.getByRole('link', { name: /Pomysły/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/notes/${ref.id}$`));
  await page.getByLabel('Tytuł').fill('Pomysły na weekend');
  await page.getByRole('radio', { name: 'Edytuj' }).check();
  await page.getByLabel('Treść').fill('druga wersja');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Notatka zapisana.')).toBeVisible();
  await expect
    .poll(async () => (await ref.get()).data())
    .toMatchObject({ title: 'Pomysły na weekend', content: 'druga wersja', icon: 'ti-bulb', color: '#ff6b6b' });

  // Archive, then undo from the toast.
  await page.getByRole('button', { name: 'Archiwizuj' }).click();
  await expect.poll(async () => (await ref.get()).data().archived).toBe(true);
  await expect(page.getByText('W archiwum')).toBeVisible();
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect.poll(async () => (await ref.get()).data().archived).toBe(false);

  // Archive again, find it in the archive, delete it for good.
  await page.getByRole('button', { name: 'Archiwizuj' }).click();
  await expect(page.getByRole('button', { name: 'Przywróć' })).toBeVisible();
  await page.getByRole('button', { name: 'Usuń trwale' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć tę notatkę na zawsze?' });
  await dialog.getByRole('button', { name: 'Usuń trwale' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  await expect(page.getByText('Notatka usunięta.')).toBeVisible();
  await expect.poll(async () => (await ref.get()).exists).toBe(false);

  // The deleted note's page is not in the history any more.
  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(ref.id));
});

test('a title is required; 30 active notes block a new one', async ({ page, account }) => {
  await openSignedIn(page, account, '#/notes/new');
  await page.getByLabel('Treść').fill('bez tytułu');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Nadaj notatce tytuł.')).toBeVisible();
  expect((await notesOf(account.uid).get()).size).toBe(0);

  const batch = db.batch();
  for (let i = 0; i < 30; i++) {
    batch.set(notesOf(account.uid).doc(), {
      title: `Notatka ${i}`,
      content: '',
      icon: '',
      color: '',
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      archived: false,
    });
  }
  await batch.commit();
  await page.goto(page.url().replace(/#.*$/, '#/notes'));
  await expect(page.getByText('30 z 30 aktywnych')).toBeVisible();
  await page.getByRole('link', { name: 'Nowa notatka' }).click();
  await expect(page.getByText('Limit osiągnięty: 30 notatek. Najpierw zarchiwizuj albo usuń którąś.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zapisz' })).toHaveCount(0);
});

test('Markdown is sanitised: no script, no event handlers', async ({ page, account }) => {
  const ref = await notesOf(account.uid).add({
    title: 'XSS',
    content: '**ok** <img src="x" onerror="window.__xss = 1"> <script>window.__xss = 2</script> [link](javascript:alert(1))',
    icon: '',
    color: '',
    createdAt: new Date().toISOString(),
    archived: false,
  });
  await openSignedIn(page, account, `#/notes/${ref.id}`);
  const body = page.locator('.ui-markdown');
  await expect(body.locator('strong')).toHaveText('ok');
  await expect(body.locator('script')).toHaveCount(0);
  await expect(body.locator('img')).not.toHaveAttribute('onerror', /.*/);
  await expect(body.locator('a')).not.toHaveAttribute('href', /javascript:/);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('"+" → Notatka opens a new note; Back returns to Today', async ({ page, account }) => {
  await openSignedIn(page, account, '#/today');
  await page.locator('.tabbar').getByRole('button', { name: 'Dodaj' }).click();
  await page.getByRole('dialog', { name: 'Dodaj' }).getByRole('button', { name: 'Notatka' }).click();
  await expect(page).toHaveURL(/#\/notes\/new$/);
  await expect(page.getByRole('dialog', { name: 'Dodaj' })).toBeHidden();
  await expect(page.getByLabel('Tytuł')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/today$/);
});
