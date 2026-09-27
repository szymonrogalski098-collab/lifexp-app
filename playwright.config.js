// @ts-check
const fs = require('fs');
const { defineConfig } = require('@playwright/test');

// Some sandboxed dev environments pre-install a specific Chromium revision
// under PLAYWRIGHT_BROWSERS_PATH that doesn't exactly match whatever
// @playwright/test version npm resolved — point at it directly instead of
// trying to download a new one (which such environments usually block).
// Falls through to Playwright's normal browser resolution everywhere else
// (e.g. real CI, which runs `npx playwright install --with-deps chromium`).
const pinnedChromium = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome`
  : null;
const executablePath = pinnedChromium && fs.existsSync(pinnedChromium) ? pinnedChromium : undefined;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'app', testIgnore: [/fps-gameplay\.spec\.js/, /[\\/]emulator[\\/]/] },
    // The FPS scene renders through software WebGL in headless Chromium. Several
    // copies at once starve each other of CPU and the frame-counted waits time
    // out; one at a time they pass reliably. Only this project is serialised.
    { name: 'fps-gameplay', testMatch: /fps-gameplay\.spec\.js/, workers: 1 },
    // Real v1 app against the Firebase emulators. Needs them running, so it is
    // started through `npm run test:emulator` (firebase emulators:exec), not `npm test`.
    // Service workers are blocked: sw.js caching is not what these tests check.
    { name: 'emulator', testMatch: /[\\/]emulator[\\/].*\.spec\.js/, use: { serviceWorkers: 'block' } },
  ],
  webServer: {
    command: 'node tests/support/static-server.js',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
