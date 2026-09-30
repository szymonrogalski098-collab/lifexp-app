// Helpers for the v2 browser tests (tests/v2). v2 opens only for a signed-in,
// set-up account, so these specs run against the Firebase emulators (started by
// `npm run test:v2`) and sign in through the real login screen, like a person.
const { test: hermetic, expect } = require('./hermetic');
const { createUser } = require('./emulator');

/**
 * v2 on the emulators. The flag is remembered per tab (sessionStorage), and a
 * fresh page never has it, so every goto carries it.
 */
function appUrl(hash = '') {
  return `/v2/dist/index.html?emulator=1${hash}`;
}

const test = hermetic.extend({
  // v2's Service Worker stays out of the way; tests/v2/offline.spec.js turns it on.
  serviceWorkers: 'block',
  /** A ready account (verified, set up in v1) for this test only. */
  account: async ({}, use) => {
    await use(await createUser({ tag: 'v2' }));
  },
});

async function signIn(page, { email, password }) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Hasło').fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

/**
 * Open v2 at `hash` as `account`. The first page of a test logs in; later pages
 * share the session through IndexedDB, as tabs of a real browser do. Login keeps
 * the URL, so it adds no history entry.
 */
async function openSignedIn(page, account, hash = '#/today') {
  await page.goto(appUrl(hash));
  const login = page.getByRole('button', { name: 'Zaloguj się' });
  const shell = page.locator('.shell');
  await expect(login.or(shell)).toBeVisible({ timeout: 15000 });
  if (await login.isVisible()) await signIn(page, account);
  await expect(shell).toBeVisible({ timeout: 15000 });
}

module.exports = { test, expect, appUrl, signIn, openSignedIn };
