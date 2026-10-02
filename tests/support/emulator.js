// Helpers for tests that run the REAL v1 app against the Firebase Emulator Suite.
//
// Run with `npm run test:emulator`, which starts the Auth and Firestore
// emulators (firebase.emulators.json, project "demo-lifexp") around Playwright.
// The app switches to the emulators via ?emulator=1 on localhost — see
// LIFEXP_EMULATOR in firebase-config.js.
//
// The app loads Firebase, i18next and EmailJS from CDNs. Those requests are
// fulfilled from the identical builds in node_modules, so the tests are
// hermetic and never depend on network access; anything else external is aborted.
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'demo-lifexp';
const FIRESTORE_HOST = '127.0.0.1:8080';
const AUTH_HOST = '127.0.0.1:9099';

// firebase-admin reads these when it initialises; they must be set first.
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;
// No Google Cloud metadata server exists here; skip the lookup (and its warning).
process.env.METADATA_SERVER_DETECTION = 'none';

const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const ROOT = path.join(__dirname, '..', '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');
// "What's new" shows once per APP_VERSION (updates.js); tests mark it as seen.
const APP_VERSION = fs.readFileSync(path.join(ROOT, 'updates.js'), 'utf8').match(/const APP_VERSION = '([^']+)'/)[1];
const FIREBASE_VERSION = require('firebase/package.json').version;

function file(rel) {
  return fs.readFileSync(path.join(NODE_MODULES, rel), 'utf8');
}

/** Serve the app's CDN dependencies from node_modules; abort every other external request. */
async function serveCdnFromNpm(context) {
  await context.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => {
    const url = new URL(route.request().url());
    const js = (body) => route.fulfill({ status: 200, contentType: 'application/javascript', body });
    const css = () => route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed in tests */' });

    const fb = url.href.match(/^https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\/([\w-]+\.js)$/);
    if (fb) {
      if (fb[1] !== FIREBASE_VERSION) {
        throw new Error(`App requests Firebase ${fb[1]} but node_modules has ${FIREBASE_VERSION}`);
      }
      return js(file(`firebase/${fb[2]}`));
    }
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/i18next@')) return js(file('i18next/i18next.min.js'));
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@emailjs/browser@')) return js(file('@emailjs/browser/dist/email.min.js'));
    if (url.pathname.endsWith('.css') || url.hostname === 'fonts.googleapis.com') return css();
    return route.abort('blockedbyclient');
  });
}

let counter = 0;
/** Unique e-mail per test so parallel tests never share an account. */
function uniqueEmail(tag) {
  counter += 1;
  return `${tag}-${process.pid}-${Date.now()}-${counter}@test.lifexp`;
}

/** A profile that passes every v1 boot gate (verified, account mode, onboarding). */
function readyProfile(overrides = {}) {
  return {
    name: 'Tester',
    email: '',
    parentEmail: '',
    createdAt: new Date().toISOString(),
    points: { total: 0, earnedAllTime: 0, spentAllTime: 0 },
    emailVerified: true,
    accountMode: 'solo',
    enabledModules: ['chores', 'money', 'games', 'stats', 'notes', 'aichat'],
    onboardingDone: true,
    lang: 'pl',
    ...overrides,
  };
}

/** Create an Auth user and their users/{uid} document. Returns { uid, email, password }. */
async function createUser({ tag = 'user', profile = {} } = {}) {
  const email = uniqueEmail(tag);
  const password = 'test-password-123';
  const user = await auth.createUser({ email, password, emailVerified: true });
  await db.doc(`users/${user.uid}`).set(readyProfile({ email, ...profile }));
  return { uid: user.uid, email, password };
}

/** v1 keys dailyLog documents by the UTC date (todayStr in core.js). */
function todayUtcKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Log in through the real login form and wait until the dashboard has booted.
 * The "What's new" modal is marked as seen so it does not cover the UI.
 */
function skipWhatsNew(page) {
  return page.addInitScript((version) => {
    try { localStorage.setItem('lifexp-seen-version', version); } catch (e) { /* ignore */ }
  }, APP_VERSION);
}

async function waitForApp(page) {
  await page.waitForFunction(() => document.getElementById('boot-overlay')?.hidden === true, null, { timeout: 20000 });
}

async function signInToApp(page, { email, password }) {
  await skipWhatsNew(page);
  await page.goto('/index.html?emulator=1');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await Promise.all([
    page.waitForURL('**/app.html'),
    page.click('#form-login button'),
  ]);
  await waitForApp(page);
}

/** v1's app for the session this page already has (v1 and v2 share the sign-in). */
async function openApp(page) {
  await skipWhatsNew(page);
  await page.goto('/app.html?emulator=1');
  await waitForApp(page);
}

module.exports = { PROJECT_ID, auth, db, serveCdnFromNpm, createUser, readyProfile, todayUtcKey, signInToApp, openApp };
