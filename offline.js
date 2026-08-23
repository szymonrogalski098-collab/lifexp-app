import { addDoc, collection, deleteDoc, doc, getDoc, increment, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { currentUser, db, escapeHtml, getDailyLimit, loadProfile, monthKeyOf, rateGeneral, toast, userProfile } from "./core.js";
import { loadDashboard } from "./dashboard.js";
import { addMoneyCategoryByName, loadMoneyCategories, loadMoneyDocs, moneyBalance, updateMoneyCurrent } from "./money.js";

// ── Tryb offline: lokalna kolejka szkiców ─────────────
// Wpisy zrobione offline NIE idą do Firestore — trafiają do localStorage jako
// szkice. Prawdziwy zapis dzieje się dopiero po powrocie online, po kliknięciu
// "Dodaj" na ekranie przeglądu — ze świeżym stanem serwera (limit dzienny,
// saldo Money liczone wtedy, nie na nieaktualnych danych offline). Nie
// "optymalizować" tego na automatyczny sync — to celowy design.
const OFFLINE_QUEUE_KEY = 'lifexp-offline-queue';

function getOfflineQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch (e) { return []; }
}
function setOfflineQueue(q) {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
}
export function queueOfflineDraft(type, summary, payload) {
  const q = getOfflineQueue();
  q.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type, summary, payload,
    createdAtLocal: new Date().toISOString(),
  });
  setOfflineQueue(q);
  toast(i18next.t('offline.draftSaved'));
}

// Akcje poza zakresem MVP kolejki (pożyczki, bugi, ustawienia/kategorie) —
// offline blokujemy komunikatem zamiast draftować.
function requireOnline() {
  if (navigator.onLine) return true;
  toast(i18next.t('offline.needConnection'), 'error');
  return false;
}
window.requireOnline = requireOnline;

// Wrapper zakłada blokadę na już zdefiniowane funkcje window.* (moduł wykonuje
// się sekwencyjnie, więc w tym miejscu wszystkie definicje już istnieją).

export function updateOfflineBanner() {
  document.getElementById('offline-banner').classList.toggle('show', !navigator.onLine);
}
window.addEventListener('offline', updateOfflineBanner);
window.addEventListener('online', () => {
  updateOfflineBanner();
  maybeShowOfflineReview();
});

// ── Ekran "Byłeś offline" (styl #whatsnew-modal) ──
export function maybeShowOfflineReview() {
  if (!currentUser || !navigator.onLine) return;
  if (getOfflineQueue().length === 0) return;
  // Nie nachodź na modal "Co nowego?" — poczekaj, aż user go zamknie.
  if (document.getElementById('whatsnew-modal').classList.contains('open')) {
    setTimeout(maybeShowOfflineReview, 1000);
    return;
  }
  renderOfflineReview();
  document.getElementById('offline-review-modal').classList.add('open');
}

window.closeOfflineReview = () => {
  document.getElementById('offline-review-modal').classList.remove('open');
};

