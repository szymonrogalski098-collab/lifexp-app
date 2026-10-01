// Goals (docs/v2/PLAN.md 9, stage 3d; GOLDEN G7) on the Firebase emulators.
// Parity (PLAN.md 8.3): a new goal, a deposit and a delete in v1 and v2 leave the same
// goals array (ids aside) and the same Money balance; v1 shows a goal made in v2.
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** 50 zł in Money, 120 points, and the given goals. */
async function goalsAccount(tag, goals = []) {
  const account = await createUser({
    tag,
    profile: { points: { total: 120, earnedAllTime: 300, spentAllTime: 0 }, ...(goals.length ? { goals } : {}) },
  });
  await db.doc(`users/${account.uid}/money/balance`).set({ current: 50 });
  return account;
}

/** The goals (ids aside) and the balance, once a write reached the server. */
async function goalsState(uid) {
  const profile = (await db.doc(`users/${uid}`).get()).data();
  return {
    goals: (profile.goals ?? []).map(({ id, ...rest }) => {
      expect(typeof id).toBe('string');
      return rest;
    }),
    balance: (await db.doc(`users/${uid}/money/balance`).get()).data(),
  };
}

const rower = { name: 'Rower', type: 'money', amount: 150.5, celebrated: false, saved: 0 };

async function newGoalInV2(page, { type = 'Pieniężny', name, amount }) {
  await page.getByRole('button', { name: 'Nowy cel' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowy cel' });
  await sheet.getByRole('radio', { name: type }).check();
  await sheet.getByLabel('Nazwa').fill(name);
  await sheet.getByLabel(type === 'Pieniężny' ? 'Cena' : 'Punkty docelowe').fill(amount);
  await sheet.getByRole('button', { name: 'Dodaj cel' }).click();
  return sheet;
}

test('G7.1: a new money goal is v1\'s entry; a fourth one is not possible', async ({ page }) => {
  const account = await goalsAccount('goals-new-v2');
  await openSignedIn(page, account, '#/goals');
  await expect(page.getByText('Nie masz jeszcze celów.')).toBeVisible();

  const sheet = await newGoalInV2(page, { name: '  Rower ', amount: '150,5' });
  await expect(page.getByText('Cel dodany.')).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await goalsState(account.uid)).goals).toEqual([rower]);
  const card = page.getByRole('list', { name: 'Cele' }).getByRole('listitem');
  await expect(card).toHaveCount(1);
  await expect(card.first()).toContainText('0,00 zł z 150,50 zł · 0%');
  await expect(card.first()).toContainText('Brakuje 150,50 zł');

  await newGoalInV2(page, { type: 'Punktowy', name: 'Poziom', amount: '500' });
  await expect(card).toHaveCount(2);
  await expect(card.nth(1)).toContainText('120 pkt z 500 pkt · 24%');
  await newGoalInV2(page, { type: 'Punktowy', name: 'Trzeci', amount: '1000' });
  await expect(card).toHaveCount(3);
  await expect(page.getByText('Celów: 3 z 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nowy cel' })).toBeDisabled();
});

test('G7.2: a deposit comes out of the balance and never more than there is', async ({ page }) => {
  const account = await goalsAccount('goals-deposit', [{ id: 'g1', ...rower }]);
  await openSignedIn(page, account, '#/goals');
  await page.getByRole('button', { name: 'Wpłać na: Rower' }).click();
  const sheet = page.getByRole('dialog', { name: 'Wpłata na: Rower' });
  await sheet.getByLabel('Kwota').fill('60');
  await sheet.getByRole('button', { name: 'Wpłać' }).click();
  await expect(sheet.getByText('Za mało środków na saldzie.')).toBeVisible();
  expect(await goalsState(account.uid)).toEqual({ goals: [rower], balance: { current: 50 } });

  await sheet.getByLabel('Kwota').fill('20,25');
  await expect(sheet.getByText('Saldo po wpłacie: 29,75 zł')).toBeVisible();
  await sheet.getByRole('button', { name: 'Wpłać' }).click();
  await expect(page.getByText('Wpłacono 20,25 zł na: Rower')).toBeVisible();
  expect(await goalsState(account.uid)).toEqual({ goals: [{ ...rower, saved: 20.25 }], balance: { current: 29.75 } });
  await expect(page.getByRole('list', { name: 'Cele' })).toContainText('20,25 zł z 150,50 zł · 13%');
});

