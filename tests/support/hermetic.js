// Hermetic variant of Playwright's `test`: every request that leaves the local
// static server is aborted.
//
// Some specs were written in a sandbox where CDNs (gstatic, jsDelivr, unpkg,
// Google Fonts) are unreachable, and their assertions depend on that — e.g.
// app.html's Firebase module never boots, marked/DOMPurify never load. On CI
// those hosts ARE reachable, so the same specs saw a different app (Firebase
// redirecting to index.html, Markdown-rendered bubbles) and failed. Aborting
// external requests makes the outcome identical everywhere.
//
// Page-level routes still take precedence over this context-level one, so a
// spec can serve a specific external URL from a local file (see
// fps-gameplay.spec.js, which fulfils three.module.js).
const base = require('@playwright/test');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const test = base.test.extend({
  context: async ({ context }, use) => {
    await context.route(
      (url) => !LOCAL_HOSTS.has(url.hostname) && url.protocol.startsWith('http'),
      (route) => route.abort('blockedbyclient'),
    );
    await use(context);
  },
});

module.exports = { test, expect: base.expect };
