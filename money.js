import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { animateCount, confettiBurst, confirmDialog, currentUser, dateISOLocal, db, escapeHtml, fmtMoney, formatPLN, loadProfile, monthKeys, monthLabelLocale, pulseEl, rateGeneral, round2, toast, todayStr, userProfile } from "./core.js";
import { checkAchievements, renderGoal } from "./dashboard.js";
import { queueOfflineDraft } from "./offline.js";

// Ten sam log + komunikat powtarza się w każdym handlerze zapisu w tym pliku;
// trzymamy go lokalnie, bo treść komunikatu jest specyficzna dla tych ścieżek.
function reportSaveError(e) {
  console.error(e);
  toast(i18next.t('shop.saveError'), 'error');
}

// ── Money Tracker ─────────────────────────────────────
// Osobny moduł budżetu (saldo PLN, transakcje, kategorie, pożyczki).
// Money = prawdziwe pieniądze, punkty = osobne wyzwanie w grze — NIE ma już
// zamiany punktów na saldo (usunięto "Wypłać punkty"/pendingPoints).
// Jedyny styk: wydatek (zakup) DODATKOWO odejmuje punkty LifeXP (jak dawny sklep).
// Dane: users/{uid}/money/{settings,balance} + users/{uid}/moneyTransactions,
// moneyCategories, moneyLoans (płasko; w firestore.rules transakcje/kategorie/
// pożyczki/ustawienia są owner-only, rodzic czyta tylko money/balance).
const MONEY_LIMIT_DEFAULT = 200;
let moneySettings = null;
export let moneyBalance = null;
let moneyCategories = [];
let moneyLoans = [];
let moneyTx = [];
let moneyTxType = 'expense';
let moneyArchiveMonth = '';     // '' = ostatnie 30 dni, 'YYYY-MM' = archiwum miesiąca
let loanFormOpen = false;
let loanDir = 'lent';           // 'lent' = ja pożyczam komuś; 'borrowed' = ktoś pożycza mnie
let loanRepayId = null;
let moneyCatSeeded = false;

const moneyDocRef = (name) => doc(db, 'users', currentUser.uid, 'money', name);
const currentMonthKey = () => monthKeys().cur;

export async function loadMoneyDocs() {
  const [sSnap, bSnap] = await Promise.all([getDoc(moneyDocRef('settings')), getDoc(moneyDocRef('balance'))]);
  if (sSnap.exists()) {
    moneySettings = sSnap.data();
  } else {
    moneySettings = { monthlyLimit: MONEY_LIMIT_DEFAULT, currency: 'PLN' };
    await setDoc(moneyDocRef('settings'), moneySettings);
  }
  if (bSnap.exists()) {
    moneyBalance = bSnap.data();
  } else {
    moneyBalance = { current: 0 };
    await setDoc(moneyDocRef('balance'), moneyBalance);
  }
}

export async function updateMoneyCurrent(delta) {
  const ref = moneyDocRef('balance');
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { current: round2((snap.data().current || 0) + delta) });
  else await setDoc(ref, { current: round2(delta) });
}

// Licznik sumy wpływów (income) na potrzeby osiągnięć pieniężnych — trwały na
// dokumencie usera (users/{uid}.moneyIncomeAllTime), niezależny od bieżącego salda.
// delta > 0 przy nowym wpływie, < 0 przy cofnięciu transakcji income.
export async function bumpMoneyIncome(delta) {
  if (!delta) return;
  await updateDoc(doc(db, 'users', currentUser.uid), { moneyIncomeAllTime: increment(round2(delta)) });
  userProfile.moneyIncomeAllTime = round2((userProfile.moneyIncomeAllTime || 0) + delta);
  if (delta > 0) await checkAchievements({ streak: 0 }).catch(() => {});
}

// Jednorazowy backfill licznika: gdy pole jeszcze nie istnieje, sumujemy WSZYSTKIE
// dotychczasowe wpływy (income) z pełnej historii transakcji i zapisujemy jako start,
// żeby osiągnięcia doliczyły już zdobyte pieniądze. Pełny odczyt kolekcji tylko raz.
export async function migrateMoneyIncome() {
  if (!currentUser || !userProfile || typeof userProfile.moneyIncomeAllTime === 'number') return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'moneyTransactions'));
    let sum = 0;
    snap.forEach(d => { const t = d.data(); if (t.type === 'income') sum += (t.amount || 0); });
    sum = round2(sum);
    await updateDoc(doc(db, 'users', currentUser.uid), { moneyIncomeAllTime: sum });
    userProfile.moneyIncomeAllTime = sum;
  } catch (e) { console.error('migrateMoneyIncome failed:', e); }
}

