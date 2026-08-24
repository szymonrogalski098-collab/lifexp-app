import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { activityDefById, activityDefs, confettiBurst, confirmDialog, currentUser, db, escapeHtml, formatMinutes, getDailyLimit, getTodayPts, loadProfile, pulseEl, rateGeneral, showLevelup, toast, todayStr, userProfile } from "./core.js";
import { XP_PER_LEVEL, levelTitle, loadDashboard } from "./dashboard.js";
import { queueOfflineDraft } from "./offline.js";

// Ten sam log + komunikat powtarza się w każdym handlerze zapisu w tym pliku;
// trzymamy go lokalnie, bo treść komunikatu jest specyficzna dla tych ścieżek.
function reportSaveError(e) {
  toast(i18next.t('shop.saveError'), 'error');
  console.error(e);
}

let selectedGenTime = null;
let generatedActivity = null;
// ── Log Activity ──────────────────────────────────────
window.updatePointsPreview = () => {
  const type = document.getElementById('act-type');
  const min = parseInt(document.getElementById('act-minutes').value) || 0;
  const opt = type.options[type.selectedIndex];
  const ptsPerH = parseInt(opt?.dataset.pts || 0);
  const preview = document.getElementById('pts-preview');

  if (!ptsPerH || min < 5) { preview.style.display = 'none'; return; }

  const earned = Math.round((min / 60) * ptsPerH);
  document.getElementById('pts-preview-val').textContent = earned;
  preview.style.display = 'block';

  getTodayPts().then(async todayPts => {
    const limit = await getDailyLimit();
    const remaining = Math.max(0, limit - todayPts);
    const actualEarned = Math.min(earned, remaining);

    // Show the amount that will actually be credited (capped), not the raw value.
    document.getElementById('pts-preview-val').textContent = actualEarned;

    // Warn only when the limit is already reached and nothing more can be earned.
    const capWarn = document.getElementById('pts-cap-warn');
    if (todayPts >= limit) {
      capWarn.textContent = i18next.t('logActivity.capReached');
      capWarn.style.display = 'inline';
    } else {
      capWarn.style.display = 'none';
    }
  });
};

function resetActivityForm() {
  document.getElementById('act-type').value = '';
  document.getElementById('act-minutes').value = '';
  document.getElementById('act-desc').value = '';
  document.getElementById('pts-preview').style.display = 'none';
}

// Offline → szkic do lokalnej kolejki. Prawdziwy zapis (i cap limitem dziennym)
// dopiero przy zatwierdzeniu online — dlatego punkty w podsumowaniu to szacunek.
function queueActivityDraft({ type, min, desc, ptsPerH, earned, opt }) {
  const name = type === '__generated__' ? (opt?.dataset.genName || '—') : activityDefById(type).name;
  const payload = { type, minutes: min, desc, ptsPerHour: ptsPerH, dateStr: todayStr() };
  if (type === '__generated__' && opt?.dataset.genName) payload.typeName = opt.dataset.genName;
  queueOfflineDraft('activity',
    i18next.t('offline.sumActivity', { name, min, pts: earned, interpolation: { escapeValue: false } }),
    payload);
}

// Trzy zapisy składające się na jedną zalogowaną aktywność: wpis w `activities`,
// dzienny licznik punktów i sumy na profilu. Aktywności z generatora (poza
// edytowalną listą activityDefs) dostają zdenormalizowaną nazwę, bo
// activityDefById nie ma dla nich definicji.
async function persistActivity({ type, min, desc, actualEarned, opt }) {
  const activityDoc = { type, duration: min, points: actualEarned, desc, timestamp: new Date() };
  if (type === '__generated__' && opt?.dataset.genName) activityDoc.typeName = opt.dataset.genName;
  await addDoc(collection(db, 'users', currentUser.uid, 'activities'), activityDoc);

  const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', todayStr());
  const daySnap = await getDoc(dayRef);
  if (daySnap.exists()) {
    await updateDoc(dayRef, { pointsEarned: increment(actualEarned) });
  } else {
    await setDoc(dayRef, { pointsEarned: actualEarned, gamingMinutes: 0 });
  }

  await updateDoc(doc(db, 'users', currentUser.uid), {
    'points.total': increment(actualEarned),
    'points.earnedAllTime': increment(actualEarned)
  });
}

