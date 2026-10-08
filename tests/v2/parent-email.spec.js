// The parent's e-mail and the weekly report (docs/v2/PLAN.md 9, stage 4g; v1
// settings.js) on the Firebase emulators. EmailJS is answered by the test, so
// nothing leaves the machine; a real e-mail is for the owner to check.
const { createUser, db, openApp, serveCdnFromNpm } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const EMAILJS = 'https://api.emailjs.com/api/v1.0/email/send';

/** Answers EmailJS with `status` and keeps what was sent. */
async function fakeEmailJs(page, status = 200) {
  const sent = [];
  await page.route(EMAILJS, async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status, body: status === 200 ? 'OK' : 'Bad request' });
  });
  return sent;
}

const supervised = (tag, profile = {}) => createUser({ tag, profile: { name: 'Ola', accountMode: 'supervised', ...profile } });
const profileOf = async (uid) => (await db.doc(`users/${uid}`).get()).data();

test('solo accounts have no parent section', async ({ page }) => {
  const account = await createUser({ tag: 'parent-solo' });
  await openSignedIn(page, account, '#/settings/account');
  await expect(page.getByRole('heading', { name: 'Tryb konta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E-mail rodzica' })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Raport tygodniowy' })).toHaveCount(0);
});

test('a code goes to the address, the right code verifies it, and the report is turned on', async ({ page }) => {
  const account = await supervised('parent-verify');
  const sent = await fakeEmailJs(page);
  await openSignedIn(page, account, '#/settings/account');

  await page.getByLabel('Adres rodzica').fill('mama@poczta');
  await page.getByRole('button', { name: 'Wyślij kod' }).click();
  await expect(page.getByText('Wpisz poprawny adres e-mail.')).toBeVisible();
  expect(sent).toHaveLength(0);

  await page.getByLabel('Adres rodzica').fill(' mama@poczta.pl ');
  await page.getByRole('button', { name: 'Wyślij kod' }).click();
  await expect(page.getByText('Kod poszedł na mama@poczta.pl. Jest ważny 10 minut.')).toBeVisible();
  // v1's EmailJS request, word for word.
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    service_id: 'service_417sg11',
    template_id: 'template_f2b4jeo',
    user_id: '1vFk29QDNKopU0RnJ',
    template_params: { to_email: 'mama@poczta.pl', user_name: 'Ola' },
  });
  const code = sent[0].template_params.code;
  expect(code).toMatch(/^\d{6}$/);
  await expect.poll(async () => (await profileOf(account.uid)).parentEmailCode).toBe(code);
  const pending = await profileOf(account.uid);
  expect(pending.pendingParentEmail).toBe('mama@poczta.pl');
  expect(pending.parentEmailCodeExpiry).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

  await page.getByLabel('Kod z e-maila').fill(code === '123456' ? '654321' : '123456');
  await page.getByRole('button', { name: 'Potwierdź' }).click();
  await expect(page.getByText('To nie ten kod.')).toBeVisible();
  await page.getByLabel('Kod z e-maila').fill(code);
  await page.getByRole('button', { name: 'Potwierdź' }).click();
  await expect(page.getByText('Potwierdzony adres: mama@poczta.pl')).toBeVisible();
  await expect.poll(async () => (await profileOf(account.uid)).parentEmailVerifiedAt).toBeTruthy();
  const verified = await profileOf(account.uid);
  expect(verified.parentEmail).toBe('mama@poczta.pl');
  expect(typeof verified.parentEmailVerifiedAt).toBe('string');
  for (const gone of ['pendingParentEmail', 'parentEmailCode', 'parentEmailCodeExpiry']) expect(verified).not.toHaveProperty(gone);

  const report = page.getByRole('switch', { name: 'Raport tygodniowy' });
  await expect(page.getByText('Co tydzień na mama@poczta.pl.')).toBeVisible();
  await report.check();
  await expect.poll(async () => (await profileOf(account.uid)).autoReport).toBe(true);
});

test('a failed send saves nothing and says so', async ({ page }) => {
  const account = await supervised('parent-send-fails');
  const sent = await fakeEmailJs(page, 400);
  await openSignedIn(page, account, '#/settings/account');
  await page.getByLabel('Adres rodzica').fill('mama@poczta.pl');
  await page.getByRole('button', { name: 'Wyślij kod' }).click();
  await expect(page.getByText('Nie udało się wysłać kodu. Sprawdź połączenie i spróbuj ponownie.')).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(await profileOf(account.uid)).not.toHaveProperty('pendingParentEmail');
});

test('an expired code is refused; cancelling clears it', async ({ page }) => {
  const account = await supervised('parent-expired', {
    pendingParentEmail: 'tata@poczta.pl',
    parentEmailCode: '123456',
    parentEmailCodeExpiry: Date.now() - 1000,
  });
  await openSignedIn(page, account, '#/settings/account');
  await page.getByLabel('Kod z e-maila').fill('123456');
  await page.getByRole('button', { name: 'Potwierdź' }).click();
  await expect(page.getByText('Kod wygasł. Anuluj i wyślij nowy.')).toBeVisible();
  await page.getByRole('button', { name: 'Anuluj' }).click();
  await expect(page.getByLabel('Adres rodzica')).toBeVisible();
  await expect.poll(async () => Object.keys(await profileOf(account.uid)).filter((k) => k.startsWith('pending') || k.startsWith('parentEmailCode'))).toEqual([]);
});

test('an address saved before codes is asked to be verified again', async ({ page }) => {
  const account = await supervised('parent-legacy', { parentEmail: 'mama@poczta.pl' });
  await openSignedIn(page, account, '#/settings/account');
  await expect(page.getByText(/zanim adresy potwierdzało się kodem/)).toBeVisible();
  await expect(page.getByLabel('Adres rodzica')).toHaveValue('mama@poczta.pl');
  await expect(page.getByText('Najpierw potwierdź e-mail rodzica, inaczej raport nie wyjdzie.')).toBeVisible();
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('v1 shows an address verified in v2 as verified', async ({ page, context }) => {
    const account = await supervised('parent-v2-to-v1');
    const sent = await fakeEmailJs(page);
    await openSignedIn(page, account, '#/settings/account');
    await page.getByLabel('Adres rodzica').fill('mama@poczta.pl');
    await page.getByRole('button', { name: 'Wyślij kod' }).click();
    await page.getByLabel('Kod z e-maila').fill(sent[0].template_params.code);
    await page.getByRole('button', { name: 'Potwierdź' }).click();
    await expect(page.getByText('Potwierdzony adres: mama@poczta.pl')).toBeVisible();

    await serveCdnFromNpm(context);
    await openApp(page);
    await page.click('.sidebar .nav-item[data-page="settings"]');
    await expect(page.locator('#parent-email-verified-addr')).toHaveText('mama@poczta.pl');
    await expect(page.locator('#parent-email-verified-row')).not.toHaveCSS('display', 'none');
  });
});
