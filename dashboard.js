import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { DAILY_LIMIT_DEFAULT, activityDefById, animateCount, confettiBurst, confirmDialog, currentUser, db, escapeHtml, fmtMoney, formatMinutes, formatPLN, getDailyLimit, getTodayPts, loadProfile, round2, toast, todayStr, userProfile } from "./core.js";
import { loadHistory, loadStatsSection } from "./history-stats.js";
import { loadMoneyDocs, migrateMoneyIncome, moneyBalance, updateMoneyBalanceUI, updateMoneyCurrent } from "./money.js";

// ── Dashboard ─────────────────────────────────────────
export async function loadDashboard() {
  const profile = userProfile;
  if (!profile) return;

  const totalPts = profile.points?.total || 0;
  animateCount(document.getElementById('dash-pln'), totalPts, formatPLN);
  animateCount(document.getElementById('dash-pts-num'), totalPts, v => Math.round(v).toString());
  animateCount(document.getElementById('stats-earned'), profile.points?.earnedAllTime || 0);
  animateCount(document.getElementById('stats-spent'), profile.points?.spentAllTime || 0);
  animateCount(document.getElementById('dash-spent'), profile.points?.spentAllTime || 0, formatPLN);

  // Today pts
  const todayPts = await getTodayPts();
  const dailyLimit = await getDailyLimit();
  animateCount(document.getElementById('dash-today-pts'), todayPts);
  document.getElementById('dash-limit-text').textContent = `${todayPts} / ${dailyLimit} ${i18next.t('logActivity.pkt')}`;
  const pct = Math.min(100, (todayPts / dailyLimit) * 100);
  document.getElementById('dash-progress-bar').style.width = pct + '%';

  // Today gaming
  const gamingSnap = await getDoc(doc(db, 'users', currentUser.uid, 'dailyLog', todayStr()));
  const gamingMin = gamingSnap.exists() ? (gamingSnap.data().gamingMinutes || 0) : 0;
  document.getElementById('dash-gaming-today').textContent = formatMinutes(gamingMin);

  // Level (XP based on all-time earned points)
  renderLevel(profile.points?.earnedAllTime || 0);

  // Streak + recent activities + stats + cel oszczędzania
  const streak = await renderStreak();
  await loadRecentActivities();
  loadStatsSection();
  await migrateMoneyIncome();
  checkAchievements({ streak });
  // Saldo Money potrzebne do celów pieniężnych na dashboardzie (money/balance).
  try { await loadMoneyDocs(); } catch (e) { console.error('loadMoneyDocs (dashboard) failed:', e); }
  renderGoal();

  // Ustaw toggle raportu
  const rToggle = document.getElementById('auto-report-toggle');
  if (rToggle) rToggle.checked = userProfile?.autoReport === true;
}

// ── Cele oszczędzania (do 3 naraz) ─────────────────────
let goalFormState = null; // null | { editId: string|null, type: 'points'|'money'|null }
const newGoalId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Jednorazowa migracja z pojedynczych pól (goalName/goalType/goalAmount) na tablicę `goals`.
async function migrateLegacyGoal() {
  if (userProfile.goalName && userProfile.goalAmount && !userProfile.goals) {
    const migrated = [{
      id: newGoalId(), name: userProfile.goalName, type: userProfile.goalType || 'money',
      amount: userProfile.goalAmount, celebrated: userProfile.goalCelebrated === true,
    }];
    await updateDoc(doc(db, 'users', currentUser.uid), {
      goals: migrated,
      goalName: deleteField(), goalType: deleteField(), goalAmount: deleteField(),
      goalCelebrated: deleteField(), goalAmountZl: deleteField(),
    });
    userProfile.goals = migrated;
  }
}

