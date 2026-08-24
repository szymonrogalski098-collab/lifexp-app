import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { activityDefById, confirmDialog, currentUser, db, escapeHtml, formatMinutes, prefersReduced, rateGeneral, toast, todayStr, userProfile } from "./core.js";
import { activityRowHTML, loadDashboard } from "./dashboard.js";

// ── Stats section ─────────────────────────────────────
// Dwa okna 7-dniowe: bieżący tydzień (dziś wstecz) i poprzedni (dni 7-13 wstecz).
// Oba liczone od TEGO SAMEGO `today`, żeby porównanie tydzień-do-tygodnia nie
// rozjechało się przy wywołaniu tuż przed północą.
function statsDayWindows() {
  const today = new Date();
  const isoDaysAgo = (n) => {
    const d = new Date(today); d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  };
  const days7 = [], days14 = [];
  for (let i = 6; i >= 0; i--) days7.push(isoDaysAgo(i));
  for (let i = 13; i >= 7; i--) days14.push(isoDaysAgo(i));
  return { days7, days14 };
}

// Jeden równoległy odczyt dailyLog dla wszystkich 14 dni naraz. Dni bez wpisu
// dostają wyzerowany rekord, żeby wywołujący nie musiał sprawdzać istnienia.
async function fetchDailyLogs(days) {
  const dayDataMap = {};
  await Promise.all(days.map(async d => {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'dailyLog', d));
    dayDataMap[d] = snap.exists() ? snap.data() : { pointsEarned: 0, gamingMinutes: 0 };
  }));
  return dayDataMap;
}

function sumDailyField(days, dayDataMap, field) {
  return days.reduce((sum, d) => sum + (dayDataMap[d]?.[field] || 0), 0);
}

