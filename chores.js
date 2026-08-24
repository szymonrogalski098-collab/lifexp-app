import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { animateCount, confettiBurst, confirmDialog, currentUser, dateISOLocal, db, escapeHtml, fmtMoney, monthKeyOf, monthKeys, monthLabelLocale, prefersReduced, pulseEl, rateChores, round2, toast, todayStr } from "./core.js";
import { bumpMoneyIncome, updateMoneyCurrent } from "./money.js";
import { queueOfflineDraft } from "./offline.js";

// ── Obowiązki domowe (osobny rejestr, niezależny od punktów LifeXP) ──

// Definicje obowiązków — edytowalne w Ustawieniach, przechowywane w Firestore
// (users/{uid}/choreDefs). Seed poniżej zachowuje te same `id` co dawna stała
// lista, żeby historyczne wpisy `chores` (referencujące choreId) się nie zgubiły.
export let choreDefs = [];
let choreDefsSeeded = false;
const choreDefById = (id) => choreDefs.find(c => c.id === id) || { name: 'Obowiązek', points: 0, emoji: '' };

async function ensureChoreDefsSeeded() {
  if (choreDefsSeeded) return;
  const snap = await getDocs(collection(db, 'users', currentUser.uid, 'choreDefs'));
  if (!snap.empty) { choreDefsSeeded = true; return; }
  const seed = [
    { id: 'entryway',         name: 'Odkurzanie wiatrołapu (buty, kurtki, czapki)', desc: '', emoji: '🧹', points: 10, oneTime: false, order: 0 },
    { id: 'vacuum_stairs',    name: 'Odkurzanie schodów',                           desc: '', emoji: '🧹', points: 5,  oneTime: false, order: 1 },
    { id: 'wash_stairs',      name: 'Zmycie schodów na mokro',                      desc: '', emoji: '🪣', points: 30, oneTime: false, order: 2 },
    { id: 'vacuum_ground',    name: 'Kompleksowe odkurzenie całego parteru',        desc: '', emoji: '🧹', points: 40, oneTime: false, order: 3 },
    { id: 'room_quick',       name: 'Pobieżne sprzątnięcie pokoju',                 desc: '', emoji: '🛏️', points: 30, oneTime: false, order: 4 },
    { id: 'room_deep',        name: 'Gruntowne sprzątnięcie pokoju',                desc: '', emoji: '🧽', points: 60, oneTime: false, order: 5 },
    { id: 'trash_segregated', name: 'Opróżnienie głównego kosza segregowanego',     desc: '', emoji: '🗑️', points: 40, oneTime: false, order: 6 },
    { id: 'dishwasher',       name: 'Opróżnienie zmywarki',                         desc: '', emoji: '🍽️', points: 15, oneTime: false, order: 7 },
  ];
  for (const c of seed) {
    const { id, ...data } = c;
    await setDoc(doc(db, 'users', currentUser.uid, 'choreDefs', id), data);
  }
  choreDefsSeeded = true;
}