// Reward feedback: pulse the balance, then celebrate a level-up or confetti.
// Poziom sprzed zapisu przychodzi z zewnątrz, bo userProfile jest już po
// loadProfile() i sam nie pamięta stanu sprzed przyznania punktów.
function celebrateActivity(beforeLevel) {
  pulseEl(document.querySelector('.balance-card'));
  const afterEarned = userProfile.points?.earnedAllTime || 0;
  const afterLevel = Math.floor(afterEarned / XP_PER_LEVEL) + 1;
  if (afterLevel > beforeLevel) {
    setTimeout(() => showLevelup(afterLevel, levelTitle(afterLevel)), 350);
  } else {
    confettiBurst();
  }
}

window.logActivity = async () => {
  const type = document.getElementById('act-type').value;
  const min = parseInt(document.getElementById('act-minutes').value);
  const desc = document.getElementById('act-desc').value.trim();

  if (!type) return toast(i18next.t('logActivity.chooseType'), 'error');
  if (!min || min < 5) return toast(i18next.t('logActivity.minMinutes'), 'error');

  const opt = document.querySelector(`#act-type option[value="${type}"]`);
  const ptsPerH = parseInt(opt?.dataset.pts || 0);
  let earned = Math.round((min / 60) * ptsPerH);

  if (!navigator.onLine) {
    queueActivityDraft({ type, min, desc, ptsPerH, earned, opt });
    resetActivityForm();
    return;
  }

  // Cap to daily limit
  const todayPts = await getTodayPts();
  const dailyLimit = await getDailyLimit();
  const remaining = dailyLimit - todayPts;
  const actualEarned = Math.min(earned, Math.max(0, remaining));

  if (actualEarned === 0) {
    return toast(i18next.t('logActivity.dailyLimitHit'), 'error');
  }

  const btn = document.querySelector('#page-log-activity button');
  btn.disabled = true;

  // Level before earning, to detect a level-up afterwards.
  const beforeEarned = userProfile.points?.earnedAllTime || 0;
  const beforeLevel = Math.floor(beforeEarned / XP_PER_LEVEL) + 1;

  try {
    await persistActivity({ type, min, desc, actualEarned, opt });

    await loadProfile();
    resetActivityForm();
    showPage('dashboard');
    await loadDashboard();
    toast(i18next.t('toast.earnedPts', { pts: actualEarned }));

    celebrateActivity(beforeLevel);
  } catch (e) {
    toast(i18next.t('errors.saveRetry'), 'error');
    console.error(e);
  }
  btn.disabled = false;
};

// ── Log Gaming ────────────────────────────────────────
window.updateGameSelect = () => {
  const sel = document.getElementById('game-select');
  const games = userProfile?.games || [];
  const defaults = ['Minecraft', 'Geometry Dash', 'Inna'];
  const all = [...new Set([...defaults, ...games])];

  sel.innerHTML = `<option value="">${i18next.t('logGaming.choose')}</option>` +
    all.map(g => `<option value="${g}">${g === 'Inna' ? escapeHtml(i18next.t('logGaming.otherGame')) : escapeHtml(g)}</option>`).join('');

  // Set today's date as default
  document.getElementById('game-date').value = todayStr();
};

document.getElementById('game-select').addEventListener('change', function () {
  document.getElementById('game-custom-wrap').style.display = this.value === 'Inna' ? 'block' : 'none';
});

function resetGamingForm() {
  document.getElementById('game-select').value = '';
  document.getElementById('game-minutes').value = '';
  document.getElementById('game-custom').value = '';
  document.getElementById('game-custom-wrap').style.display = 'none';
}