function renderStatsWeekChart(days7, dayDataMap) {
  const maxPts    = Math.max(...days7.map(d => dayDataMap[d]?.pointsEarned || 0), 1);
  const DAY_NAMES = i18next.t('dayNamesShort', { returnObjects: true });
  document.getElementById('week-chart-wrap').innerHTML = days7.map(d => {
    const pts    = dayDataMap[d]?.pointsEarned || 0;
    const pct    = Math.round((pts / maxPts) * 100);
    const label  = DAY_NAMES[new Date(d + 'T12:00:00').getDay()];
    const isToday = d === todayStr();
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <span style="font-size:10px;color:var(--accent);font-weight:700;${pts === 0 ? 'visibility:hidden' : ''}">${pts}</span>
        <div style="width:100%;display:flex;align-items:flex-end;height:80px;">
          <div style="width:100%;height:${Math.max(pct, 3)}%;background:${isToday ? 'var(--accent)' : 'var(--bg3)'};border-radius:4px 4px 0 0;border:1px solid ${isToday ? 'var(--accent)' : 'var(--border)'};"></div>
        </div>
        <span style="font-size:10px;color:${isToday ? 'var(--accent)' : 'var(--text2)'};font-weight:${isToday ? '700' : '400'}">${label}</span>
      </div>`;
  }).join('');
}

// Ostatnie 50 aktywności zgrupowane po typie, posortowane malejąco po liczbie
// wpisów. Zwraca pary [typeId, { count, pts }] — używane i przez listę TOP,
// i przez ciekawostkę "ulubiona aktywność".
async function fetchTopActivities() {
  const actSnap = await getDocs(query(
    collection(db, 'users', currentUser.uid, 'activities'),
    orderBy('timestamp', 'desc'), limit(50)
  ));
  const typeMap = {};
  actSnap.forEach(d => {
    const { type, points } = d.data();
    if (!type) return;
    if (!typeMap[type]) typeMap[type] = { count: 0, pts: 0 };
    typeMap[type].count++;
    typeMap[type].pts += points || 0;
  });
  return Object.entries(typeMap).sort((a, b) => b[1].count - a[1].count);
}

function renderTopActivities(topActs) {
  const MEDALS = ['🥇','🥈','🥉','4.','5.'];
  document.getElementById('top-activities-list').innerHTML = topActs.length === 0
    ? `<p class="text2">${i18next.t('dashboard.noDataTop')}</p>`
    : topActs.slice(0, 5).map(([typeId, { count, pts }], i) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:18px;width:24px;text-align:center;flex-shrink:0">${MEDALS[i]}</span>
          <span style="flex:1;font-weight:600;font-size:14px">${escapeHtml(activityDefById(typeId).name)}</span>
          <span style="font-size:12px;color:var(--text2);margin-right:4px">${count}×</span>
          <span style="font-weight:700;color:var(--accent2);font-family:var(--mono);font-size:13px">+${pts} ${i18next.t('logActivity.pkt')}</span>
        </div>`).join('');
}

// Lista gotowych zdań "💡 ..." — każdy blok dokłada zdanie tylko gdy ma o czym
// mówić, więc pusta tablica oznacza "ukryj całą kartę ciekawostek".
function buildStatsFacts({ days7, dayDataMap, topActs, thisWeekPts, lastWeekPts, thisWeekGaming, lastWeekGaming }) {
  const facts = [];

  if (topActs.length > 0) {
    const [topTypeId, topData] = topActs[0];
    facts.push(i18next.t('facts.favoriteActivity', { name: activityDefById(topTypeId).name, count: topData.count }));
  }

  if (thisWeekPts > 0 || lastWeekPts > 0) {
    const diff = thisWeekPts - lastWeekPts;
    if (diff > 0)
      facts.push(i18next.t('facts.moreThisWeek', { diff, cur: thisWeekPts, prev: lastWeekPts }));
    else if (diff < 0)
      facts.push(i18next.t('facts.moreLastWeek', { diff: -diff }));
    else if (thisWeekPts > 0)
      facts.push(i18next.t('facts.sameAsLastWeek', { cur: thisWeekPts }));
  }

  if (thisWeekPts > 0)
    facts.push(i18next.t('facts.weekMoney', { amount: (thisWeekPts * rateGeneral()).toFixed(2) }));

  if (thisWeekGaming > 0 || lastWeekGaming > 0) {
    const diff = thisWeekGaming - lastWeekGaming;
    if (diff > 0)
      facts.push(i18next.t('facts.gamedMoreThisWeek', { diff: formatMinutes(diff) }));
    else if (diff < 0)
      facts.push(i18next.t('facts.gamedLessThisWeek', { diff: formatMinutes(-diff) }));
  }

  const bestDay = days7.reduce((best, d) =>
    (dayDataMap[d]?.pointsEarned || 0) > (dayDataMap[best]?.pointsEarned || 0) ? d : best, days7[0]);
  const bestPts = dayDataMap[bestDay]?.pointsEarned || 0;
  if (bestPts > 0) {
    const FULL_DAYS = i18next.t('dayNamesFull', { returnObjects: true });
    facts.push(i18next.t('facts.bestDay', { day: FULL_DAYS[new Date(bestDay + 'T12:00:00').getDay()], pts: bestPts }));
  }

  return facts;
}

function renderStatsFacts(facts) {
  const factsCard = document.getElementById('facts-card');
  const factsEl   = document.getElementById('facts-list');
  if (facts.length === 0) {
    factsCard.style.display = 'none';
    return;
  }
  factsCard.style.display = 'block';
  factsEl.innerHTML = facts.map(f => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:15px;flex-shrink:0;margin-top:1px">💡</span>
      <p style="margin:0;font-size:14px;line-height:1.6;">${f}</p>
    </div>`).join('');
}

export async function loadStatsSection() {
  const { days7, days14 } = statsDayWindows();
  const dayDataMap = await fetchDailyLogs([...days7, ...days14]);

  const thisWeekPts    = sumDailyField(days7,  dayDataMap, 'pointsEarned');
  const lastWeekPts    = sumDailyField(days14, dayDataMap, 'pointsEarned');
  const thisWeekGaming = sumDailyField(days7,  dayDataMap, 'gamingMinutes');
  const lastWeekGaming = sumDailyField(days14, dayDataMap, 'gamingMinutes');

  renderStatsWeekChart(days7, dayDataMap);

  const topActs = await fetchTopActivities();
  renderTopActivities(topActs);

  renderStatsFacts(buildStatsFacts({
    days7, dayDataMap, topActs, thisWeekPts, lastWeekPts, thisWeekGaming, lastWeekGaming,
  }));
}

// ── History (full, paginated client-side) ─────────────
let historyDocs = [];
let historyPage = 0;
const HISTORY_PAGE_SIZE = 15;

export async function loadHistory() {
  const el = document.getElementById('history-list');
  el.innerHTML = `<p class="text2">${i18next.t('dashboard.loading')}</p>`;
  const q = query(
    collection(db, 'users', currentUser.uid, 'activities'),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  historyDocs = snap.docs;
  historyPage = 0;
  renderHistoryPage();
}

function renderHistoryPage() {
  const el = document.getElementById('history-list');
  const pager = document.getElementById('history-pager');

  if (historyDocs.length === 0) {
    el.innerHTML = `<p class="text2">${i18next.t('dashboard.noActivities')}</p>`;
    pager.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(historyDocs.length / HISTORY_PAGE_SIZE);
  historyPage = Math.min(historyPage, totalPages - 1);
  const start = historyPage * HISTORY_PAGE_SIZE;
  const slice = historyDocs.slice(start, start + HISTORY_PAGE_SIZE);

  el.innerHTML = slice.map(d => activityRowHTML(d.id, d.data())).join('');

  pager.style.display = totalPages > 1 ? 'flex' : 'none';
  document.getElementById('history-page-info').textContent = i18next.t('history.pageInfo', {
    page: historyPage + 1, total: totalPages, count: historyDocs.length,
  });
  document.getElementById('history-prev').disabled = historyPage === 0;
  document.getElementById('history-next').disabled = historyPage >= totalPages - 1;
}

window.historyPrev = () => { if (historyPage > 0) { historyPage--; renderHistoryPage(); } };
window.historyNext = () => {
  if ((historyPage + 1) * HISTORY_PAGE_SIZE < historyDocs.length) { historyPage++; renderHistoryPage(); }
};

// ── Daily reset (test tool) ───────────────────────────
window.resetToday = async () => {
  if (!await confirmDialog(i18next.t('confirm.resetToday'), i18next.t('common.reset'))) return;
  try {
    const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', todayStr());
    const daySnap = await getDoc(dayRef);
    if (daySnap.exists()) {
      await updateDoc(dayRef, { pointsEarned: 0 });
    } else {
      await setDoc(dayRef, { pointsEarned: 0, gamingMinutes: 0 });
    }
    await loadDashboard();
    toast(i18next.t('settings.todayReset'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.resetFailed'), 'error');
  }
};

// ── Stats ─────────────────────────────────────────────
export async function loadStats() {
  const profile = userProfile;
  document.getElementById('stats-earned').textContent = profile?.points?.earnedAllTime || 0;
  document.getElementById('stats-spent').textContent = profile?.points?.spentAllTime || 0;

  // Last 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const ptsData = [], gamingData = [];
  for (const day of days) {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'dailyLog', day));
    ptsData.push(snap.exists() ? (snap.data().pointsEarned || 0) : 0);
    gamingData.push(snap.exists() ? (snap.data().gamingMinutes || 0) : 0);
  }

  const totalGamingMin = gamingData.reduce((a, b) => a + b, 0);
  document.getElementById('stats-gaming').textContent = formatMinutes(totalGamingMin);

  renderBarChart('pts-chart', ptsData, days.map(d => d.slice(5)), 'var(--accent)');
  renderBarChart('gaming-chart', gamingData, days.map(d => d.slice(5)), 'var(--accent2)');
}

function renderBarChart(id, data, labels, color) {
  const el = document.getElementById(id);
  const max = Math.max(...data, 1);
  const reduce = prefersReduced();
  el.innerHTML = data.map((v, i) => {
    const h = (v / max) * 100;
    const style = reduce
      ? `height:${h}px;background:${color}`
      : `height:0px;transition-delay:${i * 60}ms;background:${color}`;
    return `<div class="bar-col">
      <div class="bar-val">${v}</div>
      <div class="bar" style="${style}" data-h="${h}"></div>
      <div class="bar-label">${labels[i]}</div>
    </div>`;
  }).join('');
  // Grow bars from zero on the next frame so the CSS height transition plays.
  if (!reduce) requestAnimationFrame(() =>
    el.querySelectorAll('.bar').forEach(b => { b.style.height = b.dataset.h + 'px'; }));
}