function goalCardHTML(g) {
  const t = (k, o) => i18next.t(k, o);
  const isMoney = g.type === 'money';
  // Cel pieniężny mierzy sumę WPŁACONĄ na cel (g.saved) — użytkownik sam odkłada
  // kwoty przyciskiem „Wpłać", co NIE rusza salda Money. Cel punktowy — punkty LifeXP.
  const balance = isMoney ? (g.saved || 0) : (userProfile.points?.total || 0);
  const pct = Math.min(100, (balance / g.amount) * 100);
  const missing = Math.max(0, g.amount - balance);
  const reached = balance >= g.amount;
  const fmt = (n) => isMoney ? n.toFixed(2).replace('.', ',') + ' zł' : Math.round(n) + ' pkt';

  if (reached && !g.celebrated) {
    g.celebrated = true;
    updateDoc(doc(db, 'users', currentUser.uid), { goals: userProfile.goals }).catch(() => {});
    confettiBurst();
    toast(t('goal.reached'), 'success');
  }

  return `
    <div class="card goal-item">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
        <h3 style="margin:0">🎯 ${escapeHtml(g.name)}</h3>
        <div style="display:flex;gap:6px">
          <button class="btn-ghost btn-sm" onclick="editGoal('${g.id}')">${t('goal.edit')}</button>
          <button class="btn-ghost btn-sm" onclick="removeGoal('${g.id}')">${t('goal.remove')}</button>
        </div>
      </div>
      <div class="progress-bar-wrap" style="margin-bottom:8px">
        <div class="progress-bar" style="width:${pct}%;${reached ? 'background:var(--accent2)' : ''}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <span class="text2">${fmt(balance)} / ${fmt(g.amount)} · <strong>${pct.toFixed(0)}%</strong></span>
        <span style="font-size:13px;font-weight:600;color:${reached ? 'var(--accent2)' : 'var(--text2)'}">
          ${reached ? t('goal.reached') : (isMoney ? t('goal.missing', { zl: missing.toFixed(2).replace('.', ',') }) : t('goal.missingPts', { pts: Math.ceil(missing) }))}
        </span>
      </div>
      ${isMoney && !reached ? `
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="number" id="goal-deposit-${g.id}" min="0.01" max="1000000" step="0.01" placeholder="${t('money.depositPh')}" style="flex:1">
        <button class="btn-primary btn-sm" onclick="depositGoal('${g.id}')">${t('money.deposit')}</button>
      </div>` : ''}
    </div>`;
}

function goalFormHTML() {
  const t = (k, o) => i18next.t(k, o);
  if (!goalFormState.type) {
    return `
      <div class="card goal-item">
        <h3 style="margin-bottom:14px">🎯 ${t('goal.title')}</h3>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" style="flex:1" onclick="pickGoalType('points')">🎯 ${t('goal.typePoints')}</button>
          <button class="btn-secondary" style="flex:1" onclick="pickGoalType('money')">💰 ${t('goal.typeMoney')}</button>
        </div>
        <button class="btn-ghost btn-sm" style="margin-top:8px" onclick="cancelGoalType()">${t('settings.cancel')}</button>
      </div>`;
  }
  const isMoney = goalFormState.type === 'money';
  return `
    <div class="card goal-item">
      <h3 style="margin-bottom:14px">🎯 ${t('goal.title')}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="text" id="goal-name-input" maxlength="50" placeholder="${t('goal.namePh')}" style="flex:2;min-width:150px">
        <input type="number" id="goal-amount-input" min="1" max="10000000" step="${isMoney ? '0.01' : '1'}" placeholder="${isMoney ? t('goal.amountLabel') : t('goal.amountLabelPts')}" style="flex:1;min-width:90px">
        <button class="btn-primary" onclick="saveGoal()">${t('goal.set')}</button>
      </div>
      <button class="btn-ghost btn-sm" style="margin-top:8px" onclick="cancelGoalType()">${t('settings.cancel')}</button>
    </div>`;
}

export async function renderGoal() {
  const wrap = document.getElementById('goal-card');
  if (!wrap || !userProfile) return;

  await migrateLegacyGoal();
  const goals = userProfile.goals || [];
  wrap.style.display = 'block';

  let html = goals.map(goalCardHTML).join('');

  if (goalFormState) {
    html += goalFormHTML();
  } else if (goals.length < 3) {
    html += `
      <div class="card goal-item" style="text-align:center;cursor:pointer;border-style:dashed" onclick="openGoalForm()">
        <span style="color:var(--text2);font-weight:600">+ ${i18next.t('goal.addAnother')}</span>
      </div>`;
  }

  wrap.innerHTML = html;
}

