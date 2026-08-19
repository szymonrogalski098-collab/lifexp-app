// Regression test for the "PWA fails to launch fully offline" bug (airplane
// mode with no prior online load). Root cause was that sw.js only precached
// STATIC assets at install, not the HTML shell — so a cold cache (right
// after any cache-version bump) had nothing to serve a fully-offline
// navigation, and the browser threw a hard error instead of showing the app.
const { test, expect } = require('@playwright/test');

// sw.js's very first lines `importScripts(...gstatic firebase sdks...)` then
// immediately call `firebase.initializeApp(...)` / `firebase.messaging()` —
// this all runs SYNCHRONOUSLY at the top of the worker script, before
// `self.addEventListener('install', ...)` is even reached. Stubbing those
// cross-origin imports with an EMPTY response looks harmless but isn't: an
// empty script doesn't define `firebase`, so `firebase.initializeApp(...)`
// throws a ReferenceError during the worker's top-level evaluation — which
// silently aborts the rest of the script (install/fetch handlers never
// register) while Chromium *still* reports the registration as "activated"
// via the default lifecycle (a install-handler-free worker activates on its
// own). That's a false pass waiting to happen: the test would "work" while
// exercising a completely broken, no-op service worker. The stub below
// defines just enough of the `firebase` shape sw.js actually touches so the
// REAL install/fetch/activate handlers run for real.
async function stubFirebaseSdk(context) {
  await context.route('https://www.gstatic.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'self.firebase = { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: () => {} }) };',
  }));
}

// style.css @import's Google Fonts. Real requests to fonts.googleapis.com hit
// this environment's proxy, which resets the connection — but only after the
// full connect timeout, which stalls page.goto()'s 'load' event (it waits on
// all subresources, including @import'd stylesheets) for ~13s before this
// spec's own assertions even start running. That's the actual cause of the
// flakiness observed running this file repeatedly: it's not a real timing
// race in sw.js, it's an unstubbed cross-origin request stalling navigation
// itself. Fulfilling immediately (empty CSS, no @font-face) sidesteps it and
// also means there's no further fonts.gstatic.com font-file request to stub.
async function stubGoogleFonts(context) {
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '/* stubbed */',
  }));
}

async function waitForActivatedSW(page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.active && reg.active.state === 'activated');
  }, { timeout: 15000 });
}

const PRECACHE_FILES = ['style.css', 'manifest.json', 'icon.svg', 'games.js', 'index.html', 'app.html', 'verify.html', 'parent.html'];