test('G7.3: deleting a money goal gives back what was put aside', async ({ page }) => {
  const account = await goalsAccount('goals-delete', [{ id: 'g1', ...rower, saved: 20 }]);
  await openSignedIn(page, account, '#/goals');
  await page.getByRole('button', { name: 'Usuń: Rower' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć cel „Rower”?' });
  await expect(dialog).toContainText('Odłożone 20,00 zł wróci na saldo w Pieniądzach.');
  await dialog.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Cel usunięty.')).toBeVisible();
  expect(await goalsState(account.uid)).toEqual({ goals: [], balance: { current: 70 } });
});

test('editing keeps the type and what was put aside, and keeps fields v1 does not know', async ({ page }) => {
  const account = await goalsAccount('goals-edit', [{ id: 'g1', ...rower, saved: 20, extra: 'kept' }]);
  await openSignedIn(page, account, '#/goals');
  await page.getByRole('button', { name: 'Edytuj: Rower' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edycja celu' });
  await expect(sheet.getByText('Cel pieniężny')).toBeVisible();
  await sheet.getByLabel('Nazwa').fill('Rower szosowy');
  await sheet.getByLabel('Cena').fill('2000');
  await sheet.getByRole('button', { name: 'Zapisz cel' }).click();
  await expect(page.getByText('Cel zapisany.')).toBeVisible();
  expect((await goalsState(account.uid)).goals).toEqual([
    { name: 'Rower szosowy', type: 'money', amount: 2000, celebrated: false, saved: 20, extra: 'kept' },
  ]);
});

test('G7.6: a reached goal is celebrated once, by a write, not on every visit', async ({ page }) => {
  const account = await goalsAccount('goals-celebrate', [
    { id: 'a', name: 'Sto punktów', type: 'points', amount: 100, celebrated: false, saved: 0 },
    { id: 'b', name: 'Daleko', type: 'points', amount: 1000, celebrated: false, saved: 0 },
  ]);
  await openSignedIn(page, account, '#/goals');
  await expect(page.getByText('Cel osiągnięty: Sto punktów')).toBeVisible();
  await expect
    .poll(async () => (await goalsState(account.uid)).goals.map((g) => g.celebrated))
    .toEqual([true, false]);
  await expect(page.getByRole('list', { name: 'Cele' }).getByRole('listitem').first()).toContainText('Osiągnięty');

  await page.reload();
  await expect(page.getByRole('list', { name: 'Cele' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText('Cel osiągnięty: Sto punktów')).toHaveCount(0);
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  async function openV1(page, context, account) {
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await expect(page.locator('#goal-card')).toBeVisible();
  }

  test('parity G7.1: v1 writes the same new goal', async ({ page, context }) => {
    const account = await goalsAccount('goals-new-v1');
    await openV1(page, context, account);
    await page.click('#goal-card [onclick="openGoalForm()"]');
    await page.click('#goal-card [onclick="pickGoalType(\'money\')"]');
    await page.fill('#goal-name-input', '  Rower ');
    await page.fill('#goal-amount-input', '150.5');
    await page.click('#goal-card [onclick="saveGoal()"]');
    await expect.poll(async () => (await goalsState(account.uid)).goals).toEqual([rower]);
  });

  test('parity G7.2/G7.3: v1 deposits and deletes to the same state', async ({ page, context }) => {
    const account = await goalsAccount('goals-money-v1', [{ id: 'g1', ...rower }]);
    await openV1(page, context, account);
    await page.fill('#goal-deposit-g1', '20.25');
    await page.click('#goal-card [onclick="depositGoal(\'g1\')"]');
    await expect
      .poll(() => goalsState(account.uid))
      .toEqual({ goals: [{ ...rower, saved: 20.25 }], balance: { current: 29.75 } });

    await page.click('#goal-card [onclick="removeGoal(\'g1\')"]');
    await page.click('#confirm-modal-ok');
    await expect.poll(() => goalsState(account.uid)).toEqual({ goals: [], balance: { current: 50 } });
  });

  test('v1 shows a goal made in v2', async ({ page, context }) => {
    const account = await goalsAccount('goals-v2-to-v1');
    await openSignedIn(page, account, '#/goals');
    await newGoalInV2(page, { name: 'Rower', amount: '150,5' });
    await expect.poll(async () => (await goalsState(account.uid)).goals.length).toBe(1);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await openV1(page, context, account);
    await expect(page.locator('#goal-card')).toContainText('Rower');
    await expect(page.locator('#goal-card')).toContainText('150,50 zł');
  });
});

// ── Today (stage 3d-2; PLAN.md 7.6: goals and what is missing) ──

test('Today lists the goals with what is missing and opens the Goals screen', async ({ page }) => {
  const account = await goalsAccount('goals-today', [
    { id: 'g1', ...rower, saved: 20.5 },
    { id: 'g2', name: 'Sto punktów', type: 'points', amount: 100, celebrated: false, saved: 0 },
  ]);
  await openSignedIn(page, account, '#/today');
  const goals = page.getByRole('list', { name: 'Cele' }).getByRole('listitem');
  await expect(goals).toHaveCount(2);
  await expect(goals.nth(0)).toContainText('Rower');
  await expect(goals.nth(0)).toContainText('Brakuje 130,00 zł');
  await expect(goals.nth(0).getByRole('progressbar')).toHaveAttribute('aria-label', /^20,50\szł z 150,50\szł · 13%$/);
  await expect(goals.nth(1)).toContainText('Osiągnięty');
  // Reached on Today too: marked once and announced.
  await expect(page.getByText('Cel osiągnięty: Sto punktów')).toBeVisible();
  await expect.poll(async () => (await goalsState(account.uid)).goals.map((g) => g.celebrated)).toEqual([false, true]);

  await goals.nth(0).getByRole('link').click();
  await expect(page).toHaveURL(/#\/goals$/);
  await expect(page.getByRole('button', { name: 'Wpłać na: Rower' })).toBeVisible();
});

test('Today without goals invites to set one', async ({ page }) => {
  const account = await goalsAccount('goals-today-empty');
  await openSignedIn(page, account, '#/today');
  await page.getByRole('link', { name: /Ustaw cel/ }).click();
  await expect(page).toHaveURL(/#\/goals$/);
  await expect(page.getByText('Nie masz jeszcze celów.')).toBeVisible();
});
