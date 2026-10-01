// Money (docs/v2/PLAN.md 9, stage 3c; GOLDEN G5) on the Firebase emulators.
// Parity (PLAN.md 8.3): the same transaction in v1 and v2 leaves the same balance,
// points, income counter and documents; v1 lists what v2 saved; two tabs saving at
// once still add up.
const { createUser, db, serveCdnFromNpm, signInToApp } = require('../support/emulator');
const { test, expect, openSignedIn } = require('../support/v2');

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const utcToday = () => new Date().toISOString().slice(0, 10);

const CATEGORIES = [
  ['cat-food', 'jedzenie', '#4ecca3'],
  ['cat-games', 'gry', '#6c63ff'],
];

/** 50 zł on the balance, 120 points, two categories, the income counter at 0 (no M2). */
async function moneyAccount(tag, { balance = 50, total = 120 } = {}) {
  const account = await createUser({
    tag,
    profile: { points: { total, earnedAllTime: 300, spentAllTime: 10 }, moneyIncomeAllTime: 0 },
  });
  const user = db.doc(`users/${account.uid}`);
  await user.collection('money').doc('balance').set({ current: balance });
  await user.collection('money').doc('settings').set({ monthlyLimit: 200, currency: 'PLN' });
  for (const [id, name, color] of CATEGORIES) {
    await user.collection('moneyCategories').doc(id).set({ name, color, icon: '' });
  }
  return account;
}