const MONEY_CAT_COLORS = ['#6c63ff', '#4ecca3', '#ffd700', '#ff6b6b', '#00d2d3', '#ff9f43', '#feca57', '#8a8fa8'];

export async function loadMoneyCategories() {
  const colRef = collection(db, 'users', currentUser.uid, 'moneyCategories');
  let snap = await getDocs(colRef);
  if (snap.empty && !moneyCatSeeded) {
    moneyCatSeeded = true;
    const seed = ['kieszonkowe', 'gry', 'jedzenie', 'szkoła', 'inne'];
    for (let i = 0; i < seed.length; i++) {
      await addDoc(colRef, { name: seed[i], color: MONEY_CAT_COLORS[i % MONEY_CAT_COLORS.length], icon: '' });
    }
    snap = await getDocs(colRef);
  }
  moneyCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pl'));
}

async function loadMoneyLoans() {
  const snap = await getDocs(collection(db, 'users', currentUser.uid, 'moneyLoans'));
  moneyLoans = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

async function loadMoneyTx() {
  const snap = await getDocs(collection(db, 'users', currentUser.uid, 'moneyTransactions'));
  moneyTx = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')
      || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

window.loadMoney = async () => {
  try {
    await loadMoneyDocs();
    await Promise.all([loadMoneyCategories(), loadMoneyLoans(), loadMoneyTx()]);
    renderMoney();
  } catch (e) {
    console.error('loadMoney failed:', e);
    toast(i18next.t('shop.saveError'), 'error');
  }
};

// Odświeża saldo + wiersz „W celach" (suma wpłat na cele pieniężne). Wołane też
// z depositGoal/removeGoal, dlatego wydzielone (bez pełnego renderMoney).
export function updateMoneyBalanceUI() {
  const balEl = document.getElementById('money-balance');
  if (balEl) animateCount(balEl, moneyBalance?.current || 0, fmtMoney);
  const goalsEl = document.getElementById('money-in-goals');
  if (goalsEl) {
    const inGoals = (userProfile?.goals || [])
      .filter(g => g.type === 'money')
      .reduce((s, g) => s + (g.saved || 0), 0);
    if (inGoals > 0) {
      goalsEl.textContent = i18next.t('money.inGoals') + ': ' + fmtMoney(inGoals);
      goalsEl.style.display = '';
    } else {
      goalsEl.style.display = 'none';
    }
  }
}

export function renderMoney() {
  updateMoneyBalanceUI();

  renderMoneyLimitAlert();
  renderMoneyCatSelect();
  renderLoanForm();
  renderLoansList();
  renderMoneyArchiveSelect();
  renderMoneyTxList();
  // Cele na dashboardzie (ukryty widok) — odśwież, by po zmianie salda/punktów były aktualne.
  if ((userProfile?.goals || []).length) renderGoal();
}

function renderMoneyLimitAlert() {
  const el = document.getElementById('money-limit-alert');
  const limit = moneySettings?.monthlyLimit ?? MONEY_LIMIT_DEFAULT;
  const mk = currentMonthKey();
  const spent = moneyTx
    .filter(t => t.type === 'expense' && (t.date || '').startsWith(mk))
    .reduce((s, t) => s + (t.amount || 0), 0);
  if (limit > 0 && spent > limit) {
    el.textContent = '⚠️ ' + i18next.t('money.limitAlert', {
      spent: round2(spent).toFixed(2).replace('.', ','), limit,
      interpolation: { escapeValue: false },
    });
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ── Formularz transakcji ──
window.toggleMoneyTxForm = () => {
  const f = document.getElementById('money-tx-form');
  const willOpen = f.style.display === 'none';
  f.style.display = willOpen ? 'block' : 'none';
  if (willOpen) {
    document.getElementById('mtx-date').value = todayStr();
    renderMoneyCatSelect();
    document.getElementById('mtx-amount').focus();
  }
};

window.setMoneyTxType = (type) => {
  moneyTxType = type;
  document.querySelectorAll('#money-type-seg .seg-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.type === type));
};

function renderMoneyCatSelect() {
  const sel = document.getElementById('mtx-category');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">${i18next.t('logActivity.choose')}</option>`
    + moneyCategories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')
    + `<option value="__new__">➕ ${i18next.t('money.addNewCat')}</option>`;
  if (cur && cur !== '__new__') sel.value = cur;
}

window.onMoneyCatChange = () => {
  document.getElementById('mtx-newcat-wrap').style.display =
    document.getElementById('mtx-category').value === '__new__' ? 'block' : 'none';
};

export async function addMoneyCategoryByName(name) {
  const exists = moneyCategories.find(c => (c.name || '').toLowerCase() === name.toLowerCase());
  if (exists) return exists.name;
  const color = MONEY_CAT_COLORS[moneyCategories.length % MONEY_CAT_COLORS.length];
  await addDoc(collection(db, 'users', currentUser.uid, 'moneyCategories'), { name, color, icon: '' });
  await loadMoneyCategories();
  return name;
}

function resetMoneyTxForm() {
  document.getElementById('mtx-amount').value = '';
  document.getElementById('mtx-note').value = '';
  document.getElementById('mtx-newcat').value = '';
  document.getElementById('mtx-newcat-wrap').style.display = 'none';
  document.getElementById('mtx-category').value = '';
  document.getElementById('money-tx-form').style.display = 'none';
}

// Offline → szkic. Saldo i ewentualna nowa kategoria weryfikowane/tworzone
// dopiero przy zatwierdzeniu online (świeży stan serwera), więc nazwa nowej
// kategorii idzie do kolejki jako zwykły tekst. Zwraca false, gdy nie ma czego
// zakolejkować — wtedy formularz zostaje wypełniony, żeby dało się poprawić.
function queueMoneyTxDraft(amount) {
  let cat = document.getElementById('mtx-category').value;
  if (cat === '__new__') cat = document.getElementById('mtx-newcat').value.trim();
  if (!cat) { toast(i18next.t('money.chooseCategory'), 'error'); return false; }
  queueOfflineDraft('money_tx',
    i18next.t(moneyTxType === 'income' ? 'offline.sumMoneyIncome' : 'offline.sumMoneyExpense',
      { amount: amount.toFixed(2).replace('.', ','), cat, interpolation: { escapeValue: false } }),
    { txType: moneyTxType, amount, category: cat,
      note: document.getElementById('mtx-note').value.trim(),
      date: document.getElementById('mtx-date').value || todayStr() });
  return true;
}

// Zwraca id kategorii, zakładając ją po drodze, gdy wybrano "nowa kategoria".
// null = brak wyboru (komunikat już pokazany).
async function resolveMoneyTxCategory() {
  let category = document.getElementById('mtx-category').value;
  if (category === '__new__') {
    const newName = document.getElementById('mtx-newcat').value.trim();
    if (!newName) { toast(i18next.t('money.chooseCategory'), 'error'); return null; }
    category = await addMoneyCategoryByName(newName);
  }
  if (!category) { toast(i18next.t('money.chooseCategory'), 'error'); return null; }
  return category;
}

// Zakup (wydatek) odejmuje też punkty LifeXP — jak dawny sklep. Clamp na 0
// (saldo PLN jest bramką, punktów nie schodzimy poniżej zera). pointsCost
// zapisujemy przy transakcji, żeby przy usunięciu dokładnie je zwrócić.
function pointsCostForTx(amount) {
  if (moneyTxType !== 'expense') return 0;
  const wanted = Math.ceil(amount / rateGeneral());
  return Math.min(wanted, userProfile.points?.total || 0);
}

async function persistMoneyTx({ amount, category, note, date, pointsCost }) {
  await addDoc(collection(db, 'users', currentUser.uid, 'moneyTransactions'), {
    type: moneyTxType, amount, category, note, date, source: 'manual', pointsCost, createdAt: new Date(),
  });
  await updateMoneyCurrent(moneyTxType === 'income' ? amount : -amount);
  if (moneyTxType === 'income') await bumpMoneyIncome(amount);
}

async function chargePointsForTx(pointsCost) {
  await updateDoc(doc(db, 'users', currentUser.uid), {
    'points.total': increment(-pointsCost),
    'points.spentAllTime': increment(pointsCost),
  });
  await loadProfile();
  refreshDashboardBalances();
}

window.saveMoneyTx = async () => {
  const amount = round2(parseFloat(document.getElementById('mtx-amount').value));
  if (!amount || amount <= 0) return toast(i18next.t('money.enterAmount'), 'error');

  if (!navigator.onLine) {
    if (queueMoneyTxDraft(amount)) resetMoneyTxForm();
    return;
  }

  // Blokada ujemnego salda — wydatek nie może zejść poniżej zera.
  if (moneyTxType === 'expense' && (moneyBalance?.current || 0) - amount < 0) {
    return toast(i18next.t('money.notEnoughBalance'), 'error');
  }

  const category = await resolveMoneyTxCategory();
  if (!category) return;

  const note = document.getElementById('mtx-note').value.trim();
  const date = document.getElementById('mtx-date').value || todayStr();

  const btn = document.getElementById('mtx-save-btn');
  btn.disabled = true;
  try {
    const pointsCost = pointsCostForTx(amount);

    await persistMoneyTx({ amount, category, note, date, pointsCost });
    if (pointsCost > 0) await chargePointsForTx(pointsCost);

    resetMoneyTxForm();

    await loadMoney();
    pulseEl(document.querySelector('#page-money .balance-card'));
    toast(pointsCost > 0 ? i18next.t('money.txSavedPts', { pts: pointsCost }) : i18next.t('money.txSaved'));
  } catch (e) {
    reportSaveError(e);
  }
  btn.disabled = false;
};

window.deleteMoneyTx = async (id) => {
  if (!await confirmDialog(i18next.t('money.confirmDeleteTx'))) return;
  try {
    const ref = doc(db, 'users', currentUser.uid, 'moneyTransactions', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const t = snap.data();
    await deleteDoc(ref);

    // Cofnij wpływ transakcji na saldo.
    await updateMoneyCurrent(t.type === 'income' ? -(t.amount || 0) : (t.amount || 0));
    // Skoryguj też licznik sumy wpływów (nie odbieramy już zdobytych odznak).
    if (t.type === 'income') await bumpMoneyIncome(-(t.amount || 0));

    // Zwróć punkty pobrane przy zakupie (wydatek z pointsCost).
    if ((t.pointsCost || 0) > 0) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        'points.total': increment(t.pointsCost),
        'points.spentAllTime': increment(-t.pointsCost),
      });
      await loadProfile();
      refreshDashboardBalances();
    }

    await loadMoney();
    toast(i18next.t('money.txDeleted'));
  } catch (e) {
    reportSaveError(e);
  }
};

// ── Pożyczki (Loans) ──
// 'lent'     = ja pożyczam komuś → oni winni mi; tworzenie ZMNIEJSZA saldo, spłata je zwiększa.
// 'borrowed' = ktoś pożycza mnie → ja winien; tworzenie ZWIĘKSZA saldo, spłata je zmniejsza.
// Pożyczki ruszają money/balance.current (jak transakcje), ale mają własny rejestr
// (moneyLoans), NIE tworzą wpisów w liście transakcji i NIE odejmują punktów.
window.toggleLoanForm = () => {
  loanFormOpen = !loanFormOpen;
  if (loanFormOpen) loanDir = 'lent';
  renderLoanForm();
};

window.setLoanDir = (d) => {
  loanDir = d;
  document.querySelectorAll('#loan-dir-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.dir === d));
};

function renderLoanForm() {
  const el = document.getElementById('loan-form');
  if (!el) return;
  const t = (k, o) => i18next.t(k, o);
  if (!loanFormOpen) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div class="segmented" id="loan-dir-seg">
      <button class="seg-btn ${loanDir === 'lent' ? 'active' : ''}" data-dir="lent" onclick="setLoanDir('lent')">${t('loan.iLent')}</button>
      <button class="seg-btn ${loanDir === 'borrowed' ? 'active' : ''}" data-dir="borrowed" onclick="setLoanDir('borrowed')">${t('loan.iBorrowed')}</button>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t('loan.person')}</label><input type="text" id="loan-person" maxlength="40" placeholder="${t('loan.personPh')}"></div>
      <div class="form-group"><label>${t('loan.amount')}</label><input type="number" id="loan-amount" min="0.01" max="1000000" step="0.01" placeholder="np. 50.00"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t('money.date')}</label><input type="date" id="loan-date"></div>
      <div class="form-group"><label>${t('money.note')}</label><input type="text" id="loan-note" maxlength="100" placeholder="${t('money.notePh')}"></div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-ghost" style="flex:1" onclick="toggleLoanForm()">${t('settings.cancel')}</button>
      <button class="btn-success" style="flex:2" onclick="saveLoan()">${t('loan.save')}</button>
    </div>`;
  document.getElementById('loan-date').value = todayStr();
  document.getElementById('loan-person').focus();
}

function renderLoansList() {
  const el = document.getElementById('loans-list');
  if (!el) return;
  const t = (k, o) => i18next.t(k, o);

  if (moneyLoans.length === 0) { el.innerHTML = `<p class="text2">${t('loan.none')}</p>`; return; }

  const outstanding = (l) => Math.max(0, round2((l.amount || 0) - (l.repaidAmount || 0)));
  const owedToMe = moneyLoans.filter(l => l.direction === 'lent').reduce((s, l) => s + outstanding(l), 0);
  const iOwe     = moneyLoans.filter(l => l.direction === 'borrowed').reduce((s, l) => s + outstanding(l), 0);
  const summary = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
      <span class="text2">${t('loan.owedToMe')}: <strong style="color:var(--accent2)">${fmtMoney(owedToMe)}</strong></span>
      <span class="text2">${t('loan.iOwe')}: <strong style="color:var(--warn)">${fmtMoney(iOwe)}</strong></span>
    </div>`;

  const rows = moneyLoans.map(l => {
    const repaid = l.repaidAmount || 0, total = l.amount || 1;
    const pct = Math.min(100, (repaid / total) * 100);
    const done = repaid >= total;
    const isLent = l.direction === 'lent';
    const label = isLent ? t('loan.theyOwe', { person: l.person }) : t('loan.youOwe', { person: l.person });
    const note = l.note ? ` · ${escapeHtml(l.note)}` : '';
    const repayForm = loanRepayId === l.id ? `
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="number" id="loan-repay-amount" min="0.01" max="1000000" step="0.01" placeholder="${t('loan.repayPh')}" style="flex:1">
        <button class="btn-primary btn-sm" onclick="saveLoanRepay('${l.id}')">${t('loan.repay')}</button>
        <button class="btn-ghost btn-sm" onclick="openLoanRepay(null)">✕</button>
      </div>` : '';
    return `
      <div class="money-loan" style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:14px">${isLent ? '💸' : '🤝'} ${label}${done ? ' ✅' : ''}</span>
          <div style="display:flex;gap:6px">
            ${done ? '' : `<button class="btn-secondary btn-sm" onclick="openLoanRepay('${l.id}')">${t('loan.repay')}</button>`}
            <button class="btn-ghost btn-sm" onclick="deleteLoan('${l.id}')">${t('goal.remove')}</button>
          </div>
        </div>
        <div class="progress-bar-wrap" style="margin-bottom:6px">
          <div class="progress-bar" style="width:${pct}%;${done ? 'background:var(--accent2)' : ''}"></div>
        </div>
        <span class="text2">${fmtMoney(repaid)} / ${fmtMoney(total)} · <strong>${pct.toFixed(0)}%</strong>${note}</span>
        ${repayForm}
      </div>`;
  }).join('');

  el.innerHTML = summary + rows;
}

window.openLoanRepay = (id) => {
  loanRepayId = (loanRepayId === id) ? null : id;
  renderLoansList();
  if (loanRepayId) document.getElementById('loan-repay-amount')?.focus();
};

export async function saveLoan() {
  const person = document.getElementById('loan-person').value.trim();
  const amount = round2(parseFloat(document.getElementById('loan-amount').value));
  const date = document.getElementById('loan-date').value || todayStr();
  const note = document.getElementById('loan-note').value.trim();
  if (!person) return toast(i18next.t('loan.enterPerson'), 'error');
  if (!amount || amount <= 0) return toast(i18next.t('money.enterAmount'), 'error');
  // 'lent' zmniejsza saldo — nie pozwól zejść poniżej zera.
  if (loanDir === 'lent' && (moneyBalance?.current || 0) - amount < 0) {
    return toast(i18next.t('money.notEnoughBalance'), 'error');
  }
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'moneyLoans'), {
      person, amount, repaidAmount: 0, direction: loanDir, note, date, createdAt: new Date(), completedAt: null,
    });
    await updateMoneyCurrent(loanDir === 'borrowed' ? amount : -amount);
    loanFormOpen = false;
    await loadMoney();
    pulseEl(document.querySelector('#page-money .balance-card'));
    toast(i18next.t('loan.added'));
  } catch (e) {
    reportSaveError(e);
  }
}
window.saveLoan = saveLoan;

