// v2 login and boot gates (docs/v2/PLAN.md 9.1, stage 1e) on the Firebase
// emulators: the same accounts and session as v1, v1's gate order, and nothing
// written by v2 — whatever needs a write is handed over to v1.
const { auth, db, readyProfile, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, appUrl, signIn, openSignedIn } = require('../support/v2');

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE });

const loginHeading = (page) => page.getByRole('heading', { level: 1, name: 'Zaloguj się' });
const title = (page) => page.locator('.topbar__title');

let counter = 0;
/**
 * An account in any state. `profile` null = no users/{uid} document at all;
 * `without` drops fields of the ready profile (e.g. never chose an account mode).
 */
async function createAccount({ verified = true, profile = {}, without = [] } = {}) {
  counter += 1;
  const email = `v2-auth-${process.pid}-${Date.now()}-${counter}@test.lifexp`;
  const password = 'test-password-123';
  const user = await auth.createUser({ email, password, emailVerified: verified });
  if (profile) {
    const data = readyProfile({ email, ...profile });
    for (const key of without) delete data[key];
    await db.doc(`users/${user.uid}`).set(data);
  }
  return { uid: user.uid, email, password };
}

async function openMenu(page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
}

test.describe('login', () => {
  test('signed out, any screen shows the login; it keeps the link and adds no history', async ({ page, account }) => {
    await page.goto(appUrl('#/money'));
    await expect(loginHeading(page)).toBeVisible();
    await expect(page).toHaveTitle('Zaloguj się · LifeXP');
    await expect(page.getByRole('link', { name: 'Załóż je w obecnej wersji' })).toHaveAttribute('href', '../index.html');
    const historyLength = await page.evaluate(() => history.length);

    await signIn(page, account);
    await expect(title(page)).toHaveText('Pieniądze');
    await expect(page).toHaveURL(/#\/money$/);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  });

  test('empty fields and a wrong password get v1 messages, and the form stays usable', async ({ page, account }) => {
    await page.goto(appUrl('#/today'));
    await page.getByRole('button', { name: 'Zaloguj się' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wypełnij wszystkie pola.');

    await signIn(page, { email: account.email, password: 'not-the-password' });
    await expect(page.getByRole('alert')).toHaveText(/^(Nieprawidłowe hasło\.|Nieprawidłowy e-mail lub hasło\.)$/);
    await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeEnabled();

    await signIn(page, account);
    await expect(title(page)).toHaveText('Dziś');
  });

  // The Google popup itself needs Google's servers (apis.google.com), which tests never reach.
  test('Google sign-in that cannot start shows an error and leaves the form usable', async ({ page }) => {
    await page.route('https://apis.google.com/**', (route) => route.abort('internetdisconnected'));
    await page.goto(appUrl('#/today'));
    await page.getByRole('button', { name: 'Kontynuuj z Google' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wystąpił błąd. Spróbuj ponownie.');
    await expect(page.getByRole('button', { name: 'Kontynuuj z Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeEnabled();
  });

  test('the menu shows who is signed in; Wyloguj ends the session', async ({ page, account }) => {
    await openSignedIn(page, account);
    await openMenu(page);
    const menu = page.getByRole('region', { name: 'Konto' });
    await expect(menu).toContainText('Tester');
    await expect(menu).toContainText(account.email);

    await menu.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(loginHeading(page)).toBeVisible();
    await page.reload();
    await expect(loginHeading(page)).toBeVisible();
  });

  test('the profile language wins over the device, as in v1', async ({ page }) => {
    const account = await createAccount({ profile: { lang: 'en' } });
    await openSignedIn(page, account);
    await expect(title(page)).toHaveText('Today');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openMenu(page);
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('lifexp-lang'))).toBe('en');
  });
});

test.describe('one session with v1', () => {
  // v1 registers sw.js with scope ./, which would also cover /v2/; not what this checks.
  test.use({ serviceWorkers: 'block' });

  test('logged in to v1 means logged in to v2, and logging out of v2 logs out of v1', async ({ page, context, account }) => {
    await serveCdnFromNpm(context);
    await signInToApp(page, account);

    await page.goto(appUrl('#/today'));
    await expect(title(page)).toHaveText('Dziś');
    await expect(loginHeading(page)).toHaveCount(0);

    await openMenu(page);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(loginHeading(page)).toBeVisible();

    await page.goto('/app.html?emulator=1');
    await page.waitForURL('**/index.html');
  });
});

test.describe('gates handed over to v1', () => {
  test('an unverified e-mail goes to v1 verification, and v2 opens once the profile says verified', async ({ page }) => {
    const account = await createAccount({ verified: false, profile: { emailVerified: false } });
    await page.goto(appUrl('#/today'));
    await signIn(page, account);

    await expect(page.getByRole('heading', { name: 'Potwierdź adres e-mail' })).toBeVisible();
    await expect(page.getByText(account.email)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Potwierdź e-mail' })).toHaveAttribute('href', '../verify.html');

    // What v1's verify.html writes after the code; the profile is watched live.
    await db.doc(`users/${account.uid}`).update({ emailVerified: true });
    await expect(title(page)).toHaveText('Dziś');
  });

  test('a Google-style account verified only in Auth passes, without v2 writing it down', async ({ page }) => {
    const account = await createAccount({ verified: true, profile: { emailVerified: false } });
    await openSignedIn(page, account);
    await expect(title(page)).toHaveText('Dziś');
    expect((await db.doc(`users/${account.uid}`).get()).get('emailVerified')).toBe(false);
  });

  // Since stage 4b v2 asks v1's first-run questions itself (tests/v2/setup.spec.js).
  const UNFINISHED = [
    ['account mode never chosen', { without: ['accountMode'] }, 'Jak chcesz korzystać z LifeXP?'],
    ['module survey not done', { without: ['enabledModules', 'onboardingDone'] }, 'Z czego chcesz korzystać?'],
  ];
  for (const [state, options, question] of UNFINISHED) {
    test(`unfinished setup is asked in v2: ${state}`, async ({ page }) => {
      const account = await createAccount(options);
      await page.goto(appUrl('#/today'));
      await signIn(page, account);
      await expect(page.getByRole('heading', { name: question })).toBeVisible();
      await page.getByRole('button', { name: 'Wyloguj' }).click();
      await expect(loginHeading(page)).toBeVisible();
    });
  }

  test('no profile document yet (first Google sign-in) goes to v1, which creates it', async ({ page }) => {
    const account = await createAccount({ profile: null });
    await page.goto(appUrl('#/today'));
    await signIn(page, account);
    await expect(page.getByRole('heading', { name: 'Dokończ zakładanie konta' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dokończ w obecnej wersji' })).toHaveAttribute('href', '../app.html');
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(loginHeading(page)).toBeVisible();
    // v1 creates the profile on its next start; v2 never writes one.
    expect((await db.doc(`users/${account.uid}`).get()).exists).toBe(false);
  });
});