export async function loadChoreDefs() {
  await ensureChoreDefsSeeded();
  const q = query(collection(db, 'users', currentUser.uid, 'choreDefs'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  choreDefs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

let choreEntries = [];        // wszystkie nierozliczone wpisy
let chorePayouts = [];        // historia wypłat (durable)
let choreTab = 'current';     // 'current' | 'prev'
let choreSelectedDay = null;  // dateISO rozwiniętego dnia
let chorePicking = false;

// monthLabelLocale() mieszka w core.js (importowana na górze pliku) — ten sam
// format "Miesiąc rok" reużywają obowiązki i Money, więc jest wspólnym helperem.
const monthLabel = (mk) => monthLabelLocale(mk);
const selectedMonthKey = () => { const { cur, prev } = monthKeys(); return choreTab === 'current' ? cur : prev; };
function syncChoreTabs() {
  document.querySelectorAll('#chore-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === choreTab));
}
function renderChoreWeekdayHeader() {
  const el = document.getElementById('chore-weekdays');
  if (!el) return;
  const days = i18next.t('dayNamesShort', { returnObjects: true }); // [Nd,Pn,Wt,Śr,Cz,Pt,Sb] — niedziela=0
  el.innerHTML = [1, 2, 3, 4, 5, 6, 0].map(i => `<span>${days[i]}</span>`).join('');
}

export async function loadChores() {
  await loadChoreDefs();
  // Wpisy NIE są kasowane retencją — to realna kasa do wypłaty. Czyszczenie
  // następuje dopiero przy rozliczeniu (settleChores → archiwum w chorePayouts).
  const [eSnap, pSnap] = await Promise.all([
    getDocs(collection(db, 'users', currentUser.uid, 'chores')),
    getDocs(collection(db, 'users', currentUser.uid, 'chorePayouts')),
  ]);
  choreEntries = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  chorePayouts = pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  syncChoreTabs();
  renderChores();
}

window.selectChoreTab = (tab) => {
  choreTab = tab;
  choreSelectedDay = null;
  syncChoreTabs();
  renderChores();
};

export function renderChores() {
  renderChoreWeekdayHeader();
  const rateLabel = document.getElementById('chore-rate-label');
  if (rateLabel) rateLabel.textContent = i18next.t('chores.rateLabel', { rate: rateChores().toFixed(2).replace('.', ',') });

  const mk = selectedMonthKey();
  const monthEntries = choreEntries.filter(e => e.monthKey === mk);

  document.getElementById('chore-month-label').textContent = monthLabel(mk);
  const pts = monthEntries.reduce((s, e) => s + (e.points || 0), 0);
  animateCount(document.getElementById('chore-pts'), pts);
  animateCount(document.getElementById('chore-pln'), pts, v => (v * rateChores()).toFixed(2).replace('.', ',') + ' zł');

  document.getElementById('chore-fab').style.display = choreTab === 'current' ? 'flex' : 'none';

  renderCalendar(mk, monthEntries);
  renderDayDetail(monthEntries);
  renderOutstanding();
  renderPayouts();
}

// Globalne saldo „do wypłaty" = wszystkie nierozliczone wpisy.
function renderOutstanding() {
  const pts = choreEntries.reduce((s, e) => s + (e.points || 0), 0);
  animateCount(document.getElementById('chore-outstanding-pts'), pts);
  animateCount(document.getElementById('chore-outstanding'), pts, v => (v * rateChores()).toFixed(2).replace('.', ',') + ' zł');
  document.getElementById('chore-settle-btn').disabled = pts === 0;
}

function renderPayouts() {
  const el = document.getElementById('chore-payout-list');
  if (chorePayouts.length === 0) { el.innerHTML = `<p class="text2">${i18next.t('chores.noPayouts')}</p>`; return; }
  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  el.innerHTML = chorePayouts.map(p => {
    const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
    const ds = d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    const period = (p.fromISO && p.toISO)
      ? ' · ' + i18next.t('chores.payoutPeriod', { from: `${p.fromISO.slice(8)}.${p.fromISO.slice(5, 7)}`, to: `${p.toISO.slice(8)}.${p.toISO.slice(5, 7)}` })
      : '';
    return `<div class="payout-item">
      <div>
        <div class="pi-amount">${(p.amountPln || 0).toFixed(2).replace('.', ',')} zł</div>
        <div class="text2">${ds}${period}</div>
      </div>
      <div class="pi-pts">${p.points} ${i18next.t('logActivity.pkt')}</div>
    </div>`;
  }).join('');
}

// Rozliczenie: archiwizuj wszystkie nierozliczone wpisy do chorePayouts i usuń je.
export async function settleChores() {
  const pts = choreEntries.reduce((s, e) => s + (e.points || 0), 0);
  if (pts === 0) return;
  const amount = round2(pts * rateChores());
  if (!await confirmDialog(i18next.t('confirm.settleChores', { amount: fmtMoney(amount), pts, interpolation: { escapeValue: false } }), i18next.t('common.settle'))) return;

  const btn = document.getElementById('chore-settle-btn');
  btn.disabled = true;
  try {
    const dates = choreEntries.map(e => e.dateISO).sort();
    await addDoc(collection(db, 'users', currentUser.uid, 'chorePayouts'), {
      points: pts, amountPln: amount,
      fromISO: dates[0], toISO: dates[dates.length - 1],
      createdAt: new Date()
    });
    for (const e of choreEntries) {
      try { await deleteDoc(doc(db, 'users', currentUser.uid, 'chores', e.id)); } catch (_) {}
    }

    // Rozliczona kwota trafia na saldo Money jako przychód (osobny wpis transakcji).
    await updateMoneyCurrent(amount);
    await addDoc(collection(db, 'users', currentUser.uid, 'moneyTransactions'), {
      type: 'income', amount, category: i18next.t('choreMsg.incomeCategory'), note: '',
      date: todayStr(), source: 'chore_payout', createdAt: new Date(),
    });
    await bumpMoneyIncome(amount);

    choreSelectedDay = null;
    await loadChores();
    confettiBurst();
    pulseEl(document.querySelector('#page-chores .payout-card'));
    toast(i18next.t('choreMsg.settled', { amount: fmtMoney(amount), interpolation: { escapeValue: false } }));
  } catch (e) {
    console.error(e);
    toast(i18next.t('choreMsg.settleError'), 'error');
    btn.disabled = false;
  }
}
window.settleChores = settleChores;

function renderCalendar(mk, monthEntries) {
  const [y, m] = mk.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // poniedziałek = 0
  const todayISO = dateISOLocal();

  const ptsByDay = {};
  monthEntries.forEach(e => { ptsByDay[e.dateISO] = (ptsByDay[e.dateISO] || 0) + (e.points || 0); });

  let html = '';
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-cell blank"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${mk}-${String(d).padStart(2, '0')}`;
    const has = ptsByDay[iso] != null;
    const cls = ['cal-cell'];
    if (has) cls.push('has');
    if (iso === todayISO) cls.push('today');
    if (iso === choreSelectedDay) cls.push('selected');
    const click = has ? ` onclick="selectChoreDay('${iso}')"` : '';
    const badge = has ? `<span class="cal-pts">${ptsByDay[iso]}</span>` : '';
    html += `<div class="${cls.join(' ')}"${click}><span>${d}</span>${badge}</div>`;
  }
  document.getElementById('chore-cal').innerHTML = html;
}

window.selectChoreDay = (iso) => {
  choreSelectedDay = (choreSelectedDay === iso) ? null : iso;
  renderChores();
};

function renderDayDetail(monthEntries) {
  const el = document.getElementById('chore-day-detail');
  const dayEntries = choreSelectedDay
    ? monthEntries.filter(e => e.dateISO === choreSelectedDay)
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    : [];
  if (dayEntries.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const [yy, mm, dd] = choreSelectedDay.split('-');
  el.style.display = 'block';
  el.innerHTML = `<h4>${dd}.${mm}.${yy}</h4>` + dayEntries.map(e => `
    <div class="chore-entry">
      <span class="ce-name">${escapeHtml(e.choreName || choreDefById(e.choreId).name)}</span>
      <span class="ce-pts">+${e.points} pkt</span>
      <button class="activity-del" onclick="deleteChoreEntry('${e.id}')" title="Usuń">✕</button>
    </div>`).join('');
}

// ── Bottom-sheet ──
window.openChoreSheet = () => {
  const list = document.getElementById('chore-sheet-list');
  list.innerHTML = choreDefs.length === 0
    ? `<div class="sheet-empty">${i18next.t('chores.sheetEmpty')}</div>`
    : choreDefs.map(c => `
      <div class="sheet-chore" onclick="pickChore('${c.id}', this)">
        <span class="sc-name">${c.emoji ? c.emoji + ' ' : ''}${escapeHtml(c.name)}</span>
        <span class="sc-pts">+${c.points} ${i18next.t('logActivity.pkt')}</span>
        <svg class="sc-check" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>
      </div>`).join('');
  document.getElementById('chore-sheet').classList.add('open');
};
window.closeChoreSheet = () => document.getElementById('chore-sheet').classList.remove('open');

window.pickChore = (choreId, el) => {
  if (chorePicking) return;
  chorePicking = true;
  if (!prefersReduced()) el.classList.add('picked');
  const delay = prefersReduced() ? 0 : 450;
  setTimeout(async () => {
    closeChoreSheet();
    await addChore(choreId);
    chorePicking = false;
  }, delay);
};

// Modal "dzisiaj / wczoraj?" → Promise<boolean> (true = wczoraj)
function askYesterday(choreName, yesterdayISO) {
  return new Promise(resolve => {
    const modal = document.getElementById('chore-yesterday-modal');
    const [, mm, dd] = yesterdayISO.split('-');
    document.getElementById('chore-yest-text').textContent =
      i18next.t('chores.yesterdayText', { name: choreName, date: `${dd}.${mm}`, interpolation: { escapeValue: false } });
    modal.classList.add('open');
    const yes = document.getElementById('chore-yest-yes');
    const no = document.getElementById('chore-yest-no');
    const finish = (val) => { modal.classList.remove('open'); yes.onclick = null; no.onclick = null; resolve(val); };
    yes.onclick = () => finish(true);
    no.onclick = () => finish(false);
  });
}


async function addChore(choreId) {
  const chore = choreDefById(choreId);
  const todayISO = dateISOLocal();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterdayISO = dateISOLocal(y);

  // Offline → szkic z dzisiejszą datą lokalną (bez pytania "wczoraj?" — data
  // szkicu = moment stworzenia offline).
  if (!navigator.onLine) {
    queueOfflineDraft('chore',
      i18next.t('offline.sumChore', { name: chore.name, pts: chore.points, interpolation: { escapeValue: false } }),
      { choreId, choreName: chore.name, choreEmoji: chore.emoji || '', points: chore.points, oneTime: !!chore.oneTime, dateISO: todayISO });
    return;
  }

  const todayHas = choreEntries.some(e => e.choreId === choreId && e.dateISO === todayISO);
  const sameMonth = monthKeyOf(yesterdayISO) === monthKeyOf(todayISO);
  const yesterdayHas = choreEntries.some(e => e.choreId === choreId && e.dateISO === yesterdayISO);

  let dateISO = todayISO;
  if (todayHas && sameMonth && !yesterdayHas) {
    if (await askYesterday(chore.name, yesterdayISO)) dateISO = yesterdayISO;
  }

  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'chores'), {
      choreId, choreName: chore.name, choreEmoji: chore.emoji || '',
      points: chore.points, dateISO, monthKey: monthKeyOf(dateISO), createdAt: new Date()
    });
    if (chore.oneTime) {
      try { await deleteDoc(doc(db, 'users', currentUser.uid, 'choreDefs', choreId)); } catch (_) {}
    }
    // Pokaż miesiąc i dzień, do którego trafił wpis.
    const { cur } = monthKeys();
    choreTab = monthKeyOf(dateISO) === cur ? 'current' : 'prev';
    choreSelectedDay = dateISO;
    await loadChores();
    pulseEl(document.querySelector('#page-chores .chore-summary'));
    toast(i18next.t('chores.entryAdded', { name: chore.name, pts: chore.points, interpolation: { escapeValue: false } }));
  } catch (e) {
    console.error(e);
    toast(i18next.t('chores.entrySaveError'), 'error');
  }
}

window.deleteChoreEntry = async (id) => {
  if (!await confirmDialog(i18next.t('confirm.deleteEntry'))) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'chores', id));
    await loadChores();
    pulseEl(document.querySelector('#page-chores .chore-summary'));
    toast(i18next.t('chores.entryDeleted'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('common.deleteError'), 'error');
  }
};