// Zapis sesji + dopisanie minut do dziennego licznika (tworzonego, jeśli to
// pierwszy wpis danego dnia).
async function persistGamingSession({ game, min, date, dayRef, daySnap }) {
  await addDoc(collection(db, 'users', currentUser.uid, 'gamingSessions'), {
    game, duration: min, date, timestamp: new Date()
  });

  if (daySnap.exists()) {
    await updateDoc(dayRef, { gamingMinutes: increment(min) });
  } else {
    await setDoc(dayRef, { pointsEarned: 0, gamingMinutes: min });
  }
}

window.logGaming = async () => {
  let game = document.getElementById('game-select').value;
  if (game === 'Inna') game = document.getElementById('game-custom').value.trim();
  const min = parseInt(document.getElementById('game-minutes').value);
  const date = document.getElementById('game-date').value || todayStr();

  if (!game) return toast(i18next.t('logGaming.enterGame'), 'error');
  if (!min || min < 1) return toast(i18next.t('logGaming.enterDuration'), 'error');
  if (min > 1440) return toast(i18next.t('logGaming.sessionTooLong'), 'error');

  // Offline → szkic; limit 1440 min/dzień weryfikowany przy zatwierdzeniu online.
  if (!navigator.onLine) {
    queueOfflineDraft('gaming',
      i18next.t('offline.sumGaming', { game, min, interpolation: { escapeValue: false } }),
      { game, minutes: min, date });
    resetGamingForm();
    return;
  }

  const btn = document.querySelector('#page-log-gaming button');
  btn.disabled = true;

  try {
    const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', date);
    const daySnap = await getDoc(dayRef);
    const existingMin = daySnap.exists() ? (daySnap.data().gamingMinutes || 0) : 0;
    if (existingMin + min > 1440) {
      toast(i18next.t('logGaming.dailyLimitHit', { existing: existingMin }), 'error');
      btn.disabled = false;
      return;
    }

    await persistGamingSession({ game, min, date, dayRef, daySnap });

    await loadDashboard();
    await loadGamingHistory();
    toast(i18next.t('logGaming.saved', { time: formatMinutes(min), game, interpolation: { escapeValue: false } }));
    resetGamingForm();
  } catch (e) {
    reportSaveError(e);
  }
  btn.disabled = false;
};

window.loadGamingHistory = async () => {
  const el = document.getElementById('gaming-history-list');
  if (!el || !currentUser) return;
  const q = query(
    collection(db, 'users', currentUser.uid, 'gamingSessions'),
    orderBy('timestamp', 'desc'),
    limit(30)
  );
  const snap = await getDocs(q);
  if (snap.empty) { el.innerHTML = `<p class="text2">${i18next.t('logGaming.noSessions')}</p>`; return; }
  el.innerHTML = snap.docs.map(d => {
    const s = d.data();
    const dateStr = s.date || s.timestamp?.toDate?.().toLocaleDateString('pl-PL') || '—';
    return `<div class="history-item">
      <div>
        <div style="font-weight:600">${s.game}</div>
        <div class="text2" style="font-size:13px">${dateStr} · ${formatMinutes(s.duration)}</div>
      </div>
      <button class="btn-ghost btn-sm" onclick="deleteGamingSession('${d.id}','${s.date || ''}',${s.duration})">Usuń</button>
    </div>`;
  }).join('');
};

window.deleteGamingSession = async (id, date, duration) => {
  if (!await confirmDialog(i18next.t('confirm.deleteSession'))) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'gamingSessions', id));
    if (date) {
      const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', date);
      const daySnap = await getDoc(dayRef);
      if (daySnap.exists()) {
        const cur = daySnap.data().gamingMinutes || 0;
        await updateDoc(dayRef, { gamingMinutes: Math.max(0, cur - duration) });
      }
    }
    await loadDashboard();
    await loadGamingHistory();
    toast(i18next.t('logGaming.sessionDeleted'));
  } catch (e) {
    toast(i18next.t('common.deleteError'), 'error');
    console.error(e);
  }
};

