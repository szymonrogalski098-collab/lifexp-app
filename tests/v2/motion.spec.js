// Motion (docs/v2/PLAN.md 7.1): state changes animate instead of jumping — screens
// rise in, the segmented control's thumb slides, toasts fade out — using only
// transform and opacity; with the system's "reduce motion" nothing animates.
const { test, expect, openSignedIn, screenSettled } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Records every screen rise-in (ui/motion.ts playEnter, a Web Animation on
 * .shell__main) with the properties it moves. Counting started animations instead of
 * sampling running ones keeps the check right on a slow machine, where a 250 ms
 * animation can be over before the test looks.
 */
function recordScreenEntries(page) {
  return page.addInitScript(() => {
    window.__entries = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList.contains('shell__main')) {
        const frames = Array.isArray(keyframes) ? keyframes : [keyframes];
        const props = frames.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite'].includes(p)));
        window.__entries.push([...new Set(props)].sort());
      }
      return animate.call(this, keyframes, options);
    };
  });
}

const entries = (page) => page.evaluate(() => window.__entries);

/** Animations running on the element (CSS and Web Animations alike), by the properties they change. */
function animatedProperties(locator) {
  return locator.evaluate((el) =>
    el.getAnimations().flatMap((a) =>
      a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))),
    ),
  );
}

test('a new screen rises in, moving only transform and opacity', async ({ page, account }) => {
  await recordScreenEntries(page);
  await openSignedIn(page, account, '#/today');
  const before = (await entries(page)).length;
  await page.locator('.tabbar').getByRole('link', { name: 'Pieniądze' }).click();
  await expect.poll(async () => (await entries(page)).slice(before)).toEqual([['opacity', 'transform']]);
});

test('the segmented control slides one thumb to the choice', async ({ page, account }) => {
  await openSignedIn(page, account, '#/ui');
  const mode = page.getByRole('group', { name: 'Tryb' });
  const thumb = mode.locator('.ui-segmented__thumb');
  await mode.getByRole('radio', { name: 'Ciemny' }).check();
  const before = await thumb.boundingBox();
  await mode.getByRole('radio', { name: 'Jasny' }).check();
  // It moves over time (a transition on transform), then rests under the new choice.
  await expect(thumb).toHaveCSS('transition-property', 'transform');
  await expect.poll(async () => (await thumb.boundingBox()).x).toBeGreaterThan(before.x + 20);
  const target = await mode.getByText('Jasny', { exact: true }).boundingBox();
  await expect.poll(async () => Math.abs((await thumb.boundingBox()).x - target.x)).toBeLessThan(3);
});

test('a toast fades out before the next state', async ({ page, account }) => {
  await openSignedIn(page, account, '#/ui');
  await page.getByRole('button', { name: 'Pokaż błąd' }).click();
  const toast = page.locator('.ui-toast');
  await expect(toast).toBeVisible();
  await toast.locator('.ui-toast__message').click();
  await expect(toast).toHaveClass(/ui-toast--leaving/);
  await expect(toast).toHaveCount(0);
});

test.describe('with reduced motion', () => {
  test('screens do not animate', async ({ page, account }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSignedIn(page, account, '#/today');
    await page.locator('.tabbar').getByRole('link', { name: 'Pieniądze' }).click();
    expect(await animatedProperties(page.locator('.shell__main'))).toEqual([]);
    // The build may shorten the token ("0ms" → "0s"); either way it is zero.
    const enter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration-enter'));
    expect(parseFloat(enter)).toBe(0);
  });
});

test('switching views of one module slides the switch and brings in only the content below', async ({ page, account }) => {
  await recordScreenEntries(page);
  await openSignedIn(page, account, '#/stats');
  const views = page.getByRole('navigation', { name: 'Widok statystyk' });
  const thumb = views.locator('.ui-view-switch__thumb');
  await screenSettled(page);
  const before = await thumb.boundingBox();

  const entered = (await entries(page)).length;
  await views.getByRole('link', { name: 'Historia' }).click();
  // The screen stays put (no rise-in hiding the switch) ...
  expect(await animatedProperties(page.locator('.shell__main'))).toEqual([]);
  // ... the thumb slides to the new view ...
  await expect.poll(async () => (await thumb.boundingBox()).x).toBeGreaterThan(before.x + 20);
  // ... and the new view's content comes in on its own, with transform and opacity only.
  const panel = page.locator('.ui-view-panel').first();
  expect([...new Set(await animatedProperties(panel))].sort()).toEqual(['opacity', 'transform']);

  expect((await entries(page)).length).toBe(entered);

  // Another module is a new screen: that one still rises in.
  await page.locator('.tabbar').getByRole('link', { name: 'Pieniądze' }).click();
  await expect.poll(async () => (await entries(page)).length).toBe(entered + 1);
});
