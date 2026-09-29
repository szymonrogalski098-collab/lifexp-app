// Modal layers and toasts (docs/v2/PLAN.md 7.5, U12) through the #/ui gallery:
// every way out of a sheet, confirmation semantics, toast announcements.
const { test, expect, appUrl, openSignedIn } = require('../support/v2');
const PHONE = { width: 390, height: 844 };

async function openGallery(page, account) {
  await openSignedIn(page, account, '#/ui');
  await expect(page.getByRole('button', { name: 'Otwórz arkusz' })).toBeVisible();
}

const sheet = (page) => page.getByRole('dialog', { name: 'Nowy wydatek' });

async function openSheet(page) {
  await page.getByRole('button', { name: 'Otwórz arkusz' }).click();
  await expect(sheet(page)).toBeVisible();
  // Wait for the sheet's own entry animation (the gallery's skeleton pulses forever).
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

// The toast region; the gallery's loading skeleton is a status too.
const toastStatus = (page) => page.locator('.ui-toast-host').getByRole('status');

async function expectClosed(page) {
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

test.describe('sheet on a phone', () => {
  test.use({ viewport: PHONE });

  test('opens from the bottom as a modal; Zamknij closes and focus returns', async ({ page, account }) => {
    await openGallery(page, account);
    await openSheet(page);
    const box = await sheet(page).boundingBox();
    expect(box.y + box.height).toBeCloseTo(PHONE.height, 0); // anchored to the bottom edge
    expect(box.width).toBe(PHONE.width);

    await sheet(page).getByRole('button', { name: 'Zamknij' }).click();
    await expectClosed(page);
    await expect(page.getByRole('button', { name: 'Otwórz arkusz' })).toBeFocused();
  });

  test('Escape and the system Back close it without leaving the screen', async ({ page, account }) => {
    await openGallery(page, account);
    await openSheet(page);
    await page.keyboard.press('Escape');
    await expectClosed(page);

    await openSheet(page);
    await page.goBack();
    await expectClosed(page);
    await expect(page).toHaveURL(/#\/ui$/);
  });

  test('closing with its button leaves no dead history entry behind', async ({ page, context, account }) => {
    const reference = await context.newPage();
    await reference.goto(appUrl('#/ui'));
    const baseline = await reference.evaluate(() => history.length);

    await openGallery(page, account);
    await openSheet(page);
    await sheet(page).getByRole('button', { name: 'Zamknij' }).click();
    await expectClosed(page);
    // The entry added on open was consumed again (a forward entry may remain, but Back works once).
    await page.goBack();
    await expect(page).not.toHaveURL(/#\/ui$/);
    expect(baseline).toBeGreaterThan(0);
  });

  test('dragging the header: a short drag springs back, past a third closes', async ({ page, account }) => {
    await openGallery(page, account);
    await openSheet(page);
    const header = await sheet(page).locator('.ui-sheet__header').boundingBox();
    const x = header.x + 60;
    const y = header.y + header.height / 2;
    const height = (await sheet(page).boundingBox()).height;

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(x, y + i * 5);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(sheet(page)).toBeVisible();

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + height * 0.6, { steps: 10 });
    await page.mouse.up();
    await expectClosed(page);
  });

  test('saving shows a toast with an undo action', async ({ page, account }) => {
    await openGallery(page, account);
    await openSheet(page);
    const save = sheet(page).getByRole('button', { name: 'Zapisz' });
    await expect(save).toBeDisabled();
    await sheet(page).getByLabel('Kwota').fill('12,5');
    await save.click();
    await expectClosed(page);

    await expect(toastStatus(page)).toContainText('Zapisano wydatek 12,50 zł');
    await page.getByRole('button', { name: 'Cofnij' }).click();
    await expect(toastStatus(page)).toContainText('Cofnięto');
  });
});

test.describe('sheet on a wide screen', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('is a centred dialog', async ({ page, account }) => {
    await openGallery(page, account);
    await openSheet(page);
    const box = await sheet(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(560);
    expect(Math.abs(box.x + box.width / 2 - 512)).toBeLessThan(2);
    expect(box.y + box.height).toBeLessThan(768 - 40);
  });
});

test.describe('confirmation and toasts', () => {
  test.use({ viewport: PHONE });

  test('confirm dialog: cancel is the default, Escape cancels, confirm acts', async ({ page, account }) => {
    await openGallery(page, account);
    const trigger = page.getByRole('button', { name: 'Usuń notatkę' });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Usunąć notatkę?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription('Tej operacji nie da się cofnąć.');
    await expect(dialog.getByRole('button', { name: 'Anuluj' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(toastStatus(page)).not.toContainText('Usunięto');

    await trigger.click();
    await dialog.getByRole('button', { name: 'Usuń' }).click();
    await expect(dialog).toBeHidden();
    await expect(toastStatus(page)).toContainText('Usunięto notatkę');
  });

  test('errors are announced assertively and leave on their own', async ({ page, account }) => {
    await page.clock.install();
    await openGallery(page, account);
    await page.getByRole('button', { name: 'Pokaż błąd' }).click();
    const alert = page.locator('.ui-toast-host').getByRole('alert');
    await expect(alert).toContainText('Nie udało się zapisać');
    await page.clock.runFor(6100);
    await expect(alert).toBeEmpty();
  });
});
