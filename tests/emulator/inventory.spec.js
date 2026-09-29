// scripts/inventory.js reads production data and its report is published in a
// PUBLIC repo's Actions summary. These tests seed legacy-shaped documents full
// of personal-looking strings and check the report keeps the schema but leaks
// none of the values.
const { test, expect } = require('@playwright/test');
const { db } = require('../support/emulator');
const { Inventory, buildInventory } = require('../../scripts/inventory');

const SECRETS = {
  email: 'jan.kowalski.secret@example.com',
  name: 'Jan Tajny Kowalski',
  note: 'Prywatna notatka o hasle 1234',
  person: 'Wujek Zbyszek',
  category: 'tajne-wydatki',
  token: 'fcmTokenAbcDEF123456789secret',
  customModule: 'modul-spoza-kodu',
};

test('inventory reports schema and legacy shapes without leaking any values', async () => {
  const uid = `inv${Date.now()}AAAAAAAAAAAAAAAAAA`.slice(0, 28);
  const user = db.doc(`users/${uid}`);
  await user.set({
    name: SECRETS.name,
    email: SECRETS.email,
    parentEmail: SECRETS.email,
    createdAt: '2026-07-01T10:00:00.000Z',
    points: { total: 5, earnedAllTime: 10, spentAllTime: 5 },
    enabledModules: ['chores', 'planner', SECRETS.customModule],
    goalName: SECRETS.name, // legacy single-goal field
    goalAmount: 100,
    goals: [{ id: 'g1', name: SECRETS.name, type: 'money', amount: 50.5, saved: 0, celebrated: false }],
  });
  await db.doc(`users/${uid}/dailyLog/2026-07-01`).set({ pointsEarned: 10, gamingMinutes: 0 });
  await user.collection('activities').add({ type: '__generated__', typeName: SECRETS.note, duration: 30, points: 10, desc: SECRETS.note, timestamp: new Date() });
  await user.collection('moneyTransactions').add({ type: 'expense', amount: 12.5, category: SECRETS.category, note: SECRETS.note, date: '2026-07-01', createdAt: new Date() });
  await user.collection('moneyLoans').add({ person: SECRETS.person, amount: 20, direction: 'lent', date: '2026-07-01' });
  await user.collection('notes').add({ title: SECRETS.note, content: SECRETS.note, createdAt: '2026-07-01T10:00:00.000Z', archived: false });
  await user.collection('fcmTokens').doc(SECRETS.token).set({ token: SECRETS.token, createdAt: new Date() });

  const inv = await buildInventory(db);
  const md = inv.toMarkdown({ generatedAt: 'test', projectId: 'demo-lifexp' });

  // Schema is there.
  expect(md).toContain('`users/{id}/activities/{id}`');
  expect(md).toContain('`users/{id}/dailyLog/{id}`');
  expect(md).toContain('<date YYYY-MM-DD>');
  expect(md).toContain('`goalName`');            // legacy field detected
  expect(md).toContain('`goals[].type`');
  expect(md).toContain('string:iso-datetime');   // notes.createdAt as ISO string
  expect(md).toMatch(/`enabledModules\[\]`: .*planner ×\d+/); // module list needed for migration M3
  expect(md).toContain('<other>');                // unknown enum value collapsed

  // No value, id or token leaks.
  for (const secret of [...Object.values(SECRETS), uid]) {
    expect(md).not.toContain(secret);
  }
});

test('a field with different types in different documents counts every document it is in', () => {
  const inv = new Inventory();
  inv.addDoc('payouts/{id}', 'a', { amountPln: 18 });
  inv.addDoc('payouts/{id}', 'b', { amountPln: 4.5 });
  inv.addDoc('payouts/{id}', 'c', { amountPln: 0.45 });
  inv.addDoc('payouts/{id}', 'd', {});
  const md = inv.toMarkdown({ generatedAt: 'test', projectId: 'demo-lifexp' });
  expect(md).toContain('| `amountPln` | 3/4 | float ×2, int ×1 |');
});