function renderOfflineReview() {
  const el = document.getElementById('offline-review-list');
  const q = getOfflineQueue();
  if (q.length === 0) {
    el.innerHTML = `<p class="text2" style="text-align:center;padding:14px 0">${i18next.t('offline.empty')}</p>`;
    return;
  }
  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  el.innerHTML = q.map(item => {
    const d = new Date(item.createdAtLocal);
    const ds = isNaN(d) ? '' : d.toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <p style="margin:0 0 2px;font-size:14px;line-height:1.5">${escapeHtml(item.summary)}</p>
      <p class="text2" style="margin:0 0 8px;font-size:12px">${ds}</p>
      <div style="display:flex;gap:8px">
        <button class="btn-success btn-sm" onclick="applyOfflineDraft('${item.id}')">${i18next.t('offline.add')}</button>
        <button class="btn-ghost btn-sm" onclick="discardOfflineDraft('${item.id}')">${i18next.t('offline.discard')}</button>
      </div>
    </div>`;
  }).join('');
}

window.discardOfflineDraft = (id) => {
  setOfflineQueue(getOfflineQueue().filter(x => x.id !== id));
  renderOfflineReview();
  toast(i18next.t('offline.draftDiscarded'));
};

window.applyOfflineDraft = async (id) => {
  if (!requireOnline()) return;
  const item = getOfflineQueue().find(x => x.id === id);
  if (!item) return;
  // Zablokuj przyciski na czas zapisu (podwójny klik = podwójny wpis).
  document.querySelectorAll('#offline-review-list button').forEach(b => b.disabled = true);
  try {
    if (item.type === 'activity') await applyDraftActivity(item);
    else if (item.type === 'gaming') await applyDraftGaming(item);
    else if (item.type === 'chore') await applyDraftChore(item);
    else if (item.type === 'money_tx') await applyDraftMoneyTx(item);
    setOfflineQueue(getOfflineQueue().filter(x => x.id !== id));
    toast(i18next.t('offline.draftAdded'));
    try { await loadProfile(); await loadDashboard(); } catch (e) { console.error(e); }
  } catch (e) {
    console.error('applyOfflineDraft failed:', e);
    toast(e && e.userMessage ? e.userMessage : i18next.t('errors.saveRetry'), 'error');
  }
  renderOfflineReview();
};

// Data szkicu = moment stworzenia OFFLINE (createdAtLocal), nie moment zatwierdzenia.
// Limity (dzienny limit punktów, 24h grania, saldo Money) liczone są tutaj — online,
// ze świeżym stanem serwera.
async function applyDraftActivity(item) {
  const p = item.payload;
  const dateStr = p.dateStr; // klucz dailyLog wg konwencji todayStr() z dnia szkicu
  const estimated = Math.round((p.minutes / 60) * (p.ptsPerHour || 0));

  const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', dateStr);
  const daySnap = await getDoc(dayRef);
  const dayPts = daySnap.exists() ? (daySnap.data().pointsEarned || 0) : 0;
  const dailyLimit = await getDailyLimit();
  const actualEarned = Math.min(estimated, Math.max(0, dailyLimit - dayPts));
  if (actualEarned === 0) throw { userMessage: i18next.t('logActivity.dailyLimitHit') };

  const activityDoc = { type: p.type, duration: p.minutes, points: actualEarned, desc: p.desc || '', timestamp: new Date(item.createdAtLocal) };
  if (p.typeName) activityDoc.typeName = p.typeName;
  await addDoc(collection(db, 'users', currentUser.uid, 'activities'), activityDoc);

  if (daySnap.exists()) await updateDoc(dayRef, { pointsEarned: increment(actualEarned) });
  else await setDoc(dayRef, { pointsEarned: actualEarned, gamingMinutes: 0 });

  await updateDoc(doc(db, 'users', currentUser.uid), {
    'points.total': increment(actualEarned),
    'points.earnedAllTime': increment(actualEarned),
  });
}

async function applyDraftGaming(item) {
  const p = item.payload;
  const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', p.date);
  const daySnap = await getDoc(dayRef);
  const existingMin = daySnap.exists() ? (daySnap.data().gamingMinutes || 0) : 0;
  if (existingMin + p.minutes > 1440) throw { userMessage: i18next.t('logGaming.dailyLimitHit', { existing: existingMin }) };

  await addDoc(collection(db, 'users', currentUser.uid, 'gamingSessions'), {
    game: p.game, duration: p.minutes, date: p.date, timestamp: new Date(item.createdAtLocal),
  });
  if (daySnap.exists()) await updateDoc(dayRef, { gamingMinutes: increment(p.minutes) });
  else await setDoc(dayRef, { pointsEarned: 0, gamingMinutes: p.minutes });
}

async function applyDraftChore(item) {
  const p = item.payload;
  await addDoc(collection(db, 'users', currentUser.uid, 'chores'), {
    choreId: p.choreId, choreName: p.choreName, choreEmoji: p.choreEmoji || '',
    points: p.points, dateISO: p.dateISO, monthKey: monthKeyOf(p.dateISO), createdAt: new Date(item.createdAtLocal),
  });
  if (p.oneTime) {
    try { await deleteDoc(doc(db, 'users', currentUser.uid, 'choreDefs', p.choreId)); } catch (_) {}
  }
}

async function applyDraftMoneyTx(item) {
  const p = item.payload;
  await loadMoneyDocs();
  if (p.txType === 'expense' && (moneyBalance?.current || 0) - p.amount < 0) {
    throw { userMessage: i18next.t('money.notEnoughBalance') };
  }
  await loadMoneyCategories();
  const category = await addMoneyCategoryByName(p.category);

  let pointsCost = 0;
  if (p.txType === 'expense') {
    const wanted = Math.ceil(p.amount / rateGeneral());
    pointsCost = Math.min(wanted, userProfile.points?.total || 0);
  }
  await addDoc(collection(db, 'users', currentUser.uid, 'moneyTransactions'), {
    type: p.txType, amount: p.amount, category, note: p.note || '', date: p.date,
    source: 'manual', pointsCost, createdAt: new Date(item.createdAtLocal),
  });
  await updateMoneyCurrent(p.txType === 'income' ? p.amount : -p.amount);
  if (pointsCost > 0) {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      'points.total': increment(-pointsCost),
      'points.spentAllTime': increment(pointsCost),
    });
  }
}


export function initOfflineWrappers() {
  ['saveLoan', 'saveLoanRepay', 'submitBugReport', 'saveSettings', 'saveEconomyGeneral',
   'saveEconomyChores', 'saveMoneyLimit', 'addChoreDef', 'addActivityDef', 'addGame',
   'addMoneyCategory', 'settleChores', 'sendBroadcast'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = (...args) => { if (!requireOnline()) return; return orig(...args); };
  });
}