export async function saveLoanRepay(id) {
  const l = moneyLoans.find(x => x.id === id);
  if (!l) return;
  const outstanding = Math.max(0, round2((l.amount || 0) - (l.repaidAmount || 0)));
  let amount = round2(parseFloat(document.getElementById('loan-repay-amount').value));
  if (!amount || amount <= 0) return toast(i18next.t('money.enterAmount'), 'error');
  if (amount > outstanding) amount = outstanding;   // nie spłacaj więcej niż zostało
  // Spłata pożyczki 'borrowed' = ja oddaję → saldo maleje; nie pozwól zejść poniżej zera.
  if (l.direction === 'borrowed' && (moneyBalance?.current || 0) - amount < 0) {
    return toast(i18next.t('money.notEnoughBalance'), 'error');
  }
  try {
    const newRepaid = round2((l.repaidAmount || 0) + amount);
    const done = newRepaid >= (l.amount || 0);
    await updateDoc(doc(db, 'users', currentUser.uid, 'moneyLoans', id), {
      repaidAmount: newRepaid,
      completedAt: done ? (l.completedAt || new Date()) : null,
    });
    await updateMoneyCurrent(l.direction === 'borrowed' ? -amount : amount);
    loanRepayId = null;
    await loadMoney();
    if (done) { confettiBurst(); toast(i18next.t('loan.settled', { person: l.person, interpolation: { escapeValue: false } })); }
    else toast(i18next.t('loan.repaid', { amount: fmtMoney(amount), interpolation: { escapeValue: false } }));
  } catch (e) {
    reportSaveError(e);
  }
}
window.saveLoanRepay = saveLoanRepay;