window.openGoalForm = () => {
  goalFormState = { editId: null, type: null };
  renderGoal();
};

window.pickGoalType = (type) => {
  goalFormState.type = type;
  renderGoal();
};

window.cancelGoalType = () => {
  goalFormState = null;
  renderGoal();
};

window.saveGoal = async () => {
  const name = document.getElementById('goal-name-input').value.trim();
  const amount = parseFloat(document.getElementById('goal-amount-input').value);
  if (!name) return toast(i18next.t('goal.namePh'), 'error');
  if (!amount || amount <= 0) return toast(i18next.t('goal.amountLabel'), 'error');

  const goals = userProfile.goals || [];
  if (goalFormState.editId) {
    const g = goals.find(x => x.id === goalFormState.editId);
    if (g) {
      // Zmiana typu pieniężny → punktowy: zwróć odłożoną kasę na saldo, by nie utknęła.
      if (g.type === 'money' && goalFormState.type !== 'money' && (g.saved || 0) > 0) {
        await updateMoneyCurrent(g.saved);
        if (moneyBalance) moneyBalance.current = round2((moneyBalance.current || 0) + g.saved);
        g.saved = 0;
      }
      g.name = name; g.type = goalFormState.type; g.amount = amount; g.celebrated = false;
    }
  } else {
    if (goals.length >= 3) return toast(i18next.t('goal.maxReached'), 'error');
    // saved = ile już wpłacono na cel (tylko cele pieniężne); startuje od 0.
    goals.push({ id: newGoalId(), name, type: goalFormState.type, amount, celebrated: false, saved: 0 });
  }
  userProfile.goals = goals;
  await updateDoc(doc(db, 'users', currentUser.uid), { goals });
  goalFormState = null;
  await loadProfile();
  renderGoal();
  updateMoneyBalanceUI();
};

// Wpłata na cel pieniężny — dolicza do g.saved i NIE rusza salda Money trackera.
window.depositGoal = async (id) => {
  const g = (userProfile.goals || []).find(x => x.id === id);
  if (!g || g.type !== 'money') return;
  const input = document.getElementById('goal-deposit-' + id);
  const amount = round2(parseFloat(input?.value));
  if (!amount || amount <= 0) return toast(i18next.t('money.enterAmount'), 'error');
  // Wpłata pobiera kasę z konta Money — nie pozwól wpłacić więcej niż saldo.
  if (amount > (moneyBalance?.current || 0)) return toast(i18next.t('money.notEnoughBalance'), 'error');
  await updateMoneyCurrent(-amount);
  if (moneyBalance) moneyBalance.current = round2((moneyBalance.current || 0) - amount);
  g.saved = round2((g.saved || 0) + amount);
  await updateDoc(doc(db, 'users', currentUser.uid), { goals: userProfile.goals });
  await loadProfile();
  renderGoal();
  updateMoneyBalanceUI();
  toast(i18next.t('money.depositSaved', { amount: fmtMoney(amount), name: g.name, interpolation: { escapeValue: false } }));
};

window.editGoal = (id) => {
  const g = (userProfile.goals || []).find(x => x.id === id);
  if (!g) return;
  goalFormState = { editId: id, type: g.type };
  renderGoal().then(() => {
    document.getElementById('goal-name-input').value = g.name;
    document.getElementById('goal-amount-input').value = g.amount;
  });
};