/** Everything a transaction touches, ids and creation times aside. */
async function moneyState(uid) {
  const user = db.doc(`users/${uid}`);
  const profile = (await user.get()).data();
  const strip = (docs) =>
    docs
      .map((d) => {
        const { createdAt, ...rest } = d.data();
        return rest;
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    balance: (await user.collection('money').doc('balance').get()).data(),
    points: profile.points,
    moneyIncomeAllTime: profile.moneyIncomeAllTime ?? null,
    transactions: strip((await user.collection('moneyTransactions').get()).docs),
    categories: strip((await user.collection('moneyCategories').get()).docs),
  };
}

async function txCount(uid) {
  return (await db.collection(`users/${uid}/moneyTransactions`).get()).size;
}

const lunch = () => ({
  type: 'expense',
  amount: 5,
  category: 'jedzenie',
  note: 'obiad',
  date: utcToday(),
  source: 'manual',
  pointsCost: 50,
});

const afterLunch = () => ({
  balance: { current: 45 },
  points: { total: 70, earnedAllTime: 300, spentAllTime: 60 },
  moneyIncomeAllTime: 0,
  transactions: [lunch()],
  categories: [
    { name: 'gry', color: '#6c63ff', icon: '' },
    { name: 'jedzenie', color: '#4ecca3', icon: '' },
  ],
});

/** The v2 sheet: type, amount, category (or a new one), note. */
async function addInV2(page, { type = 'Wydatek', amount, category, newCategory, note }) {
  await page.getByRole('button', { name: 'Dodaj transakcję' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowa transakcja' });
  await sheet.getByRole('radio', { name: type }).check();
  await sheet.getByLabel('Kwota').fill(amount);
  if (newCategory) {
    await sheet.getByLabel('Kategoria').selectOption({ label: 'Nowa kategoria…' });
    await sheet.getByLabel('Nazwa nowej kategorii').fill(newCategory);
  } else {
    await sheet.getByLabel('Kategoria').selectOption({ label: category });
  }
  if (note) await sheet.getByLabel('Notatka (opcjonalnie)').fill(note);
  await sheet.getByRole('button', { name: 'Zapisz transakcję' }).click();
  return sheet;
}

test('G5.1: an expense of 5,00 zł moves the balance and costs 50 points, as in v1', async ({ page }) => {
  const account = await moneyAccount('money-expense-v2');
  await openSignedIn(page, account, '#/money');
  await expect(page.getByTestId('money-balance')).toHaveText('50,00 zł');

  const sheet = await addInV2(page, { amount: '5', category: 'jedzenie', note: 'obiad' });
  await expect(page.getByText('Transakcja zapisana. −50 pkt')).toBeVisible();
  await expect(sheet).toBeHidden();
  expect(await moneyState(account.uid)).toEqual(afterLunch());
  await expect(page.getByTestId('money-balance')).toHaveText('45,00 zł');
  const today = page.getByRole('list', { name: /^\p{L}+, \d+ /u }).first().getByRole('listitem');
  await expect(today).toHaveCount(1);
  await expect(today.first()).toContainText('jedzenie');
  await expect(today.first()).toContainText('obiad · −50 pkt');
  await expect(today.first()).toContainText('−5,00 zł');
});

test('G5.5: an expense above the balance is refused and changes nothing', async ({ page }) => {
  const account = await moneyAccount('money-too-much');
  const before = await moneyState(account.uid);
  await openSignedIn(page, account, '#/money');
  const sheet = await addInV2(page, { amount: '60', category: 'gry' });
  await expect(sheet.getByText('Za mało środków na saldzie.')).toBeVisible();
  expect(await moneyState(account.uid)).toEqual(before);
});

test('G5.6: income with a new category adds to the balance and the income counter', async ({ page }) => {
  const account = await moneyAccount('money-income-v2');
  await openSignedIn(page, account, '#/money');
  await addInV2(page, { type: 'Wpływ', amount: '30', newCategory: 'Prezenty', note: 'od taty' });
  await expect(page.getByText('Transakcja zapisana.')).toBeVisible();
  await expect.poll(async () => (await moneyState(account.uid)).balance).toEqual({ current: 80 });
  const state = await moneyState(account.uid);
  expect(state.moneyIncomeAllTime).toBe(30);
  expect(state.points).toEqual({ total: 120, earnedAllTime: 300, spentAllTime: 10 });
  expect(state.categories).toContainEqual({ name: 'Prezenty', color: '#ffd700', icon: '' });
  expect(state.transactions).toEqual([
    { type: 'income', amount: 30, category: 'Prezenty', note: 'od taty', date: utcToday(), source: 'manual', pointsCost: 0 },
  ]);
});

test('deleting an expense gives the money and the points back', async ({ page }) => {
  const account = await moneyAccount('money-delete');
  const before = await moneyState(account.uid);
  await openSignedIn(page, account, '#/money');
  await addInV2(page, { amount: '5', category: 'jedzenie', note: 'obiad' });
  await expect.poll(() => txCount(account.uid)).toBe(1);

  await page.getByRole('button', { name: /^Usuń: jedzenie/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć tę transakcję?' });
  await expect(dialog).toContainText('50 pkt wróci na konto');
  await dialog.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Transakcja usunięta.')).toBeVisible();
  await expect.poll(() => txCount(account.uid)).toBe(0);
  expect(await moneyState(account.uid)).toEqual(before);
});

test('an income that was already spent cannot be deleted below zero', async ({ page }) => {
  const account = await moneyAccount('money-delete-negative', { balance: 0 });
  await openSignedIn(page, account, '#/money');
  await addInV2(page, { type: 'Wpływ', amount: '20', category: 'gry' });
  await expect.poll(async () => (await moneyState(account.uid)).balance).toEqual({ current: 20 });
  await addInV2(page, { amount: '15', category: 'jedzenie' });
  await expect.poll(async () => (await moneyState(account.uid)).balance).toEqual({ current: 5 });
  const before = await moneyState(account.uid);

  await page.getByRole('button', { name: /^Usuń: gry/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Nie można usunąć tego wpływu: saldo spadłoby poniżej zera.')).toBeVisible();
  expect(await moneyState(account.uid)).toEqual(before);
});

test('two tabs saving at the same moment both count', async ({ page, context }) => {
  const account = await moneyAccount('money-two-tabs');
  await openSignedIn(page, account, '#/money');
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByTestId('money-balance')).toHaveText('50,00 zł');

  const fill = async (p, type, amount, category) => {
    await p.getByRole('button', { name: 'Dodaj transakcję' }).click();
    const sheet = p.getByRole('dialog', { name: 'Nowa transakcja' });
    await sheet.getByRole('radio', { name: type }).check();
    await sheet.getByLabel('Kwota').fill(amount);
    await sheet.getByLabel('Kategoria').selectOption({ label: category });
    return sheet.getByRole('button', { name: 'Zapisz transakcję' });
  };
  const saveA = await fill(page, 'Wydatek', '5', 'jedzenie');
  const saveB = await fill(other, 'Wpływ', '30', 'gry');
  await Promise.all([saveA.click(), saveB.click()]);

  await expect.poll(() => txCount(account.uid)).toBe(2);
  await expect.poll(async () => (await moneyState(account.uid)).balance).toEqual({ current: 75 });
  const state = await moneyState(account.uid);
  expect(state.points.total).toBe(70);
  expect(state.moneyIncomeAllTime).toBe(30);
  await expect(page.getByTestId('money-balance')).toHaveText('75,00 zł');
  await expect(other.getByTestId('money-balance')).toHaveText('75,00 zł');
});

test('the month, the limit, and the archive', async ({ page }) => {
  const account = await moneyAccount('money-month', { balance: 500 });
  const txs = db.collection(`users/${account.uid}/moneyTransactions`);
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const add = (type, amount, date, category = 'gry') =>
    txs.add({ type, amount, category, note: '', date, source: 'manual', pointsCost: 0, createdAt: new Date() });
  await add('expense', 150, day(0));
  await add('expense', 60.5, day(0), 'jedzenie');
  await add('income', 40, day(0));
  await add('expense', 12, '2025-01-15');

  await openSignedIn(page, account, '#/money');
  await expect(page.getByTestId('money-limit')).toHaveText('Przekroczono miesięczny limit wydatków: 210,50 zł z 200,00 zł.');
  const lists = page.getByRole('list', { name: /^\p{L}+, \d+ /u });
  await expect(lists).toHaveCount(1);
  await expect(lists.first().getByRole('listitem')).toHaveCount(3);

  await page.getByLabel('Okres').selectOption({ label: 'styczeń 2025' });
  await expect(lists).toHaveCount(1);
  await expect(lists.first()).toContainText('−12,00 zł');
});

test('opening Money prepares a new account as v1 does: documents, categories, M2', async ({ page }) => {
  const account = await createUser({ tag: 'money-fresh' });
  const txs = db.collection(`users/${account.uid}/moneyTransactions`);
  await txs.add({ type: 'income', amount: 10.5, category: 'x', note: '', date: '2026-01-01', source: 'manual', pointsCost: 0 });
  await txs.add({ type: 'income', amount: 0.25, category: 'x', note: '', date: '2026-01-02', source: 'manual', pointsCost: 0 });
  await txs.add({ type: 'expense', amount: 3, category: 'x', note: '', date: '2026-01-03', source: 'manual', pointsCost: 0 });

  await openSignedIn(page, account, '#/money');
  const user = db.doc(`users/${account.uid}`);
  await expect.poll(async () => (await user.get()).data().moneyIncomeAllTime).toBe(10.75);
  expect((await user.collection('money').doc('settings').get()).data()).toEqual({ monthlyLimit: 200, currency: 'PLN' });
  expect((await user.collection('money').doc('balance').get()).data()).toEqual({ current: 0 });
  const categories = (await user.collection('moneyCategories').get()).docs.map((d) => d.data());
  expect(categories.sort((a, b) => a.color.localeCompare(b.color))).toEqual(
    [
      { name: 'kieszonkowe', color: '#6c63ff', icon: '' },
      { name: 'gry', color: '#4ecca3', icon: '' },
      { name: 'jedzenie', color: '#ffd700', icon: '' },
      { name: 'szkoła', color: '#ff6b6b', icon: '' },
      { name: 'inne', color: '#00d2d3', icon: '' },
    ].sort((a, b) => a.color.localeCompare(b.color)),
  );
});

test.describe('v1 on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  async function openV1Money(page, context, account) {
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="money"]');
    await expect(page.locator('#money-balance')).not.toHaveText('0,00 zł');
  }

  test('parity G5.1: v1 saves the same expense to the same state', async ({ page, context }) => {
    const account = await moneyAccount('money-expense-v1');
    await openV1Money(page, context, account);
    await page.click('button[onclick="toggleMoneyTxForm()"]');
    await page.fill('#mtx-amount', '5');
    await page.selectOption('#mtx-category', 'jedzenie');
    await page.fill('#mtx-note', 'obiad');
    await page.click('#mtx-save-btn');
    await expect.poll(() => txCount(account.uid)).toBe(1);
    await expect.poll(async () => (await moneyState(account.uid)).points.total).toBe(70);
    expect(await moneyState(account.uid)).toEqual(afterLunch());
  });

  test('parity G5.6: v1 saves the same income with a new category', async ({ page, context }) => {
    const account = await moneyAccount('money-income-v1');
    await openV1Money(page, context, account);
    await page.click('button[onclick="toggleMoneyTxForm()"]');
    await page.click('#money-type-seg .seg-btn[data-type="income"]');
    await page.fill('#mtx-amount', '30');
    await page.selectOption('#mtx-category', '__new__');
    await page.fill('#mtx-newcat', 'Prezenty');
    await page.fill('#mtx-note', 'od taty');
    await page.click('#mtx-save-btn');
    await expect.poll(async () => (await moneyState(account.uid)).moneyIncomeAllTime).toBe(30);
    const state = await moneyState(account.uid);
    expect(state.balance).toEqual({ current: 80 });
    expect(state.points).toEqual({ total: 120, earnedAllTime: 300, spentAllTime: 10 });
    expect(state.categories).toContainEqual({ name: 'Prezenty', color: '#ffd700', icon: '' });
    expect(state.transactions).toEqual([
      { type: 'income', amount: 30, category: 'Prezenty', note: 'od taty', date: utcToday(), source: 'manual', pointsCost: 0 },
    ]);
  });

  test('v1 lists a transaction that v2 saved, with the balance it left', async ({ page, context }) => {
    const account = await moneyAccount('money-v2-to-v1');
    await openSignedIn(page, account, '#/money');
    await addInV2(page, { amount: '5', category: 'jedzenie', note: 'obiad' });
    await expect.poll(() => txCount(account.uid)).toBe(1);
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await openV1Money(page, context, account);
    await expect(page.locator('#money-balance')).toHaveText('45,00 zł');
    await expect(page.locator('#money-tx-list')).toContainText('jedzenie · obiad');
  });
});

// ── Loans (stage 3c-2; GOLDEN G6) ──

const loansOf = (uid) => db.collection(`users/${uid}/moneyLoans`);

/** The balance and every loan, ids and times aside (completedAt only as set or not). */
async function loansState(uid) {
  const balance = (await db.doc(`users/${uid}/money/balance`).get()).data();
  const loans = (await loansOf(uid).get()).docs
    .map((d) => {
      const { createdAt, completedAt, ...rest } = d.data();
      return { ...rest, completed: completedAt !== null && completedAt !== undefined };
    })
    .sort((a, b) => a.person.localeCompare(b.person));
  return { balance, loans, transactions: await txCount(uid) };
}

function seedLoan(uid, { person, amount, repaidAmount = 0, direction }) {
  return loansOf(uid).add({
    person,
    amount,
    repaidAmount,
    direction,
    note: '',
    date: utcToday(),
    createdAt: new Date(),
    completedAt: null,
  });
}

const lentToOla = () => ({
  balance: { current: 30 },
  loans: [
    { person: 'Ola', amount: 20, repaidAmount: 0, direction: 'lent', note: 'na kino', date: utcToday(), completed: false },
  ],
  transactions: 0,
});

test('G6.1: lending 20,00 zł takes it from the balance, as in v1', async ({ page }) => {
  const account = await moneyAccount('loan-new-v2');
  await openSignedIn(page, account, '#/money/loans');
  await page.getByRole('button', { name: 'Nowa pożyczka' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowa pożyczka' });
  await sheet.getByRole('button', { name: 'Dodaj pożyczkę' }).click();
  await expect(sheet.getByText('Podaj osobę.')).toBeVisible();
  await sheet.getByLabel('Osoba').fill(' Ola ');
  await sheet.getByLabel('Kwota').fill('20');
  await expect(sheet.getByText('Saldo po operacji: 30,00 zł')).toBeVisible();
  await sheet.getByLabel('Notatka (opcjonalnie)').fill('na kino');
  await sheet.getByRole('button', { name: 'Dodaj pożyczkę' }).click();

  await expect(page.getByText('Pożyczka dodana.')).toBeVisible();
  expect(await loansState(account.uid)).toEqual(lentToOla());
  const row = page.getByRole('list', { name: 'Pożyczki' }).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row.first()).toContainText('Pożyczka dla: Ola');
  await expect(row.first()).toContainText('Spłacono 0,00 zł z 20,00 zł (0%) · na kino');
  await expect(page.getByText('Do odzyskania')).toBeVisible();
});

test('G6.1 blocked, G6.4: lending or repaying more than the balance changes nothing', async ({ page }) => {
  const account = await moneyAccount('loan-too-much', { balance: 10 });
  await seedLoan(account.uid, { person: 'Tata', amount: 40, direction: 'borrowed' });
  const before = await loansState(account.uid);
  await openSignedIn(page, account, '#/money/loans');

  await page.getByRole('button', { name: 'Nowa pożyczka' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nowa pożyczka' });
  await sheet.getByLabel('Osoba').fill('Ola');
  await sheet.getByLabel('Kwota').fill('20');
  await sheet.getByRole('button', { name: 'Dodaj pożyczkę' }).click();
  await expect(sheet.getByText('Za mało środków na saldzie.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Zamknij' }).click();

  await page.getByRole('button', { name: 'Spłać: Pożyczka od: Tata' }).click();
  const repaySheet = page.getByRole('dialog', { name: 'Spłata: Tata' });
  await repaySheet.getByLabel('Kwota spłaty').fill('15');
  await repaySheet.getByRole('button', { name: 'Spłać' }).click();
  await expect(repaySheet.getByText('Za mało środków na saldzie.')).toBeVisible();
  expect(await loansState(account.uid)).toEqual(before);
});

test('G6.3: a repayment above what is left is capped, settles the loan once', async ({ page }) => {
  const account = await moneyAccount('loan-repay-v2');
  await seedLoan(account.uid, { person: 'Ola', amount: 20, repaidAmount: 5, direction: 'lent' });
  await openSignedIn(page, account, '#/money/loans');
  await page.getByRole('button', { name: 'Spłać: Pożyczka dla: Ola' }).click();
  const sheet = page.getByRole('dialog', { name: 'Spłata: Ola' });
  await expect(sheet.getByText('Zostało do spłaty: 15,00 zł.')).toBeVisible();
  await sheet.getByLabel('Kwota spłaty').fill('25');
  await expect(sheet.getByText('Spłata zostanie ograniczona do 15,00 zł. Saldo po operacji: 65,00 zł')).toBeVisible();
  await sheet.getByRole('button', { name: 'Spłać' }).click();

  await expect(page.getByText('Pożyczka rozliczona: Ola.')).toBeVisible();
  expect(await loansState(account.uid)).toEqual({
    balance: { current: 65 },
    loans: [{ person: 'Ola', amount: 20, repaidAmount: 20, direction: 'lent', note: '', date: utcToday(), completed: true }],
    transactions: 0,
  });
  await expect(page.getByRole('list', { name: 'Pożyczki' })).toContainText('Rozliczona');
  await expect(page.getByRole('button', { name: /^Spłać:/ })).toHaveCount(0);
});

test('G6.5/G6.6: deleting undoes what is outstanding, and is refused below zero', async ({ page }) => {
  const account = await moneyAccount('loan-delete', { balance: 10 });
  await seedLoan(account.uid, { person: 'Ola', amount: 20, repaidAmount: 5, direction: 'lent' });
  await seedLoan(account.uid, { person: 'Tata', amount: 40, direction: 'borrowed' });
  await openSignedIn(page, account, '#/money/loans');

  await page.getByRole('button', { name: 'Usuń: Pożyczka od: Tata' }).click();
  await page.getByRole('alertdialog', { name: 'Usunąć tę pożyczkę?' }).getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Nie można usunąć: saldo spadłoby poniżej zera. Najpierw spłać pożyczkę.')).toBeVisible();
  expect((await loansState(account.uid)).loans).toHaveLength(2);

  await page.getByRole('button', { name: 'Usuń: Pożyczka dla: Ola' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć tę pożyczkę?' });
  await expect(dialog).toContainText('Niespłacona część (15,00 zł) wróci na saldo.');
  await dialog.getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByText('Pożyczka usunięta.')).toBeVisible();
  await expect.poll(async () => (await loansState(account.uid)).balance).toEqual({ current: 25 });
  expect((await loansState(account.uid)).loans.map((l) => l.person)).toEqual(['Tata']);
});

test.describe('v1 on a desktop: loans', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  async function openV1Money(page, context, account) {
    await serveCdnFromNpm(context);
    await signInToApp(page, account);
    await page.click('.sidebar .nav-item[data-page="money"]');
    await expect(page.locator('#money-balance')).not.toHaveText('0,00 zł');
  }

  test('parity G6.1: v1 lends the same way', async ({ page, context }) => {
    const account = await moneyAccount('loan-new-v1');
    await openV1Money(page, context, account);
    await page.click('button[onclick="toggleLoanForm()"]');
    await page.fill('#loan-person', ' Ola ');
    await page.fill('#loan-amount', '20');
    await page.fill('#loan-note', 'na kino');
    await page.click('button[onclick="saveLoan()"]');
    await expect.poll(async () => (await loansState(account.uid)).loans.length).toBe(1);
    await expect.poll(async () => (await loansState(account.uid)).balance).toEqual({ current: 30 });
    expect(await loansState(account.uid)).toEqual(lentToOla());
  });

  test('parity G6.3: v1 caps and settles the same repayment', async ({ page, context }) => {
    const account = await moneyAccount('loan-repay-v1');
    const ref = await seedLoan(account.uid, { person: 'Ola', amount: 20, repaidAmount: 5, direction: 'lent' });
    await openV1Money(page, context, account);
    await page.click(`button[onclick="openLoanRepay('${ref.id}')"]`);
    await page.fill('#loan-repay-amount', '25');
    await page.click(`button[onclick="saveLoanRepay('${ref.id}')"]`);
    await expect.poll(async () => (await loansState(account.uid)).balance).toEqual({ current: 65 });
    expect((await loansState(account.uid)).loans).toEqual([
      { person: 'Ola', amount: 20, repaidAmount: 20, direction: 'lent', note: '', date: utcToday(), completed: true },
    ]);
  });

  test('v1 lists a loan that v2 added, with the balance it left', async ({ page, context }) => {
    const account = await moneyAccount('loan-v2-to-v1');
    await openSignedIn(page, account, '#/money/loans');
    await page.getByRole('button', { name: 'Nowa pożyczka' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nowa pożyczka' });
    await sheet.getByRole('radio', { name: 'Pożyczam od kogoś' }).check();
    await sheet.getByLabel('Osoba').fill('Tata');
    await sheet.getByLabel('Kwota').fill('12,5');
    await sheet.getByRole('button', { name: 'Dodaj pożyczkę' }).click();
    await expect.poll(async () => (await loansState(account.uid)).balance).toEqual({ current: 62.5 });
    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();

    await openV1Money(page, context, account);
    await expect(page.locator('#money-balance')).toHaveText('62,50 zł');
    await expect(page.locator('#loans-list')).toContainText('Tata');
    await expect(page.locator('#loans-list')).toContainText('12,50 zł');
  });
});
