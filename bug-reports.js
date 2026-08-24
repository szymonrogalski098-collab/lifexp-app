import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { confirmDialog, currentUser, db, escapeHtml, toast, todayStr, userProfile } from "./core.js";

// Ten sam log + komunikat powtarza się w każdym handlerze zapisu w tym pliku;
// trzymamy go lokalnie, bo treść komunikatu jest specyficzna dla tych ścieżek.
function reportSaveError(e) {
  console.error(e);
  toast(i18next.t('shop.saveError'), 'error');
}

// ── Zgłaszanie błędów (Bug Reports) ───────────────────
// Zgłoszenia trafiają do TOP-LEVEL kolekcji `bugReports` (nie pod users/{uid}),
// bo panel admina (konto o emailu BUG_ADMIN_EMAIL) musi widzieć zgłoszenia
// wszystkich kont. Limit 1 zgłoszenie/dzień per konto: users/{uid}.lastBugReportAt
// (ten sam wzorzec co lastReportSent przy raporcie tygodniowym).
// Filtr spamu: opis MUSI zawierać co najmniej jedno słowo z listy `bugReportsConfig/
// keywords` (edytowalnej przez admina) — inaczej zgłoszenie trafia do zakładki Spam.
// Spam bez akcji admina ("To nie spam") kasuje się samo po 12h — sprawdzane leniwie
// (przy każdym wejściu admina na stronę), bo apka nie ma backendu/cron poza raportem
// tygodniowym.
export const BUG_ADMIN_EMAIL = 'szymonrogalski098@gmail.com';
const BUG_AREAS = ['dashboard', 'money', 'chores', 'history', 'stats', 'settings', 'other'];
const BUG_SPAM_TTL_MS = 12 * 60 * 60 * 1000;

export let isBugAdmin = false;
let myBugReports = [];
let adminBugReports = [];
let bugSpamKeywords = [];
let bugAdminTab = 'new';    // 'new' | 'spam' | 'postponed' | 'history'
let bugExpandedId = null;   // rozwinięty wątek (akordeon — jeden naraz)

function bugAreaLabel(key) {
  const map = {
    dashboard: 'nav.dashboard', money: 'nav.money', chores: 'nav.chores',
    history: 'nav.history', stats: 'nav.stats', settings: 'nav.settings', other: 'bugReport.areaOther',
  };
  return i18next.t(map[key] || 'bugReport.areaOther');
}

function bugStatusLabel(status) {
  const map = {
    new: 'bugReport.statusNew', spam: 'bugReport.statusReview', accepted: 'bugReport.statusAccepted',
    rejected: 'bugReport.statusRejected', postponed: 'bugReport.statusPostponed',
  };
  return i18next.t(map[status] || 'bugReport.statusNew');
}
function bugStatusBadge(status) {
  const c = { accepted: 'var(--accent2)', rejected: 'var(--warn)', new: 'var(--accent)', postponed: 'var(--text2)', spam: 'var(--text2)' }[status] || 'var(--text2)';
  return `<span class="tag" style="background:${c}22;color:${c}">${bugStatusLabel(status)}</span>`;
}

// ── Wątki odpowiedzi (Messenger-style) + nieprzeczytane ──
// Wiadomości trzymane w polu `messages` na dokumencie bugReport: [{ text, isAdmin, at(ISO) }].
// Nieprzeczytane śledzone per urządzenie w localStorage (last-seen timestamp per zgłoszenie).
function bugReadMap() { try { return JSON.parse(localStorage.getItem('lifexp-bug-read') || '{}'); } catch (e) { return {}; } }
function bugLastMsgAt(r) { const m = r.messages || []; return m.length ? m[m.length - 1].at : null; }
function bugIsUnread(r) {
  const m = r.messages || [];
  if (!m.length) return false;
  const last = m[m.length - 1];
  if (last.isAdmin === isBugAdmin) return false;   // ostatnia wiadomość jest ode mnie
  const seen = bugReadMap()[r.id];
  return !seen || last.at > seen;
}
function markBugRead(r) {
  const at = bugLastMsgAt(r);
  if (!at) return;
  try { const m = bugReadMap(); m[r.id] = at; localStorage.setItem('lifexp-bug-read', JSON.stringify(m)); } catch (e) {}
}