window.removeGoal = async (id) => {
  if (!await confirmDialog(i18next.t('goal.confirmRemove'))) return;
  // Odłożone na cel pieniądze wracają na saldo Money — nie przepadają.
  const g = (userProfile.goals || []).find(x => x.id === id);
  if (g && g.type === 'money' && (g.saved || 0) > 0) {
    await updateMoneyCurrent(g.saved);
    if (moneyBalance) moneyBalance.current = round2((moneyBalance.current || 0) + g.saved);
  }
  userProfile.goals = (userProfile.goals || []).filter(x => x.id !== id);
  await updateDoc(doc(db, 'users', currentUser.uid), { goals: userProfile.goals });
  goalFormState = null;
  await loadProfile();
  renderGoal();
  updateMoneyBalanceUI();
};

// ── Level system ──────────────────────────────────────
export const XP_PER_LEVEL = 500;
export function levelTitle(level) {
  const titles = i18next.t('levelTitles', { returnObjects: true });
  return titles[Math.min(level - 1, titles.length - 1)];
}

export function renderLevel(xp) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const intoLevel = xp % XP_PER_LEVEL;
  document.getElementById('dash-level').textContent = i18next.t('dashboard.level', { n: level });
  document.getElementById('dash-level-title').textContent = levelTitle(level);
  document.getElementById('dash-level-xp').textContent = i18next.t('dashboard.xp', { cur: intoLevel, max: XP_PER_LEVEL });
  document.getElementById('dash-level-bar').style.width = (intoLevel / XP_PER_LEVEL * 100) + '%';
}

// ── Streak ────────────────────────────────────────────
const streakDayKey = (date) => date.toISOString().split('T')[0];

// Dni, w których cokolwiek zarobiono — tylko one podtrzymują serię.
async function fetchStreakActiveDays() {
  const snap = await getDocs(collection(db, 'users', currentUser.uid, 'dailyLog'));
  const activeDays = new Set();
  snap.forEach(d => { if ((d.data().pointsEarned || 0) > 0) activeDays.add(d.id); });
  return activeDays;
}

// "Zamrożenie" serii przysługuje raz na 7 dni i pozwala przeskoczyć JEDNĄ lukę.
function isStreakFreezeAvailable() {
  const lastFreeze   = userProfile.streakFreezeLastUsed;
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return !lastFreeze || new Date(lastFreeze) < sevenDaysAgo;
}

// Zapis "zużyto zamrożenie" celowo BEZ await — seria ma się wyrenderować od
// razu, a utrwalenie daty może dojechać w tle.
function consumeStreakFreeze() {
  updateDoc(doc(db, 'users', currentUser.uid), { streakFreezeLastUsed: todayStr() });
  userProfile.streakFreezeLastUsed = todayStr();
}

