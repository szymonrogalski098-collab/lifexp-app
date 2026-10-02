// Modal layers on a phone (ui/components/useModal.ts), after the owner's report that
// buttons sometimes stopped working until a reload (2026-10-02).
const { devices } = require('@playwright/test');
const { test, expect, openSignedIn } = require('../support/v2');

const { defaultBrowserType, ...pixel } = devices['Pixel 7'];
test.use({ ...pixel, serviceWorkers: 'block' });

test('a sheet the browser closes by itself (Android Back) opens again', async ({ page, account }) => {
  await openSignedIn(page, account, '#/today');
  const plus = page.locator('.tabbar').getByRole('button', { name: 'Dodaj' });
  const sheet = page.getByRole('dialog', { name: 'Dodaj' });
  await plus.tap();
  await expect(sheet).toBeVisible();
  // What Chrome's close watcher does on Back when the page may not stop it.
  await sheet.evaluate((dialog) => dialog.close());
  await expect(sheet).toBeHidden();
  await plus.tap();
  await expect(sheet).toBeVisible();
  // Its history entry went with it: one Back closes the sheet, the next leaves Today.
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/#\/today$/);
});

test('a tap during the exit animation does not land on the sheet sliding away', async ({ page, account }) => {
  await openSignedIn(page, account, '#/today');
  const plus = page.locator('.tabbar').getByRole('button', { name: 'Dodaj' });
  const sheet = page.getByRole('dialog', { name: 'Dodaj' });
  await plus.tap();
  await expect(sheet).toBeVisible();
  const box = await plus.boundingBox();
  await sheet.getByRole('button', { name: 'Zamknij' }).tap();
  // Where "+" is, the sheet's "Dodaj w obecnej wersji" link was still passing by.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/v2\/dist\/index\.html.*#\/today$/);
  await plus.tap();
  await expect(sheet).toBeVisible();
});
