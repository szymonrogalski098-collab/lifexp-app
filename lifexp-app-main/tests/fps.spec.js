// Smoke test for the "FPS Prototype" tile added to the Games menu.
//
// The prototype itself (fps.html) is a standalone Three.js/WebGL page copied
// in almost verbatim — its module script imports Three.js from a CDN
// (unpkg.com), which this sandbox's network policy blocks, so the actual
// 3D rendering/gameplay can never be exercised here (same limitation as the
// Firebase-gated parts of app.html elsewhere in this suite). What IS fully
// under our control and worth locking down: the menu tile exists and wires
// to LifeXPGames.openFps(), the navigation actually lands on fps.html (real
// browser navigation, not a mock), the static page content renders even
// though its module script fails to execute, and the added "back to LifeXP"
// link actually returns to app.html.
const { test, expect } = require('@playwright/test');

test('Games menu: FPS Prototype tile navigates to fps.html and back', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('/app.html');
  await page.waitForTimeout(300);

  // games.js is a plain classic script (no Firebase dependency), so
  // window.LifeXPGames is available even though app.html's own Firebase-gated
  // module script never finishes initializing in this sandbox — which also
  // means window.showPage (defined inside that failed module) never runs, so
  // #page-games never gets its real .active class. Add it manually here to
  // make the games page visible, same effect showPage('games') would have.
  await page.evaluate(() => {
    document.getElementById('page-games').classList.add('active');
    window.LifeXPGames.showMenu();
  });
  await page.waitForTimeout(100);

  const tile = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('#games-menu .game-tile'));
    const fps = tiles.find(t => t.textContent.includes('FPS Prototype'));
    return {
      found: !!fps,
      onclick: fps?.getAttribute('onclick'),
      emoji: fps?.querySelector('.gt-emoji')?.textContent,
    };
  });
  expect(tile.found).toBe(true);
  expect(tile.onclick).toBe('LifeXPGames.openFps()');
  expect(tile.emoji).toBe('🔫');

  // Click the real tile (not just call openFps() programmatically) so this
  // proves the actual DOM wiring, not just that the function exists.
  await Promise.all([
    page.waitForURL('**/fps.html'),
    page.click('#games-menu .game-tile:has-text("FPS Prototype")'),
  ]);
  expect(page.url()).toContain('/fps.html');

  // The module script's `import * as THREE from 'https://unpkg.com/...'` will
  // fail here (CDN blocked), so none of the game's own JS runs — but the
  // static HTML (title, start overlay, our added back-link) still loads,
  // since a failed module import doesn't prevent the document itself from
  // rendering.
  const staticContent = await page.evaluate(() => ({
    title: document.title,
    hasOverlay: !!document.getElementById('overlay'),
    hasCta: !!document.getElementById('ov-cta'),
    backLink: document.querySelector('#panel a[href="app.html"]')?.textContent,
  }));
  expect(staticContent.title).toBe('FPS Prototype — CS2 lite');
  expect(staticContent.hasOverlay).toBe(true);
  expect(staticContent.hasCta).toBe(true);
  expect(staticContent.backLink).toContain('Powrót do LifeXP');

  // Follow the back-link and confirm it actually returns to app.html.
  // In this sandbox the CDN import never resolves (blocked network), so the
  // game's own script never reaches `document.getElementById('loading').remove()`
  // — its full-viewport "#loading" overlay stays on top and would intercept a
  // simulated mouse click at the link's coordinates (even with force:true,
  // which only skips Playwright's actionability checks, not the real hit-test
  // at that screen position). Invoking .click() on the element directly
  // sidesteps that — it's still a genuine click on the real <a> (native
  // navigation fires per the HTMLElement.click() spec), just not routed
  // through screen coordinates. On a real connection Three.js loads, the
  // overlay is removed normally, and a plain page.click() would work too.
  await Promise.all([
    page.waitForURL('**/app.html'),
    page.locator('#panel a[href="app.html"]').evaluate(el => el.click()),
  ]);
  expect(page.url()).toContain('/app.html');

  // Ignore the expected, sandbox-only CDN failures (blocked unpkg.com import,
  // blocked Firebase/EmailJS imports from gstatic.com/jsdelivr elsewhere in
  // app.html, which we load twice here — once up front, once via the back
  // link) — pre-existing network-policy artifacts, not bugs introduced here.
  const unexpected = errors.filter(e =>
    !/Failed to fetch dynamically imported module/.test(e) &&
    !/Failed to load resource/.test(e) &&
    !/emailjs is not defined/.test(e));
  expect(unexpected).toEqual([]);
});
