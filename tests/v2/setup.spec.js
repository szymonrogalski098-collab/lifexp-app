// First run and the account mode (docs/v2/PLAN.md 9, stage 4b) on the Firebase
// emulators: v2 asks v1's two first-run questions itself and writes v1's fields, so
// v1 then starts without asking again; going solo from Settings unlinks the parent
// exactly as v1 setAccountMode() does, after asking.
const { FieldValue } = require('firebase-admin/firestore');
const { createUser, db, openApp, serveCdnFromNpm } = require('../support/emulator');
const { test, expect, appUrl, openSignedIn, signIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** An account v1 created but whose first-run questions were never answered. */
async function newAccount(tag) {
  const account = await createUser({ tag });
  await db.doc(`users/${account.uid}`).update({
    accountMode: FieldValue.delete(),
    enabledModules: FieldValue.delete(),
    onboardingDone: FieldValue.delete(),
  });
  return account;
}

/** v2 before the shell exists: the login screen, then the first-run questions. */
async function signInToSetup(page, account) {
  await page.goto(appUrl('#/today'));
  await signIn(page, account);
  await expect(page.getByRole('heading', { name: 'Jak chcesz korzystać z LifeXP?' })).toBeVisible({ timeout: 15000 });
}

async function profileOf(uid) {
  return (await db.doc(`users/${uid}`).get()).data();
}

test('first run: account mode, then the modules, everything ticked until unticked', async ({ page }) => {
  const account = await newAccount('setup-first-run');
  await signInToSetup(page, account);
  const go = page.getByRole('button', { name: 'Kontynuuj' });
  await expect(go).toBeDisabled();
  await page.getByRole('radio', { name: /Nadzorowane/ }).check();
  await go.click();

  await expect(page.getByRole('heading', { name: 'Z czego chcesz korzystać?' })).toBeVisible();
  for (const name of ['Obowiązki', 'Pieniądze', 'Notatki', 'Statystyki XP', 'Gry', 'Ex-us']) {
    await expect(page.getByRole('switch', { name })).toBeChecked();
  }
  await page.getByRole('switch', { name: 'Gry' }).uncheck();
  await page.getByRole('button', { name: 'Zapisz i zacznij' }).click();
  await expect(page.getByTestId('today-points')).toBeVisible();

  const profile = await profileOf(account.uid);
  expect({
    accountMode: profile.accountMode,
    enabledModules: profile.enabledModules,
    disabledModules: profile.disabledModules,
    onboardingDone: profile.onboardingDone,
  }).toEqual({
    accountMode: 'supervised',
    enabledModules: ['chores', 'money', 'stats', 'notes', 'aichat'],
    disabledModules: ['games'],
    onboardingDone: true,
  });
});

test('going solo with a parent linked asks first, then unlinks the parent as v1 does', async ({ page }) => {
  const account = await createUser({
    tag: 'setup-solo',
    profile: {
      accountMode: 'supervised',
      parentEmail: 'rodzic@example.com',
      parentEmailVerifiedAt: new Date().toISOString(),
      autoReport: true,
    },
  });
  await openSignedIn(page, account, '#/settings/account');
  const solo = page.getByRole('radio', { name: 'Solo' });
  await expect(page.getByRole('radio', { name: 'Nadzorowane' })).toBeChecked();

  // The choice waits for the answer, so the radio does not move yet: click, not check.
  await solo.click();
  const dialog = page.getByRole('alertdialog', { name: 'Przełączyć na solo?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Anuluj' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('radio', { name: 'Nadzorowane' })).toBeChecked();
  expect((await profileOf(account.uid)).parentEmail).toBe('rodzic@example.com');

  await solo.click();
  await dialog.getByRole('button', { name: 'Przełącz na solo' }).click();
  await expect(page.getByText('Tryb konta zaktualizowany.')).toBeVisible();
  await expect.poll(() => profileOf(account.uid)).toMatchObject({ accountMode: 'solo', parentEmail: '', autoReport: false });
  expect(await profileOf(account.uid)).not.toHaveProperty('parentEmailVerifiedAt');

  // Without a parent there is nothing to unlink, so nothing is asked.
  await page.getByRole('radio', { name: 'Nadzorowane' }).check();
  await expect.poll(async () => (await profileOf(account.uid)).accountMode).toBe('supervised');
  await expect(dialog).toBeHidden();
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 starts without asking again after the first run in v2', async ({ page, context }) => {
    const account = await newAccount('setup-v2-to-v1');
    await signInToSetup(page, account);
    await page.getByRole('radio', { name: /Solo/ }).check();
    await page.getByRole('button', { name: 'Kontynuuj' }).click();
    await page.getByRole('switch', { name: 'Gry' }).uncheck();
    await page.getByRole('button', { name: 'Zapisz i zacznij' }).click();
    await expect.poll(async () => (await profileOf(account.uid)).onboardingDone).toBe(true);

    await serveCdnFromNpm(context);
    await openApp(page);
    await expect(page.locator('#account-mode-modal')).not.toHaveClass(/open/);
    await expect(page.locator('#onboarding-modal')).not.toHaveClass(/open/);
    await expect(page.locator('.sidebar .nav-item[data-page="chores"]')).toBeVisible();
    await expect(page.locator('.sidebar .nav-item[data-page="games"]')).toHaveCount(0);
  });
});