// ── Shop ──────────────────────────────────────────────
window.updateShopPreview = () => {
  const amount = parseFloat(document.getElementById('shop-amount').value) || 0;
  const pts = Math.ceil(amount / rateGeneral());
  document.getElementById('shop-pts-val').textContent = pts;

  const total = userProfile?.points?.total || 0;
  document.getElementById('shop-error').style.display = pts > total ? 'block' : 'none';
};

let editingPurchaseId = null;

function resetShopForm() {
  document.getElementById('shop-desc').value = '';
  document.getElementById('shop-amount').value = '';
  document.getElementById('shop-pts-val').textContent = '0';
  editingPurchaseId = null;
  document.querySelector('#page-shop .btn-danger').textContent = i18next.t('shop.register');
}

// Punkty za zakup: total maleje o `delta`, spentAllTime rośnie o tyle samo.
// Przy edycji `delta` to RÓŻNICA względem poprzedniego kosztu (może być ujemna,
// gdy zakup potaniał — wtedy punkty wracają).
function applyPurchasePointsDelta(delta) {
  return updateDoc(doc(db, 'users', currentUser.uid), {
    'points.total': increment(-delta),
    'points.spentAllTime': increment(delta),
  });
}

// Wspólny epilog obu ścieżek: przeładuj profil, dashboard i listę zakupów,
// pokaż komunikat i wyczyść formularz.
async function refreshAfterPurchase(successMessage) {
  await loadProfile();
  await loadDashboard();
  await loadPurchases();
  toast(successMessage);
  resetShopForm();
}

async function updateExistingPurchase({ desc, amount, pts, btn }) {
  const ref = doc(db, 'users', currentUser.uid, 'purchases', editingPurchaseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) { resetShopForm(); return; }
  const diff = pts - (snap.data().pointsCost || 0);
  const total = userProfile?.points?.total || 0;
  if (diff > 0 && diff > total) return toast(i18next.t('shop.notEnough'), 'error');

  btn.disabled = true;
  try {
    await updateDoc(ref, { description: desc, amount, pointsCost: pts });
    await applyPurchasePointsDelta(diff);
    await refreshAfterPurchase(i18next.t('shop.updated'));
  } catch (e) {
    reportSaveError(e);
  }
  btn.disabled = false;
}

async function createPurchase({ desc, amount, pts, btn }) {
  const total = userProfile?.points?.total || 0;
  if (pts > total) return toast(i18next.t('shop.notEnough'), 'error');

  btn.disabled = true;
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'purchases'), {
      description: desc, amount, pointsCost: pts, timestamp: new Date()
    });
    await applyPurchasePointsDelta(pts);
    await refreshAfterPurchase(i18next.t('shop.registered', { pts }));
  } catch (e) {
    reportSaveError(e);
  }
  btn.disabled = false;
}

window.logPurchase = async () => {
  const desc = document.getElementById('shop-desc').value.trim();
  const amount = parseFloat(document.getElementById('shop-amount').value);

  if (!desc) return toast(i18next.t('shop.enterDesc'), 'error');
  if (!amount || amount <= 0) return toast(i18next.t('shop.enterAmount'), 'error');

  const pts = Math.ceil(amount / rateGeneral());
  const btn = document.querySelector('#page-shop .btn-danger');

  if (editingPurchaseId) {
    await updateExistingPurchase({ desc, amount, pts, btn });
  } else {
    await createPurchase({ desc, amount, pts, btn });
  }
};

