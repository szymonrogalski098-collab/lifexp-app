// v2 app shell (docs/v2/PLAN.md 7.3, 7.4, 7.7): drawer behaviour, sidebar,
// themes and layout guarantees. Runs against the built app in v2/dist, signed in
// on the Firebase emulators: `npm run test:v2` builds and starts them.
const { test, expect, appUrl, openSignedIn } = require('../support/v2');
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function openApp(page, account, hash = '#/today') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSignedIn(page, account, hash);
  await expect(page.locator('.topbar__title')).toBeVisible();
  return errors;
}

const menuButton = (page) => page.getByRole('button', { name: 'Menu' });
const drawer = (page) => page.locator('#app-nav');

async function waitForDrawer(page, state) {
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', state);
  // Let the slide animation finish before measuring.
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

test.describe('phone: drawer', () => {
  test.use({ viewport: PHONE });

  test('starts on Today with the drawer closed', async ({ page, account }) => {
    const errors = await openApp(page, account, '');
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.locator('.topbar__title')).toHaveText('Dziś');
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer(page)).not.toHaveAttribute('role', 'dialog');
    expect(errors).toEqual([]);
  });

  test('Menu opens a modal drawer: content slides right, focus moves into the menu', async ({ page, account }) => {
    await openApp(page, account);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');

    await expect(drawer(page)).toHaveAttribute('role', 'dialog');
    await expect(drawer(page)).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.nav__link').first()).toBeFocused();
    expect(await page.locator('.shell__content').evaluate((el) => el.inert)).toBe(true);

    // ChatGPT model: the content card moves ~82 % of the width and gets a rounded edge.
    const box = await page.locator('.shell__content').boundingBox();
    expect(box.x).toBeCloseTo(PHONE.width * 0.82, 0);
    const radius = await page.locator('.shell__content').evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(radius).toBe('28px');
  });

  test('a tap opens from rest; a released drag keeps the finger speed', async ({ page, account }) => {
    await openApp(page, account);
    const easing = () => page.locator('.shell__content').evaluate((el) => getComputedStyle(el).transitionTimingFunction);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    await expect(page.locator('.shell')).toHaveAttribute('data-motion', 'tap');
    expect(await easing()).toBe('cubic-bezier(0.2, 0, 0, 1)'); // initial slope 0: no jump

    await page.mouse.move(PHONE.width - 30, PHONE.height / 2);
    await page.mouse.down();
    await page.mouse.move(PHONE.width - 280, PHONE.height / 2, { steps: 12 });
    await page.mouse.up();
    await waitForDrawer(page, 'closed');
    await expect(page.locator('.shell')).toHaveAttribute('data-motion', 'settle');
    expect(await easing()).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
  });

  test('Escape closes and returns focus to Menu', async ({ page, account }) => {
    await openApp(page, account);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    await page.keyboard.press('Escape');
    await waitForDrawer(page, 'closed');
    await expect(menuButton(page)).toBeFocused();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    expect((await page.locator('.shell__content').boundingBox()).x).toBe(0);
  });

  test('system Back closes the drawer and stays on the screen', async ({ page, account }) => {
    await openApp(page, account);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    await page.goBack();
    await waitForDrawer(page, 'closed');
    await expect(page).toHaveURL(/#\/today$/);
  });

  test('choosing a module navigates and closes; Back returns to the previous screen, not the drawer', async ({ page, account }) => {
    await openApp(page, account);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    await page.getByRole('link', { name: 'Zadania' }).click();
    await waitForDrawer(page, 'closed');
    await expect(page).toHaveURL(/#\/tasks$/);
    await expect(page.locator('.topbar__title')).toHaveText('Zadania');
    await expect(page).toHaveTitle('Zadania · LifeXP');

    await page.goBack();
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
  });

  test('a tap on the revealed card closes the drawer', async ({ page, account }) => {
    await openApp(page, account);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    await page.mouse.click(PHONE.width - 20, PHONE.height / 2);
    await waitForDrawer(page, 'closed');
  });

  test('dragging the card: past half closes, a short slow drag springs back', async ({ page, account }) => {
    await openApp(page, account);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    const y = PHONE.height / 2;
    const startX = PHONE.width - 30;

    // Short and slow (10 steps over ~40 px): stays open.
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(startX - i * 4, y);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(150); // stop before lifting: no flick
    await page.mouse.up();
    await waitForDrawer(page, 'open');

    // Far past the middle: closes.
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - 250, y, { steps: 12 });
    await page.mouse.up();
    await waitForDrawer(page, 'closed');
  });

  test('in the installed app a swipe from the left edge opens the drawer', async ({ page, account }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await openApp(page, account);
    const y = PHONE.height / 2;
    await page.mouse.move(5, y);
    await page.mouse.down();
    await page.mouse.move(260, y, { steps: 12 });
    await page.mouse.up();
    await waitForDrawer(page, 'open');
  });

  test('in a browser tab the left edge is left to the system Back gesture', async ({ page, account }) => {
    await openApp(page, account);
    await expect(page.locator('.shell__edge')).toHaveCount(0);
  });

  test('menu entries and the Menu button are at least 44×44 px', async ({ page, account }) => {
    await openApp(page, account);
    const menu = await menuButton(page).boundingBox();
    expect(menu.width).toBeGreaterThanOrEqual(44);
    expect(menu.height).toBeGreaterThanOrEqual(44);
    await menuButton(page).click();
    await waitForDrawer(page, 'open');
    for (const target of await page.locator('#app-nav a, #app-nav button').all()) {
      const box = await target.boundingBox();
      expect(box.height, await target.textContent()).toBeGreaterThanOrEqual(44);
    }
  });

  test('an unknown route falls back to Today without a history entry', async ({ page, context, account }) => {
    const direct = await context.newPage();
    await openApp(direct, account, '#/today');
    const expectedLength = await direct.evaluate(() => history.length);

    await openApp(page, account, '#/nope');
    await expect(page).toHaveURL(/#\/today$/);
    expect(await page.evaluate(() => history.length)).toBe(expectedLength);
  });
});

test.describe('desktop: sidebar', () => {
  test.use({ viewport: DESKTOP });

  test('the menu is a persistent sidebar, without a Menu button', async ({ page, account }) => {
    const errors = await openApp(page, account);
    await expect(menuButton(page)).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).not.toHaveAttribute('role', 'dialog');
    expect((await drawer(page).boundingBox()).width).toBe(264);
    await page.getByRole('link', { name: 'Pieniądze' }).click();
    await expect(page).toHaveURL(/#\/money$/);
    await expect(page.getByRole('link', { name: 'Pieniądze' })).toHaveAttribute('aria-current', 'page');
    expect(errors).toEqual([]);
  });

  test('shrinking below 840 px turns the sidebar into a closed drawer', async ({ page, account }) => {
    await openApp(page, account);
    await page.setViewportSize({ width: 839, height: 800 });
    await expect(menuButton(page)).toBeVisible();
    await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
  });
});

test.describe('layout guarantees', () => {
  const ROUTES = ['#/today', '#/tasks', '#/money', '#/settings', '#/reports', '#/ui'];
  for (const width of [360, 390, 768, 839, 840, 1280]) {
    test(`no horizontal scroll at ${width} px`, async ({ page, account }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const hash of ROUTES) {
        await openApp(page, account, hash);
        const overflow = await page.evaluate(() => {
          const content = document.querySelector('.shell__content');
          return {
            page: document.documentElement.scrollWidth - innerWidth,
            content: content.scrollWidth - content.clientWidth,
          };
        });
        expect(overflow, `${hash} at ${width}px`).toEqual({ page: 0, content: 0 });
      }
    });
  }
});

test.describe('themes', () => {
  test.use({ viewport: PHONE });

  const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('default is LifeXP dark (the v1 look)', async ({ page, account }) => {
    await openApp(page, account);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'lifexp');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    expect(await background(page)).toBe('rgb(14, 15, 19)');
  });

  test('v1 "apple" becomes iOS and follows the device appearance', async ({ page, account }) => {
    await page.addInitScript(() => localStorage.setItem('lifexp-theme', 'apple'));
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, account);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ios');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
    expect(await background(page)).toBe('rgb(242, 242, 247)');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    expect(await background(page)).toBe('rgb(0, 0, 0)');
  });

  test('a v2 choice wins over v1 and updates the browser color', async ({ page, account }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lifexp-theme', 'gold');
      localStorage.setItem('lifexp-v2-theme', JSON.stringify({ family: 'lifexp', mode: 'light' }));
    });
    await openApp(page, account);
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f5fa');
  });

  test('the theme is set before the app script runs (no flash)', async ({ page, account }) => {
    await page.addInitScript(() => localStorage.setItem('lifexp-theme', 'gold'));
    await page.route('**/v2/dist/assets/*.js', (route) => route.abort());
    await page.goto(appUrl());
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'gold');
  });
});