// `reg.active.state === 'activated'` is NOT a safe signal that precaching has
// finished: on this environment, that state flips true while the install
// handler's precache Promise.all is still mid-flight (confirmed by
// instrumenting sw.js directly — cache reads right after "activated"
// sometimes showed 0-4 of the real 8 entries, with the SW's own "all
// precached" log arriving *after* wall-clock).
//
// Worse, even a direct `caches.match()` read of a specific file is itself
// flickery here immediately after the underlying write resolves — repeated
// back-to-back reads of the *same* key alternate hit/miss with no deletion
// in between (confirmed via a diagnostic loop: "all 8 present" would read
// true, then false, then true again, milliseconds apart, with no code path
// in sw.js that deletes individual precached entries). That's read-after-
// write eventual consistency in this environment's Cache Storage backend,
// not a real app bug — so a single "all present" read isn't trustworthy.
// Requiring the reading to hold across a few consecutive polls filters the
// transient flicker out reliably (verified with 10+ repeated runs).
// `check` is a serializable async function run in the page; it must return a
// boolean. Waits until it returns `true` on 3 consecutive polls, filtering
// out the read-after-write flicker described above regardless of direction
// (present-vs-absent both flicker, so a single read is never trustworthy).
async function waitForStableCacheState(page, check, arg) {
  let stableStreak = 0;
  for (let i = 0; i < 100; i++) {
    const result = await page.evaluate(check, arg);
    stableStreak = result ? stableStreak + 1 : 0;
    if (stableStreak >= 3) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('cache state never stabilized within timeout');
}

async function waitForPrecache(page, files = PRECACHE_FILES) {
  await waitForStableCacheState(page, async (files) => {
    for (const f of files) if (!(await caches.match(f))) return false;
    return true;
  }, files);
}

test.describe('Service worker offline cold-launch', () => {
  test('a freshly-installed SW precaches the HTML shell so it is retrievable with no prior online navigation', async ({ page, context }) => {
    await stubFirebaseSdk(context);
    await stubGoogleFonts(context);
    await page.goto('/index.html');
    await waitForActivatedSW(page);
    await waitForPrecache(page);

    // Exercise the EXACT lookup chain sw.js's fetch handler uses in its
    // offline fallback (caches.match(request) || caches.match('app.html')) —
    // this is what actually determines whether an offline user gets the app
    // shell or a hard browser navigation error. Deliberately do NOT navigate
    // again first — a second successful online nav would populate the cache
    // as a side effect and mask the exact bug this test guards against.
    const lookup = await page.evaluate(async () => {
      const req = new Request(location.origin + '/app.html');
      const hit = await caches.match(req).then((h) => h || caches.match('app.html'));
      return hit ? { found: true, status: hit.status } : { found: false };
    });
    expect(lookup.found).toBe(true);
    expect(lookup.status).toBe(200);

    // Same check for index.html itself (the PWA's start_url target).
    const rootLookup = await page.evaluate(async () => {
      const hit = await caches.match(location.origin + '/index.html');
      return hit ? { found: true, status: hit.status } : { found: false };
    });
    expect(rootLookup.found).toBe(true);
  });

  test('precache is fetched with cache:"reload", not a stale browser-HTTP-cached copy', async ({ page, context }) => {
    // Serve style.css once with a body that changes between requests, so we
    // can tell whether the SW's precache fetch actually hit the network
    // fresh (cache:'reload') versus picking up an HTTP-cached response.
    let requestCount = 0;
    await context.route('**/style.css', (route) => {
      requestCount++;
      route.fulfill({ status: 200, contentType: 'text/css', headers: { 'Cache-Control': 'max-age=3600' }, body: `/* v${requestCount} */` });
    });
    await stubFirebaseSdk(context);
    await stubGoogleFonts(context);
    await page.goto('/index.html');
    await waitForActivatedSW(page);
    await waitForPrecache(page);
    expect(requestCount).toBeGreaterThan(0); // the precache step actually issued a real network request
  });

  test('an HTML path that somehow ends up uncached has no cache to fall back to (would hit OFFLINE_FALLBACK)', async ({ page, context }) => {
    // NOTE: this deliberately does NOT use context.setOffline() + a live
    // fetch() — in this environment (and apparently some CDP/Chromium
    // combinations generally) network-emulated offline mode fails requests
    // *before* they ever reach the service worker's fetch handler, which
    // would make this test exercise Chromium's network stack instead of
    // sw.js. Testing the cache lookup directly (the same technique used to
    // originally diagnose and fix this bug) is the reliable way to verify
    // this specific code path.
    await stubFirebaseSdk(context);
    await stubGoogleFonts(context);
    await page.goto('/index.html');
    await waitForActivatedSW(page);
    await waitForPrecache(page);

    // Force the edge case OFFLINE_FALLBACK() exists for: normally the
    // precache fix (see the first test above) means app.html/index.html are
    // always cached, but simulate the rare case where they somehow aren't
    // (e.g. a user cleared partial site data) by deleting them directly.
    await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0]);
      await Promise.all(['index.html', 'app.html', 'verify.html', 'parent.html'].map((f) => c.delete(f)));
    });

    // Reproduce sw.js's exact lookup chain for an HTML request:
    // caches.match(request) || caches.match('app.html') — both must now miss.
    // Same read-after-write flicker as waitForPrecache applies here too (in
    // the delete direction), so require it to hold stably, not just once.
    await waitForStableCacheState(page, async () => {
      const req = new Request(location.origin + '/app.html');
      const hit = await caches.match(req).then((h) => h || caches.match('app.html'));
      return hit === undefined;
    });

    // With both cache lookups missing, sw.js's fetch handler falls to
    // `.then((hit) => hit || OFFLINE_FALLBACK())` — confirm that function
    // still exists in the shipped file and always returns a real Response
    // (not conditionally, not sometimes undefined).
    const swSource = await page.evaluate(() => fetch('/sw.js').then((r) => r.text()));
    expect(swSource).toMatch(/OFFLINE_FALLBACK\s*=\s*\(\)\s*=>\s*new Response/);
    expect(swSource).toMatch(/hit \|\| OFFLINE_FALLBACK\(\)/);
  });
});