function bugThreadHTML(r) {
  const m = r.messages || [];
  if (!m.length) return `<p class="text2" style="margin:8px 0">${i18next.t('bugReport.noMessages')}</p>`;
  return `<div style="display:flex;flex-direction:column;gap:6px;margin:10px 0">` + m.map(msg => {
    const mine = msg.isAdmin === isBugAdmin;
    const bg = mine ? 'var(--accent)' : 'var(--bg3)';
    const col = mine ? '#fff' : 'var(--text)';
    const who = msg.isAdmin ? i18next.t('bugReport.admin') : i18next.t('bugReport.you2');
    return `<div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:82%">
      <div style="font-size:10px;color:var(--text2);margin:0 4px 2px;text-align:${mine ? 'right' : 'left'}">${who}</div>
      <div style="background:${bg};color:${col};padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.4;word-break:break-word">${escapeHtml(msg.text)}</div>
    </div>`;
  }).join('') + `</div>`;
}

function bugReplyBoxHTML(r) {
  return `<div style="display:flex;gap:8px;margin-top:8px">
    <input type="text" id="bug-reply-${r.id}" maxlength="500" placeholder="${i18next.t('bugReport.replyPh')}" style="flex:1" onkeydown="if(event.key==='Enter')sendBugReply('${r.id}')">
    <button class="btn-primary btn-sm" onclick="sendBugReply('${r.id}')">${i18next.t('bugReport.send')}</button>
  </div>`;
}

function bugAdminActionsHTML(r) {
  if (r.status === 'spam') {
    return `<button class="btn-secondary btn-sm" onclick="bugAdminRescue('${r.id}')">${i18next.t('bugReport.notSpam')}</button>
      <button class="btn-ghost btn-sm" onclick="bugAdminDelete('${r.id}')">${i18next.t('bugReport.delete')}</button>`;
  }
  if (r.status === 'new' || r.status === 'postponed') {
    return `<button class="btn-success btn-sm" onclick="bugAdminAccept('${r.id}')">${i18next.t('bugReport.accept')}</button>
      <button class="btn-danger btn-sm" onclick="bugAdminReject('${r.id}')">${i18next.t('bugReport.reject')}</button>
      ${r.status !== 'postponed' ? `<button class="btn-secondary btn-sm" onclick="bugAdminPostpone('${r.id}')">${i18next.t('bugReport.postpone')}</button>` : ''}
      <button class="btn-ghost btn-sm" onclick="bugAdminDelete('${r.id}')">${i18next.t('bugReport.delete')}</button>`;
  }
  return `<button class="btn-ghost btn-sm" onclick="bugAdminDelete('${r.id}')">${i18next.t('bugReport.delete')}</button>`;
}