// Cofamy się dzień po dniu od dziś (albo od wczoraj, jeśli dziś jeszcze nic nie
// zarobiono — trwająca seria nie może się zerwać o poranku) aż do pierwszej
// luki, którą wolno przeskoczyć najwyżej raz, kosztem zamrożenia.
function calculateStreakDays(activeDays, freezeAvailable) {
  let streak = 0, freezeUsedNow = false;
  const cursor = new Date();
  if (!activeDays.has(streakDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  while (true) {
    if (activeDays.has(streakDayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (!freezeUsedNow && freezeAvailable && streak > 0) {
      freezeUsedNow = true;
      cursor.setDate(cursor.getDate() - 1);
      consumeStreakFreeze();
    } else {
      break;
    }
  }
  return { streak, freezeUsedNow };
}

function renderStreakBadge(badge, streak) {
  if (streak > 0) {
    document.getElementById('dash-streak-num').textContent = streak;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

// Kolory na sztywno (biały/półprzezroczysty biały), bo ten element zawsze siedzi
// na kolorowej karcie salda — var(--accent)/var(--text2) bywają ciemne (np. Apple)
// i stają się nieczytelne na tle gradientu, tak jak wcześniej .balance-amount.
function renderStreakFreezeHint(freezeEl, { freezeUsedNow, freezeAvailable, streak }) {
  if (!freezeEl) return;
  if (freezeUsedNow) {
    freezeEl.textContent = i18next.t('dashboard.freezeUsed');
    freezeEl.style.color = '#fff';
    freezeEl.style.display = 'block';
  } else if (freezeAvailable && streak > 0) {
    freezeEl.textContent = i18next.t('dashboard.freezeAvailable');
    freezeEl.style.color = 'rgba(255,255,255,.7)';
    freezeEl.style.display = 'block';
  } else {
    freezeEl.style.display = 'none';
  }
}

async function renderStreak() {
  const badge    = document.getElementById('dash-streak');
  const freezeEl = document.getElementById('dash-freeze');
  try {
    const activeDays = await fetchStreakActiveDays();
    const freezeAvailable = isStreakFreezeAvailable();
    const { streak, freezeUsedNow } = calculateStreakDays(activeDays, freezeAvailable);

    renderStreakBadge(badge, streak);
    renderStreakFreezeHint(freezeEl, { freezeUsedNow, freezeAvailable, streak });

    return streak;
  } catch (e) {
    badge.style.display = 'none';
    return 0;
  }
}

// ── Achievements ── (nazwy/opisy w słowniku i18n: achievements.<id>)
const ACHIEVEMENTS = [
  { id: 'first_activity', emoji: '✨' },
  { id: 'pts_1000',       emoji: '💰' },
  { id: 'pts_5000',       emoji: '💎' },
  { id: 'first_purchase', emoji: '🛒' },
  { id: 'streak_7',       emoji: '🔥' },
  { id: 'streak_30',      emoji: '🏆' },
  { id: 'gaming_hour',    emoji: '🎮' },
  { id: 'daily_limit',    emoji: '⚡' },
  { id: 'money_100',      emoji: '💵' },
  { id: 'money_500',      emoji: '💶' },
  { id: 'money_1000',     emoji: '🤑' },
  { id: 'money_2500',     emoji: '🪙' },
  { id: 'money_5000',     emoji: '🏦' },
  { id: 'money_10000',    emoji: '👑' },
];

export async function checkAchievements({ streak = 0 } = {}) {
  const profile = userProfile;
  const current = new Set(profile.achievements || []);
  const newOnes = [];

  const daySnap   = await getDoc(doc(db, 'users', currentUser.uid, 'dailyLog', todayStr()));
  const todayPts  = daySnap.exists() ? (daySnap.data().pointsEarned  || 0) : 0;
  const todayGame = daySnap.exists() ? (daySnap.data().gamingMinutes || 0) : 0;

  const checks = {
    first_activity: (profile.points?.earnedAllTime || 0) > 0,
    pts_1000:       (profile.points?.earnedAllTime || 0) >= 1000,
    pts_5000:       (profile.points?.earnedAllTime || 0) >= 5000,
    first_purchase: (profile.points?.spentAllTime  || 0) > 0,
    streak_7:       streak >= 7,
    streak_30:      streak >= 30,
    gaming_hour:    todayGame >= 60,
    daily_limit:    todayPts  >= (profile.dailyLimit || DAILY_LIMIT_DEFAULT),
    money_100:      (profile.moneyIncomeAllTime || 0) >= 100,
    money_500:      (profile.moneyIncomeAllTime || 0) >= 500,
    money_1000:     (profile.moneyIncomeAllTime || 0) >= 1000,
    money_2500:     (profile.moneyIncomeAllTime || 0) >= 2500,
    money_5000:     (profile.moneyIncomeAllTime || 0) >= 5000,
    money_10000:    (profile.moneyIncomeAllTime || 0) >= 10000,
  };

  for (const a of ACHIEVEMENTS) {
    if (!current.has(a.id) && checks[a.id]) newOnes.push(a);
  }

  if (newOnes.length > 0) {
    const updated = [...current, ...newOnes.map(a => a.id)];
    await updateDoc(doc(db, 'users', currentUser.uid), { achievements: updated });
    userProfile.achievements = updated;
    const list = newOnes.map(a => a.emoji + ' ' + i18next.t(`achievements.${a.id}.name`)).join(', ');
    toast(i18next.t('toast.newBadge', { list }), 'success');
  }

  renderAchievements();
}

export function renderAchievements() {
  const grid     = document.getElementById('achievements-grid');
  if (!grid) return;
  const unlocked = new Set(userProfile.achievements || []);
  grid.innerHTML = ACHIEVEMENTS.map(a => {
    const done = unlocked.has(a.id);
    const name = i18next.t(`achievements.${a.id}.name`);
    const desc = i18next.t(`achievements.${a.id}.desc`);
    return `<div title="${desc}" style="text-align:center;padding:10px 4px;border:1px solid ${done ? 'var(--accent)' : 'var(--border)'};border-radius:10px;${done ? 'background:var(--bg3)' : 'opacity:.35'};cursor:default;">
      <div style="font-size:22px;margin-bottom:5px">${a.emoji}</div>
      <div style="font-size:10px;font-weight:600;line-height:1.3;color:${done ? 'var(--text)' : 'var(--text2)'}">${name}</div>
    </div>`;
  }).join('');
}

async function loadRecentActivities() {
  const q = query(
    collection(db, 'users', currentUser.uid, 'activities'),
    orderBy('timestamp', 'desc'),
    limit(5)
  );
  const snap = await getDocs(q);
  const el = document.getElementById('recent-list');

  if (snap.empty) {
    el.innerHTML = `<p class="text2">${i18next.t('dashboard.noActivities')}</p>`;
    return;
  }

  el.innerHTML = snap.docs.map(d => activityRowHTML(d.id, d.data())).join('');
}

export function activityRowHTML(id, a) {
  const act = activityDefById(a.type);
  const name = a.typeName || act.name;
  const date = new Date(a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp);
  const dateStr = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  const desc = a.desc ? ' · ' + escapeHtml(a.desc) : '';
  return `<div class="activity-item">
    <div class="activity-icon" style="background:${act.color}22"><i class="ti ${act.icon}"></i></div>
    <div class="activity-info">
      <div class="activity-name">${escapeHtml(name)}</div>
      <div class="activity-meta">${formatMinutes(a.duration)} · ${dateStr}${desc}</div>
    </div>
    <div class="activity-pts">+${a.points} pkt</div>
    <button class="activity-del" onclick="deleteActivity('${id}')" title="Usuń">✕</button>
  </div>`;
}


// Delete an activity and roll back its points from totals + that day's log.
// Cofa punkty przyznane za wpis aktywności `a` (dailyLog dnia + saldo/suma
// życiowa, oba klamrowane do 0) — współdzielone przez usuwanie aktywności
// z Historii i cofanie ukończenia zadania w Planerze dnia (odznaczenie),
// żeby arytmetyka wycofania nie żyła w dwóch miejscach. Zwraca cofniętą
// liczbę punktów (do komunikatu toast u wywołującego).
export async function revertActivityPoints(a) {
  const pts = a.points || 0;
  const ts = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
  const dayKey = ts.toISOString().split('T')[0];

  const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', dayKey);
  const daySnap = await getDoc(dayRef);
  if (daySnap.exists()) {
    const cur = daySnap.data().pointsEarned || 0;
    await updateDoc(dayRef, { pointsEarned: Math.max(0, cur - pts) });
  }

  const newTotal = Math.max(0, (userProfile.points.total || 0) - pts);
  const newEarned = Math.max(0, (userProfile.points.earnedAllTime || 0) - pts);
  await updateDoc(doc(db, 'users', currentUser.uid), {
    'points.total': newTotal,
    'points.earnedAllTime': newEarned
  });
  return pts;
}

window.deleteActivity = async (id) => {
  if (!await confirmDialog(i18next.t('confirm.deleteActivity'))) return;
  try {
    const ref = doc(db, 'users', currentUser.uid, 'activities', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const a = snap.data();

    await deleteDoc(ref);
    const pts = await revertActivityPoints(a);

    await loadProfile();
    await loadDashboard();
    if (document.getElementById('page-history').classList.contains('active')) await loadHistory();
    toast(i18next.t('logActivity.deleted', { pts }));
  } catch (e) {
    console.error(e);
    toast(i18next.t('common.deleteError'), 'error');
  }
};

