// Messages to everyone and the history of updates (docs/v2/PLAN.md 9, stage 4) on the
// Firebase emulators. The admin sends from v2 (the rules decide who the admin is);
// everyone sees each message once as a banner, in v2 and in v1 alike, because both
// remember shown messages under the same key.
const { Timestamp } = require('firebase-admin/firestore');
const { adminAccount } = require('../support/admin');
const { createUser, db, openApp, serveCdnFromNpm } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
// broadcasts is one collection for everyone: these tests take turns, and each starts
// with the earlier messages already seen, so only its own one is in line.
test.describe.configure({ mode: 'serial' });

// Each test's messages are gone right after it, or other tests' accounts would get
// them as banners. Only its own (by their unique text), so tests never clean up each other.
let texts = [];
function own(prefix) {
  const text = `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  texts.push(text);
  return text;
}
test.afterEach(async () => {
  const mine = texts;
  texts = [];
  for (const text of mine) for (const b of await broadcastsWith(text)) await db.doc(`broadcasts/${b.id}`).delete();
});

async function ignoreEarlierBroadcasts(page) {
  const ids = (await db.collection('broadcasts').get()).docs.map((d) => d.id);
  await page.addInitScript((seen) => {
    if (!localStorage.getItem('lifexp-seen-broadcasts')) localStorage.setItem('lifexp-seen-broadcasts', JSON.stringify(seen));
  }, ids);
}

async function broadcastsWith(text) {
  const snap = await db.collection('broadcasts').where('text', '==', text).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

test('the admin sends a message from v2; it shows once, live, for its seconds', async ({ browser, page }) => {
  const admin = await adminAccount();
  const text = own('Nowa wersja');
  await openSignedIn(page, admin, '#/reports');
  await page.getByRole('link', { name: 'Wiadomości' }).click();
  await page.getByRole('button', { name: 'Wyślij do wszystkich' }).click();
  await expect(page.getByText('Wpisz wiadomość.')).toBeVisible();
  await page.getByLabel('Treść').fill(text);
  await page.getByLabel('Czas na ekranie').fill('3');
  await page.getByRole('button', { name: 'Wyślij do wszystkich' }).click();
  await expect(page.getByText('Wiadomość wysłana.')).toBeVisible();
  await expect.poll(async () => (await broadcastsWith(text)).map(({ durationSec, createdAt }) => [durationSec, createdAt instanceof Timestamp])).toEqual([[3, true]]);
  await expect(page.getByRole('list', { name: 'Wysłane' })).toContainText(text);
});

test('a message shows as a banner once per device, and a person who is not the admin cannot send', async ({ page }) => {
  const account = await createUser({ tag: 'broadcast-viewer' });
  const text = own('Przerwa techniczna');
  await ignoreEarlierBroadcasts(page);
  const ref = await db.collection('broadcasts').add({ text, durationSec: 2, createdAt: Timestamp.now() });
  await openSignedIn(page, account, '#/today');
  const banner = page.getByRole('status').filter({ hasText: text });
  // Messages sent just before (another test) go first, oldest first, as in v1.
  await expect(banner).toBeVisible({ timeout: 20000 });
  await expect(banner).toBeHidden({ timeout: 6000 });
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('lifexp-seen-broadcasts') || '[]'));
  expect(seen).toContain(ref.id);
  await page.reload();
  await expect(page.getByTestId('today-points')).toBeVisible();
  await expect(page.getByText(text)).toHaveCount(0);

  // Not the admin: no Messages view, and the rules refuse a write.
  await page.goto(page.url().replace(/#.*$/, '#/reports'));
  await expect(page.getByRole('link', { name: 'Aktualizacje' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wiadomości' })).toHaveCount(0);
  await page.goto(page.url().replace(/#.*$/, '#/reports/broadcasts'));
  await expect(page.getByRole('button', { name: 'Zgłoś błąd' })).toBeVisible();
});

test("a message sent while the app is open shows at once, and 'Zamknij' ends it", async ({ page }) => {
  const account = await createUser({ tag: 'broadcast-live' });
  await ignoreEarlierBroadcasts(page);
  await openSignedIn(page, account, '#/today');
  const text = own('Na żywo');
  await db.collection('broadcasts').add({ text, durationSec: 10, createdAt: Timestamp.now() });
  const banner = page.getByRole('status').filter({ hasText: text });
  // Messages sent just before (another test) go first, oldest first, as in v1.
  await expect(banner).toBeVisible({ timeout: 20000 });
  await banner.getByRole('button', { name: 'Zamknij' }).click();
  await expect(banner).toBeHidden();
});

test("the history of updates lists v1's changelog in the app's language", async ({ page }) => {
  const account = await createUser({ tag: 'updates' });
  await openSignedIn(page, account, '#/reports/updates');
  await expect(page.getByRole('heading', { name: 'Wersja 2026.08.20' })).toBeVisible();
  await expect(page.getByText(/telefon czasem wchodził w przypadkowy zoom/)).toBeVisible();
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a message shown in v2 is not shown again in v1', async ({ page, context }) => {
    const account = await createUser({ tag: 'broadcast-v2-v1' });
    const text = own('Raz');
    await ignoreEarlierBroadcasts(page);
    await db.collection('broadcasts').add({ text, durationSec: 1, createdAt: Timestamp.now() });
    await openSignedIn(page, account, '#/today');
    const banner = page.getByRole('status').filter({ hasText: text });
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toBeHidden({ timeout: 5000 });
    await serveCdnFromNpm(context);
    await openApp(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('#broadcast-banner')).not.toHaveClass(/show/);
  });
});