// Wspólny render jednego zgłoszenia (akordeon). admin=true → widok admina (imię + akcje).
// Szczegóły są ZAWSZE w DOM (rozwinięcie/zwinięcie to tylko klasa CSS na .bug-item —
// patrz toggleBugExpand — dzięki temu jest płynna animacja zamiast przeładowania listy).
function bugReportItemHTML(r, admin) {
  const expanded = bugExpandedId === r.id;
  const dotId = `bug-dot-${r.id}`;
  const dot = bugIsUnread(r) ? `<span id="${dotId}" title="${i18next.t('bugReport.unread')}" style="width:9px;height:9px;border-radius:50%;background:var(--warn);flex-shrink:0"></span>` : `<span id="${dotId}"></span>`;
  const date = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  const dateStr = date.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  const actions = admin ? bugAdminActionsHTML(r) : '';

  return `<div class="bug-item ${expanded ? 'expanded' : ''}" data-bug-id="${r.id}">
    <div class="bug-item-header" onclick="toggleBugExpand('${r.id}')">
      <span class="bug-chevron">▶</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.title)}</div>
        <div class="text2">${admin ? escapeHtml(r.reporterName || '—') + ' · ' : ''}${escapeHtml(bugAreaLabel(r.area))}</div>
      </div>
      ${dot}
      ${bugStatusBadge(r.status)}
    </div>
    <div class="bug-item-detail-wrap">
      <div class="bug-item-detail-pad">
        <div class="text2" style="margin-bottom:6px">${dateStr}${r.status === 'spam' ? ' · ' + bugTimeLeftLabel(r) : ''}${r.bonusGranted ? ' · 🎁 ' + i18next.t('bugReport.bonusGrantedTag') : ''}</div>
        <p style="font-size:14px;line-height:1.6;margin-bottom:2px">${escapeHtml(r.description)}</p>
        <div id="bug-thread-${r.id}">${bugThreadHTML(r)}</div>
        ${bugReplyBoxHTML(r)}
        ${actions ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${actions}</div>` : ''}
      </div>
    </div>
  </div>`;
}

// Rozwijanie/zwijanie = tylko przełączenie klasy na dwóch elementach (bez re-renderu
// listy) — płynna animacja CSS, brak przeładowania/utraty scrolla.
window.toggleBugExpand = (id) => {
  const prevId = bugExpandedId;
  bugExpandedId = (bugExpandedId === id) ? null : id;

  if (prevId && prevId !== id) {
    document.querySelector(`.bug-item[data-bug-id="${prevId}"]`)?.classList.remove('expanded');
  }
  const el = document.querySelector(`.bug-item[data-bug-id="${id}"]`);
  if (el) el.classList.toggle('expanded', bugExpandedId === id);

  if (bugExpandedId) {
    const r = (isBugAdmin ? adminBugReports : myBugReports).find(x => x.id === id);
    if (r) {
      markBugRead(r);
      document.getElementById(`bug-dot-${id}`)?.replaceChildren();
    }
  }
};

window.sendBugReply = async (id) => {
  const inp = document.getElementById('bug-reply-' + id);
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  const r = (isBugAdmin ? adminBugReports : myBugReports).find(x => x.id === id);
  if (!r) return;
  const messages = [...(r.messages || []), { text, isAdmin: isBugAdmin, at: new Date().toISOString() }];
  inp.disabled = true;
  try {
    await updateDoc(doc(db, 'bugReports', id), { messages });
    r.messages = messages;
    markBugRead(r);
    inp.value = '';
    // Podmień tylko wątek tego zgłoszenia — bez przeładowania całej listy (płynnie,
    // bez utraty scrolla/animacji rozwinięcia).
    const threadEl = document.getElementById(`bug-thread-${id}`);
    if (threadEl) threadEl.innerHTML = bugThreadHTML(r);
  } catch (e) {
    reportSaveError(e);
  }
  inp.disabled = false;
  inp.focus();
};

export function renderBugAreaSelect() {
  const sel = document.getElementById('bug-area');
  if (!sel) return;
  sel.innerHTML = `<option value="">${i18next.t('logActivity.choose')}</option>`
    + BUG_AREAS.map(a => `<option value="${a}">${escapeHtml(bugAreaLabel(a))}</option>`).join('');
}

async function loadBugKeywords() {
  const ref = doc(db, 'bugReportsConfig', 'keywords');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    bugSpamKeywords = snap.data().words || [];
  } else {
    bugSpamKeywords = ['błąd', 'nie działa', 'bug', 'error', 'powinno', 'pokazuje', 'strona',
      'zakładka', 'przycisk', 'punkty', 'saldo', 'zapis', 'wyświetla', 'crash', 'literówka'];
    // Zapis (seed) dokumentu wolno tylko adminowi (firestore.rules) — zwykły użytkownik
    // dostałby permission-denied. Jeśli admin jeszcze nigdy nie odwiedził panelu,
    // reszta i tak dostaje sensowną domyślną listę w pamięci (nie trwałą, ale działającą).
    if (isBugAdmin) {
      try { await setDoc(ref, { words: bugSpamKeywords }); } catch (e) { console.error('bugReportsConfig seed failed:', e); }
    }
  }
}

// Zgłoszenie jest spamem, jeśli opis NIE zawiera żadnego słowa z listy.
function bugLooksLikeSpam(text) {
  const t = (text || '').toLowerCase();
  if (bugSpamKeywords.length === 0) return false;
  return !bugSpamKeywords.some(w => t.includes(w.toLowerCase()));
}

window.updateBugCharCount = () => {
  const el = document.getElementById('bug-desc');
  const counter = document.getElementById('bug-char-count');
  if (el && counter) counter.textContent = i18next.t('bugReport.charCount', { cur: el.value.length, max: 400 });
};

// Limit: 1 zgłoszenie na DZIEŃ KALENDARZOWY (reset o północy), a nie ruchome 24h —
// wcześniej zgłoszenie wieczorem blokowało formularz do wieczora następnego dnia.
function bugReportedToday() {
  const last = userProfile?.lastBugReportAt;
  return !!last && String(last).slice(0, 10) === todayStr();
}
// Bonus: admin przyjmując zgłoszenie (bugAdminAccept) ustawia bonusGranted:true na
// TYM zgłoszeniu — to daje zgłaszającemu jedno dodatkowe zgłoszenie (poza dziennym
// limitem), zużywane (bonusUsed:true) dopiero gdy faktycznie z niego skorzysta.
// Kredyty się nie przepadają same — jeśli nieużyte, czekają do następnego dnia
// kiedy limit znów zablokuje wysyłkę.
function bugAvailableBonus() {
  return myBugReports.find(r => r.bonusGranted && !r.bonusUsed) || null;
}
function isBugSubmitBlocked() {
  return bugReportedToday() && !bugAvailableBonus();
}
function updateBugRateLimitUI() {
  const btn = document.getElementById('bug-submit-btn');
  const note = document.getElementById('bug-rate-note');
  const bonusNote = document.getElementById('bug-bonus-note');
  const blockedByLimit = bugReportedToday();
  const bonus = bugAvailableBonus();
  if (btn) btn.disabled = blockedByLimit && !bonus;
  if (note) note.style.display = (blockedByLimit && !bonus) ? 'block' : 'none';
  if (bonusNote) bonusNote.style.display = (blockedByLimit && bonus) ? 'block' : 'none';
}

async function loadMyBugReports() {
  const snap = await getDocs(query(collection(db, 'bugReports'), where('reporterUid', '==', currentUser.uid)));
  myBugReports = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderMyBugReports();
}

export function renderMyBugReports() {
  const el = document.getElementById('my-bug-reports');
  if (!el) return;
  if (myBugReports.length === 0) { el.innerHTML = `<p class="text2">${i18next.t('bugReport.noReports')}</p>`; return; }
  el.innerHTML = myBugReports.map(r => bugReportItemHTML(r, false)).join('');
}

export async function submitBugReport() {
  const title = document.getElementById('bug-title').value.trim();
  const area = document.getElementById('bug-area').value;
  const desc = document.getElementById('bug-desc').value.trim();
  if (!title) return toast(i18next.t('bugReport.enterTitle'), 'error');
  if (!area) return toast(i18next.t('bugReport.chooseArea'), 'error');
  if (!desc) return toast(i18next.t('bugReport.enterDesc'), 'error');

  if (isBugSubmitBlocked()) {
    return toast(i18next.t('bugReport.rateLimited'), 'error');
  }
  const bonusReport = bugReportedToday() ? bugAvailableBonus() : null;

  const status = bugLooksLikeSpam(desc) ? 'spam' : 'new';
  const btn = document.getElementById('bug-submit-btn');
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'bugReports'), {
      reporterUid: currentUser.uid, reporterName: userProfile.name || 'Użytkownik',
      title, area, description: desc, status, messages: [], createdAt: new Date(),
    });
    if (bonusReport) {
      // Zużywamy istniejący bonus zamiast blokować — dzienny limit i tak już
      // "zjedzony" dzisiejszym pierwszym zgłoszeniem, lastBugReportAt się nie zmienia.
      await updateDoc(doc(db, 'bugReports', bonusReport.id), { bonusUsed: true });
      bonusReport.bonusUsed = true;
    } else {
      await updateDoc(doc(db, 'users', currentUser.uid), { lastBugReportAt: new Date().toISOString() });
      userProfile.lastBugReportAt = new Date().toISOString();
    }

    document.getElementById('bug-title').value = '';
    document.getElementById('bug-area').value = '';
    document.getElementById('bug-desc').value = '';
    updateBugCharCount();

    await loadMyBugReports();
    updateBugRateLimitUI();
    toast(i18next.t('bugReport.sent'));
  } catch (e) {
    reportSaveError(e);
  }
  btn.disabled = false;
}
window.submitBugReport = submitBugReport;

// ── Panel admina ──
function bugTimeLeftLabel(r) {
  const created = r.createdAt?.toDate ? r.createdAt.toDate().getTime() : new Date(r.createdAt).getTime();
  const hoursLeft = Math.max(0, Math.ceil((BUG_SPAM_TTL_MS - (Date.now() - created)) / 3600000));
  return i18next.t('bugReport.spamExpires', { h: hoursLeft });
}

function syncBugAdminTabs() {
  document.querySelectorAll('#bug-admin-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === bugAdminTab));
}

async function loadAdminBugReports() {
  const snap = await getDocs(collection(db, 'bugReports'));
  adminBugReports = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Leniwe czyszczenie: spam starszy niż 12h i nieuratowany ("To nie spam") — kasujemy.
  const now = Date.now();
  const stale = adminBugReports.filter(r => r.status === 'spam' &&
    (now - (r.createdAt?.toDate ? r.createdAt.toDate().getTime() : new Date(r.createdAt).getTime())) > BUG_SPAM_TTL_MS);
  for (const r of stale) {
    try { await deleteDoc(doc(db, 'bugReports', r.id)); } catch (_) {}
  }
  if (stale.length) adminBugReports = adminBugReports.filter(r => !stale.includes(r));

  adminBugReports.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  renderBugKeywordsSettings();
  syncBugAdminTabs();
  renderAdminBugList();
}

window.setBugAdminTab = (tab) => { bugAdminTab = tab; syncBugAdminTabs(); renderAdminBugList(); };

export function renderAdminBugList() {
  const el = document.getElementById('bug-admin-list');
  if (!el) return;
  const list = bugAdminTab === 'history'
    ? adminBugReports.filter(r => r.status === 'accepted' || r.status === 'rejected')
    : adminBugReports.filter(r => r.status === bugAdminTab);

  if (list.length === 0) { el.innerHTML = `<p class="text2">${i18next.t('bugReport.noneInTab')}</p>`; return; }
  el.innerHTML = list.map(r => bugReportItemHTML(r, true)).join('');
}

window.bugAdminAccept = async (id) => {
  // Przyjęcie zgłoszenia daje zgłaszającemu jedno dodatkowe zgłoszenie na później
  // (bonusGranted) — patrz bugAvailableBonus/isBugSubmitBlocked.
  await updateDoc(doc(db, 'bugReports', id), { status: 'accepted', bonusGranted: true });
  await loadAdminBugReports();
  toast(i18next.t('bugReport.accepted_'));
};
window.bugAdminReject = async (id) => {
  await updateDoc(doc(db, 'bugReports', id), { status: 'rejected' });
  await loadAdminBugReports();
  toast(i18next.t('bugReport.rejected_'));
};
window.bugAdminPostpone = async (id) => {
  await updateDoc(doc(db, 'bugReports', id), { status: 'postponed' });
  await loadAdminBugReports();
  toast(i18next.t('bugReport.postponed_'));
};
window.bugAdminRescue = async (id) => {
  await updateDoc(doc(db, 'bugReports', id), { status: 'new' });
  await loadAdminBugReports();
  toast(i18next.t('bugReport.rescued'));
};
window.bugAdminDelete = async (id) => {
  if (!await confirmDialog(i18next.t('bugReport.confirmDelete'))) return;
  await deleteDoc(doc(db, 'bugReports', id));
  await loadAdminBugReports();
  toast(i18next.t('bugReport.deleted_'));
};

// ── Filtr spamu: lista wymaganych słów (edytowalna przez admina) ──
export function renderBugKeywordsSettings() {
  const el = document.getElementById('bug-keywords-list');
  if (!el) return;
  if (bugSpamKeywords.length === 0) { el.innerHTML = `<p class="text2">${i18next.t('money.noCats')}</p>`; return; }
  el.innerHTML = bugSpamKeywords.map((w, i) => `
    <span class="tag" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);display:inline-flex;align-items:center;gap:6px;margin:0 6px 6px 0">
      ${escapeHtml(w)}
      <span onclick="deleteBugKeyword(${i})" style="cursor:pointer;opacity:.7">×</span>
    </span>`).join('');
}

window.addBugKeyword = async () => {
  const input = document.getElementById('new-bug-keyword');
  const w = input.value.trim();
  if (!w) return;
  if (bugSpamKeywords.some(k => k.toLowerCase() === w.toLowerCase())) return toast(i18next.t('money.catExists'), 'error');
  try {
    bugSpamKeywords = [...bugSpamKeywords, w];
    await setDoc(doc(db, 'bugReportsConfig', 'keywords'), { words: bugSpamKeywords });
    input.value = '';
    renderBugKeywordsSettings();
    toast(i18next.t('bugReport.keywordAdded'));
  } catch (e) {
    reportSaveError(e);
  }
};

window.deleteBugKeyword = async (i) => {
  if (!await confirmDialog(i18next.t('bugReport.confirmDeleteKeyword'))) return;
  try {
    bugSpamKeywords = bugSpamKeywords.filter((_, idx) => idx !== i);
    await setDoc(doc(db, 'bugReportsConfig', 'keywords'), { words: bugSpamKeywords });
    renderBugKeywordsSettings();
    toast(i18next.t('bugReport.keywordDeleted'));
  } catch (e) {
    reportSaveError(e);
  }
};

export async function loadBugReportPage() {
  isBugAdmin = currentUser?.email === BUG_ADMIN_EMAIL;
  document.getElementById('bug-submit-view').style.display = isBugAdmin ? 'none' : 'block';
  document.getElementById('bug-admin-view').style.display = isBugAdmin ? 'block' : 'none';

  // Renderuj select miejsca OD RAZU — nie zależy od Firestore, więc select ma
  // zawsze opcje do wyboru, nawet jeśli poniższe zapytania (keywords/moje zgłoszenia) zawiodą.
  if (!isBugAdmin) { renderBugAreaSelect(); updateBugCharCount(); }

  try {
    await loadBugKeywords();
    if (isBugAdmin) {
      await loadAdminBugReports();
    } else {
      await loadMyBugReports();
      updateBugRateLimitUI();
    }
  } catch (e) {
    console.error('loadBugReportPage failed:', e);
    toast(i18next.t('shop.saveError'), 'error');
  }
}

