// ui/ components through the #/ui gallery (docs/v2/PLAN.md 7.5, 7.7): behaviour
// that unit tests cannot see — themes switching live, amount entry, touch
// targets and iOS-safe font sizes. Runs against the built app (v2/dist).
const { test, expect } = require('../support/hermetic');

const GALLERY = '/v2/dist/index.html#/ui';

test.use({ viewport: { width: 390, height: 844 } });

async function openGallery(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(GALLERY);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Komponenty');
  await expect(page.getByLabel('Kwota')).toBeVisible(); // lazy chunk loaded
  return errors;
}

test('the gallery loads as its own chunk without errors', async ({ page }) => {
  const scripts = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(new URL(r.url()).pathname));
  const errors = await openGallery(page);
  expect(errors).toEqual([]);
  expect(scripts.some((s) => /GalleryPage-.*\.js$/.test(s))).toBe(true);
});

test('theme switch applies at once and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openGallery(page);
  const html = page.locator('html');

  await page.getByRole('radio', { name: 'iOS' }).check();
  await expect(html).toHaveAttribute('data-theme', 'ios');
  await expect(html).toHaveAttribute('data-mode', 'light'); // "Jak system" by default

  await page.getByRole('radio', { name: 'Gold' }).check();
  await expect(html).toHaveAttribute('data-theme', 'gold');
  await expect(page.getByRole('group', { name: 'Tryb' })).toHaveCount(0); // Gold is dark only

  await page.getByRole('radio', { name: 'LifeXP' }).check();
  await page.getByRole('radio', { name: 'Jasny' }).check();
  await expect(html).toHaveAttribute('data-mode', 'light');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'lifexp');
  await expect(html).toHaveAttribute('data-mode', 'light');
});

test('amount field: decimal keypad, grouping and comma accepted, normalised on blur', async ({ page }) => {
  await openGallery(page);
  const amount = page.getByLabel('Kwota');
  await expect(amount).toHaveAttribute('inputmode', 'decimal');

  await amount.fill('1 234,5');
  await expect(page.getByText('Saldo po operacji: 0,06 zł')).toBeVisible();
  await amount.blur();
  await expect(amount).toHaveValue('1234,50');

  await amount.fill('12,345');
  await amount.blur();
  await expect(page.getByRole('alert')).toHaveText('Wpisz kwotę, np. 12,50');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');

  await amount.fill('7.5');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('number field keeps digits only', async ({ page }) => {
  await openGallery(page);
  const minutes = page.getByLabel('Czas');
  await minutes.fill('');
  await minutes.pressSequentially('4a5-');
  await expect(minutes).toHaveValue('45');
});

test('progress bar exposes its value', async ({ page }) => {
  await openGallery(page);
  await expect(page.getByRole('progressbar', { name: 'Postęp celu' })).toHaveAttribute('aria-valuenow', '27');
});

test('controls are at least 44 px tall and inputs at least 16 px (no iOS zoom)', async ({ page }) => {
  await openGallery(page);
  const targets = page.locator('.ui-page button, .ui-page input:not([type=radio]), .ui-page select, .ui-segmented__label');
  const count = await targets.count();
  expect(count).toBeGreaterThan(10);
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    expect(box.height, await targets.nth(i).evaluate((el) => el.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
  }
  const fontSizes = await page.locator('.ui-page input, .ui-page select').evaluateAll((els) =>
    els.map((el) => parseFloat(getComputedStyle(el).fontSize)),
  );
  for (const size of fontSizes) expect(size).toBeGreaterThanOrEqual(16);
});
