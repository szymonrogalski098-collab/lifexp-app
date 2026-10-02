// The bug-report admin for tests on the emulators. The rules name one address as the
// admin (firestore.rules isBugAdmin); the tests load the same rules with a test
// address in its place, so the real one never appears in tests, logs or artefacts.
const fs = require('fs');
const path = require('path');
const { auth, db, readyProfile } = require('./emulator');

const RULES = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
const ADMIN_RULE = /(function isBugAdmin\(\)\s*\{[^}]*request\.auth\.token\.email == ')[^']+(')/;
const ADMIN_EMAIL = 'bug-admin@lifexp.test';
const ADMIN_PASSWORD = 'test-password-123';

async function loadRules(content) {
  const res = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-lifexp:securityRules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  if (!res.ok) throw new Error(`Loading the rules failed: ${res.status}`);
}

/**
 * The rules with the test address as the admin, and that account (created once per
 * run, set up as v1 would). Everything else in the rules stays as it is.
 */
async function adminAccount() {
  const rules = RULES.replace(ADMIN_RULE, `$1${ADMIN_EMAIL}$2`);
  if (rules === RULES) throw new Error('isBugAdmin() not found in firestore.rules');
  await loadRules(rules);
  let user;
  try {
    user = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, emailVerified: true });
  } catch (error) {
    // Made earlier in this run, maybe by another worker at the same moment.
    if (error?.code !== 'auth/email-already-exists') throw error;
    user = await auth.getUserByEmail(ADMIN_EMAIL);
  }
  await db.doc(`users/${user.uid}`).set(readyProfile({ email: ADMIN_EMAIL, name: 'Admin' }), { merge: true });
  return { uid: user.uid, email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
}

module.exports = { adminAccount };