window.deleteLoan = async (id) => {
  const l = moneyLoans.find(x => x.id === id);
  if (!l) return;
  const outstanding = Math.max(0, round2((l.amount || 0) - (l.repaidAmount || 0)));
  // Usunięcie cofa niespłaconą część z salda. Dla 'borrowed' to odjęcie —
  // zablokuj, jeśli saldo zeszłoby poniżej zera (najpierw trzeba spłacić).
  if (l.direction === 'borrowed' && (moneyBalance?.current || 0) - outstanding < 0) {
    return toast(i18next.t('loan.cantDeleteNegative'), 'error');
  }
  if (!await confirmDialog(i18next.t('loan.confirmDelete'))) return;
  try {
    await updateMoneyCurrent(l.direction === 'borrowed' ? -outstanding : outstanding);
    await deleteDoc(doc(db, 'users', currentUser.uid, 'moneyLoans', id));
    await loadMoney();
    toast(i18next.t('loan.deleted'));
  } catch (e) {
    reportSaveError(e);
  }
};

// Odświeża liczby salda punktów na (ukrytym) dashboardzie po zmianie punktów w Money.
function refreshDashboardBalances() {
  if (!userProfile) return;
  const totalPts = userProfile.points?.total || 0;
  const set = (id, val, fmt) => { const el = document.getElementById(id); if (el) animateCount(el, val, fmt); };
  set('dash-pln', totalPts, formatPLN);
  set('dash-pts-num', totalPts, v => Math.round(v).toString());
  set('dash-spent', userProfile.points?.spentAllTime || 0, formatPLN);
}