window.editPurchase = async (id) => {
  const snap = await getDoc(doc(db, 'users', currentUser.uid, 'purchases', id));
  if (!snap.exists()) return;
  const p = snap.data();
  editingPurchaseId = id;
  document.getElementById('shop-desc').value = p.description;
  document.getElementById('shop-amount').value = p.amount;
  updateShopPreview();
  document.querySelector('#page-shop .btn-danger').textContent = i18next.t('shop.saveChanges');
  document.getElementById('shop-desc').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.deletePurchase = async (id) => {
  if (!await confirmDialog(i18next.t('shop.confirmDelete'))) return;
  try {
    const ref = doc(db, 'users', currentUser.uid, 'purchases', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const pts = snap.data().pointsCost || 0;
    await deleteDoc(ref);
    await updateDoc(doc(db, 'users', currentUser.uid), {
      'points.total': increment(pts),
      'points.spentAllTime': increment(-pts),
    });
    if (editingPurchaseId === id) resetShopForm();
    await loadProfile();
    await loadDashboard();
    await loadPurchases();
    toast(i18next.t('shop.deleted'));
  } catch (e) {
    reportSaveError(e);
  }
};

export async function loadPurchases() {
  const q = query(
    collection(db, 'users', currentUser.uid, 'purchases'),
    orderBy('timestamp', 'desc'),
    limit(20)
  );
  const snap = await getDocs(q);
  const el = document.getElementById('purchase-list');

  if (snap.empty) { el.innerHTML = `<p class="text2">${i18next.t('shop.noPurchases')}</p>`; return; }

  el.innerHTML = snap.docs.map(d => {
    const p = d.data();
    const date = new Date(p.timestamp?.toDate ? p.timestamp.toDate() : p.timestamp);
    const dateStr = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="purchase-item">
      <div>
        <div style="font-size:14px;font-weight:500">${escapeHtml(p.description)}</div>
        <div class="text2">${dateStr}</div>
      </div>
      <div style="text-align:right;display:flex;align-items:center;gap:10px">
        <div>
          <div style="font-weight:700;color:var(--warn)">-${p.pointsCost} pkt</div>
          <div class="text2">${p.amount.toFixed(2).replace('.', ',')} zł</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn-ghost btn-sm" onclick="editPurchase('${d.id}')">${i18next.t('shop.edit')}</button>
          <button class="btn-ghost btn-sm" onclick="deletePurchase('${d.id}')">${i18next.t('shop.delete')}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Generator ─────────────────────────────────────────
window.selectTime = (min, el) => {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedGenTime = min;
  document.getElementById('gen-btn').disabled = false;
};

// Duża, dwujęzyczna pula (33 pozycje w resources i18n) + własne aktywności użytkownika —
// sam activityDefs (zwykle 5-8 pozycji) powtarzał się za często przy losowaniu.
window.generate = () => {
  const staticPool = i18next.t('genActivities', { returnObjects: true }) || [];
  const pool = [...staticPool, ...activityDefs];
  generatedActivity = pool[Math.floor(Math.random() * pool.length)];
  if (!generatedActivity) return;

  document.getElementById('gen-name').textContent = generatedActivity.name;
  document.getElementById('gen-pts').textContent = `${generatedActivity.points} pkt/h`;
  document.getElementById('gen-result').style.display = 'block';
  document.getElementById('gen-do-btn').style.display = 'inline-block';
};

window.goLogGenerated = () => {
  if (!generatedActivity) return;
  showPage('log-activity');
  const sel = document.getElementById('act-type');

  if (generatedActivity.id) {
    // Prawdziwa pozycja z activityDefs — jest już w <select> jako zwykła opcja.
    sel.value = generatedActivity.id;
  } else {
    // Aktywność z wbudowanej puli generatora — wstaw tymczasową opcję.
    let opt = sel.querySelector('option[value="__generated__"]');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = '__generated__';
      sel.appendChild(opt);
    }
    opt.textContent = `${generatedActivity.name} — ${generatedActivity.points} pkt/h`;
    opt.dataset.pts = generatedActivity.points;
    opt.dataset.genName = generatedActivity.name;
    sel.value = '__generated__';
  }

  if (selectedGenTime) {
    document.getElementById('act-minutes').value = selectedGenTime;
  }
  updatePointsPreview();
};