// ── Lista transakcji (30 dni + archiwum po miesiącu) ──

function renderMoneyArchiveSelect() {
  const sel = document.getElementById('money-archive-select');
  if (!sel) return;
  const months = [...new Set(moneyTx.map(t => (t.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  sel.innerHTML = `<option value="">${i18next.t('money.last30')}</option>`
    + months.map(mk => `<option value="${mk}">${monthLabelLocale(mk)}</option>`).join('');
  sel.value = months.includes(moneyArchiveMonth) ? moneyArchiveMonth : '';
  moneyArchiveMonth = sel.value;
}

window.setMoneyArchiveMonth = (mk) => { moneyArchiveMonth = mk; renderMoneyTxList(); };

function renderMoneyTxList() {
  const el = document.getElementById('money-tx-list');
  if (!el) return;
  let list;
  if (moneyArchiveMonth) {
    list = moneyTx.filter(t => (t.date || '').startsWith(moneyArchiveMonth));
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutISO = dateISOLocal(cutoff);
    list = moneyTx.filter(t => (t.date || '') >= cutISO);
  }
  if (list.length === 0) {
    el.innerHTML = `<p class="text2">${i18next.t('money.noTx')}</p>`;
    return;
  }
  el.innerHTML = list.map(t => {
    const inc = t.type === 'income';
    const cat = moneyCategories.find(c => c.name === t.category);
    const dotColor = cat?.color || (inc ? 'var(--accent2)' : 'var(--warn)');
    const [yy, mm, dd] = (t.date || '--').split('-');
    const note = t.note ? ` · ${escapeHtml(t.note)}` : '';
    return `<div class="purchase-item">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">
        <span style="width:10px;height:10px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.category || '—')}${note}</div>
          <div class="text2">${dd}.${mm}.${yy}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span style="font-weight:700;font-family:var(--mono);color:${inc ? 'var(--accent2)' : 'var(--warn)'}">${inc ? '+' : '−'}${fmtMoney(t.amount)}</span>
        <button class="activity-del" onclick="deleteMoneyTx('${t.id}')" title="Usuń">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Money w Ustawieniach: limit + kategorie ──
export async function loadMoneySettingsUI() {
  try {
    if (!moneySettings) await loadMoneyDocs();
    if (moneyCategories.length === 0) await loadMoneyCategories();
    const inp = document.getElementById('set-money-limit');
    if (inp) inp.value = moneySettings?.monthlyLimit ?? MONEY_LIMIT_DEFAULT;
    renderMoneyCatSettings();
  } catch (e) { console.error('loadMoneySettingsUI failed:', e); }
}

function renderMoneyCatSettings() {
  const el = document.getElementById('money-cat-list');
  if (!el) return;
  if (moneyCategories.length === 0) {
    el.innerHTML = `<p class="text2">${i18next.t('money.noCats')}</p>`;
    return;
  }
  el.innerHTML = moneyCategories.map(c => `
    <div class="preset-item" style="margin-bottom:6px">
      <span class="preset-info"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color || 'var(--accent)'};margin-right:8px"></span>${escapeHtml(c.name)}</span>
      <button class="btn-secondary" onclick="deleteMoneyCategory('${c.id}')" style="padding:4px 10px;font-size:12px">${i18next.t('shop.delete')}</button>
    </div>`).join('');
}

export async function saveMoneyLimit() {
  const v = parseFloat(document.getElementById('set-money-limit').value);
  const limit = (isNaN(v) || v < 0) ? MONEY_LIMIT_DEFAULT : round2(v);
  try {
    await setDoc(moneyDocRef('settings'), { monthlyLimit: limit, currency: 'PLN' }, { merge: true });
    moneySettings = { ...(moneySettings || {}), monthlyLimit: limit, currency: 'PLN' };
    toast(i18next.t('money.limitSaved'));
  } catch (e) {
    reportSaveError(e);
  }
}
window.saveMoneyLimit = saveMoneyLimit;

export async function addMoneyCategory() {
  const input = document.getElementById('new-money-cat');
  const name = input.value.trim();
  if (!name) return;
  if (moneyCategories.some(c => (c.name || '').toLowerCase() === name.toLowerCase())) {
    return toast(i18next.t('money.catExists'), 'error');
  }
  try {
    await addMoneyCategoryByName(name);
    input.value = '';
    renderMoneyCatSettings();
    toast(i18next.t('money.catAdded'));
  } catch (e) {
    reportSaveError(e);
  }
}
window.addMoneyCategory = addMoneyCategory;

window.deleteMoneyCategory = async (id) => {
  if (!await confirmDialog(i18next.t('money.confirmDeleteCat'))) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'moneyCategories', id));
    await loadMoneyCategories();
    renderMoneyCatSettings();
    toast(i18next.t('money.catDeleted'));
  } catch (e) {
    reportSaveError(e);
  }
};

