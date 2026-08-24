import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { activityDefById, activityDefs, confettiBurst, confirmDialog, currentUser, dateISOLocal, db, escapeHtml, getDailyLimit, getTodayPts, loadActivityDefs, loadProfile, pulseEl, showLevelup, toast, todayStr, userProfile } from "./core.js";
import { XP_PER_LEVEL, levelTitle, loadDashboard, revertActivityPoints } from "./dashboard.js";

// ── Planer dnia ─────────────────────────────────────────
// Oś czasu na DZISIAJ (dateISOLocal()) — bez powtarzalnych szablonów, bez
// przeglądania dawnych dni (świadomie: patrz plan). Każde zadanie to jeden
// dokument w users/{uid}/plannerTasks. Ukończenie zadania NIE jest osobnym
// systemem punktów — tworzy zwykły wpis w users/{uid}/activities, dokładnie
// tak jak window.logActivity (activities.js), więc trafia też do
// Historii/Statystyk i do tego samego salda (points.total/earnedAllTime),
// z tym samym dziennym limitem (getTodayPts/getDailyLimit z core.js).
// Odznaczenie cofa to przez revertActivityPoints — wspólne z
// window.deleteActivity, oba w dashboard.js — bez modala
// potwierdzenia, bo odznaczenie checkboxa ma być natychmiastowe.
let plannerTasks = [];
let plannerEditingId = null;      // id edytowanego zadania w sheet, null = tryb dodawania
let plannerSheetDay = 'today';    // 'today' | 'tomorrow' — wybrany dzień w sheet dodawania
let plannerPointsAutoFilled = true; // czy pole punktów wciąż śledzi auto-sugestię, czy user je nadpisał ręcznie
let plannerScrolledOnce = false;  // przewiń raz do "teraz" przy otwarciu strony, nie przy każdym re-renderze
const PLANNER_ROW_H = 56; // px/godzina — zsynchronizowane z generowanym stylem .planner-hour-row/.planner-block

function plannerDayISO(day) {
  const d = new Date();
  if (day === 'tomorrow') d.setDate(d.getDate() + 1);
  return dateISOLocal(d);
}

function planSuggestTimeStr() {
  const d = new Date();
  const mins = d.getMinutes();
  d.setMinutes(mins + ((15 - mins % 15) % 15), 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderPlannerTypeSelect() {
  const sel = document.getElementById('planner-type');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">${i18next.t('logActivity.choose')}</option>` + activityDefs.map(a =>
    `<option value="${a.id}" data-pts="${a.points}">${escapeHtml(a.name)} — ${a.points} ${i18next.t('logActivity.pkt')}/h</option>`
  ).join('');
  if (current) sel.value = current;
}

export async function loadPlanner() {
  if (!activityDefs.length) await loadActivityDefs();
  renderPlannerTypeSelect();

  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  document.getElementById('planner-date-label').textContent =
    new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });

  const todayISO = dateISOLocal();
  const snap = await getDocs(query(
    collection(db, 'users', currentUser.uid, 'plannerTasks'),
    where('dateISO', '==', todayISO)
  ));
  // Sortowanie po stronie klienta (nie orderBy w zapytaniu) — omija ryzyko
  // wymogu złożonego indeksu Firestore dla where+orderBy na różnych polach;
  // liczba zadań na jeden dzień jest i tak mała.
  plannerTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  plannerScrolledOnce = false;
  renderPlannerTimeline();

  const todayPts = await getTodayPts();
  document.getElementById('planner-today-pts').textContent = `${todayPts} ${i18next.t('logActivity.pkt')}`;
}

function renderPlannerTimeline() {
  const timeline = document.getElementById('planner-timeline');
  const empty = document.getElementById('planner-empty');
  if (!timeline) return;
  timeline.style.height = (24 * PLANNER_ROW_H) + 'px';

  let html = '';
  for (let h = 0; h < 24; h++) {
    html += `<div class="planner-hour-row" style="top:${h * PLANNER_ROW_H}px;height:${PLANNER_ROW_H}px">` +
      `<span class="planner-hour-label">${String(h).padStart(2, '0')}:00</span></div>`;
  }

  const now = new Date();
  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * PLANNER_ROW_H;
  html += `<div class="planner-now-line" style="top:${nowTop}px"></div>`;

  for (const task of plannerTasks) {
    const [hh, mm] = (task.time || '00:00').split(':').map(Number);
    const startMin = hh * 60 + mm;
    const top = startMin / 60 * PLANNER_ROW_H;
    const height = Math.max(30, (task.durationMin || 5) / 60 * PLANNER_ROW_H);
    const endMin = startMin + (task.durationMin || 0);
    const endStr = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    const def = activityDefById(task.type);
    html += `<div class="planner-block${task.done ? ' done' : ''}" style="top:${top}px;height:${height}px;border-left-color:${def.color}" onclick="togglePlannerTask('${task.id}')">` +
      `<div class="pb-title">${escapeHtml(task.title)}</div>` +
      `<div class="pb-meta"><span>${task.time}–${endStr}</span><span class="pb-pts">+${task.points || 0} ${i18next.t('logActivity.pkt')}</span></div>` +
      `<span class="pb-edit" onclick="event.stopPropagation();editPlannerTask('${task.id}')"><i class="ti ti-pencil"></i></span>` +
      `</div>`;
  }

  timeline.innerHTML = html;
  empty.style.display = plannerTasks.length === 0 ? 'block' : 'none';

  const wrap = document.getElementById('planner-timeline-wrap');
  if (wrap && !plannerScrolledOnce) {
    wrap.scrollTop = Math.max(0, nowTop - 120);
    plannerScrolledOnce = true;
  }
}

// Tapnięcie pustego miejsca na osi (nie bloku zadania) otwiera sheet z
// godziną odczytaną z pozycji tapnięcia, zaokrągloną do 5 minut.
window.handlePlannerTimelineClick = (e) => {
  if (e.target.closest('.planner-block')) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const totalMin = Math.max(0, Math.round((y / PLANNER_ROW_H * 60) / 5) * 5);
  const hh = Math.floor(totalMin / 60) % 24, mm = totalMin % 60;
  openPlannerSheet(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
};

window.openPlannerSheet = (prefillTime) => {
  plannerEditingId = null;
  plannerSheetDay = 'today';
  plannerPointsAutoFilled = true;
  document.getElementById('planner-sheet-title').textContent = i18next.t('planner.sheetTitleAdd');
  document.getElementById('planner-title').value = '';
  document.getElementById('planner-time').value = prefillTime || planSuggestTimeStr();
  document.getElementById('planner-duration').value = '';
  document.getElementById('planner-type').value = '';
  document.getElementById('planner-points').value = '';
  document.getElementById('planner-points-hint').textContent = '';
  document.getElementById('planner-delete-btn').style.display = 'none';
  document.getElementById('planner-day-toggle').style.display = 'flex';
  document.querySelectorAll('#planner-day-toggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.day === 'today'));
  document.getElementById('planner-sheet').classList.add('open');
};
window.closePlannerSheet = () => document.getElementById('planner-sheet').classList.remove('open');

window.setPlannerDay = (day) => {
  plannerSheetDay = day;
  document.querySelectorAll('#planner-day-toggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.day === day));
};

window.editPlannerTask = (id) => {
  const task = plannerTasks.find(t => t.id === id);
  if (!task) return;
  plannerEditingId = id;
  plannerSheetDay = 'today'; // tylko dzisiejsze zadania są w ogóle wczytane/widoczne
  plannerPointsAutoFilled = false; // istniejąca wartość to świadomy wybór usera, nie nadpisuj jej auto-sugestią
  document.getElementById('planner-sheet-title').textContent = i18next.t('planner.sheetTitleEdit');
  document.getElementById('planner-title').value = task.title || '';
  document.getElementById('planner-time').value = task.time || '';
  document.getElementById('planner-duration').value = task.durationMin || '';
  document.getElementById('planner-type').value = task.type || '';
  document.getElementById('planner-points').value = task.points != null ? task.points : '';
  document.getElementById('planner-points-hint').textContent = '';
  document.getElementById('planner-delete-btn').style.display = 'block';
  document.getElementById('planner-day-toggle').style.display = 'none';
  document.getElementById('planner-sheet').classList.add('open');
};

window.updatePlannerPointsPreview = () => {
  const sel = document.getElementById('planner-type');
  const opt = sel.options[sel.selectedIndex];
  const ptsPerH = parseInt(opt?.dataset.pts || 0);
  const min = parseInt(document.getElementById('planner-duration').value) || 0;
  const hint = document.getElementById('planner-points-hint');
  const ptsInput = document.getElementById('planner-points');
  if (!ptsPerH || min < 5) { hint.textContent = ''; return; }
  const suggested = Math.round((min / 60) * ptsPerH);
  if (plannerPointsAutoFilled || ptsInput.value === '') ptsInput.value = suggested;
  hint.textContent = i18next.t('planner.suggestedHint', { pts: suggested });
};

window.savePlannerTask = async () => {
  const title = document.getElementById('planner-title').value.trim();
  const time = document.getElementById('planner-time').value;
  const durationMin = parseInt(document.getElementById('planner-duration').value);
  const type = document.getElementById('planner-type').value;
  const points = parseInt(document.getElementById('planner-points').value) || 0;

  if (!title) return toast(i18next.t('planner.enterTitle'), 'error');
  if (!time) return toast(i18next.t('planner.enterTimeErr'), 'error');
  if (!durationMin || durationMin < 5) return toast(i18next.t('logActivity.minMinutes'), 'error');
  if (!type) return toast(i18next.t('logActivity.chooseType'), 'error');

  try {
    if (plannerEditingId) {
      await updateDoc(doc(db, 'users', currentUser.uid, 'plannerTasks', plannerEditingId), { title, time, durationMin, type, points });
    } else {
      await addDoc(collection(db, 'users', currentUser.uid, 'plannerTasks'), {
        dateISO: plannerDayISO(plannerSheetDay), time, durationMin, title, type, points,
        done: false, activityId: null, createdAt: new Date(),
      });
    }
    closePlannerSheet();
    await loadPlanner();
    toast(i18next.t('planner.saved'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.saveRetry'), 'error');
  }
};

window.deletePlannerTask = async () => {
  if (!plannerEditingId) return;
  const task = plannerTasks.find(t => t.id === plannerEditingId);
  if (!task) return;
  if (!await confirmDialog(i18next.t('confirm.deleteEntry'))) return;
  try {
    if (task.done && task.activityId) {
      const ref = doc(db, 'users', currentUser.uid, 'activities', task.activityId);
      const actSnap = await getDoc(ref);
      if (actSnap.exists()) {
        await deleteDoc(ref);
        await revertActivityPoints(actSnap.data());
        await loadProfile();
        await loadDashboard();
      }
    }
    await deleteDoc(doc(db, 'users', currentUser.uid, 'plannerTasks', plannerEditingId));
    closePlannerSheet();
    await loadPlanner();
    toast(i18next.t('planner.deleted'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('common.deleteError'), 'error');
  }
};

window.togglePlannerTask = async (id) => {
  const task = plannerTasks.find(t => t.id === id);
  if (!task) return;
  if (task.done) await unmarkPlannerTaskDone(task);
  else await markPlannerTaskDone(task);
};

// Ukończenie zadania = dokładnie ten sam zapis co window.logActivity
// (activities + dailyLog + points.total/earnedAllTime, ten sam dzienny
// limit), tylko źródłem danych jest plannerTask zamiast formularza.
async function markPlannerTaskDone(task) {
  const todayPts = await getTodayPts();
  const dailyLimit = await getDailyLimit();
  const actualEarned = Math.min(task.points || 0, Math.max(0, dailyLimit - todayPts));

  const beforeEarned = userProfile.points?.earnedAllTime || 0;
  const beforeLevel = Math.floor(beforeEarned / XP_PER_LEVEL) + 1;

  try {
    const activityRef = await addDoc(collection(db, 'users', currentUser.uid, 'activities'), {
      type: task.type, duration: task.durationMin, points: actualEarned, desc: task.title, timestamp: new Date(),
    });

    const dayRef = doc(db, 'users', currentUser.uid, 'dailyLog', todayStr());
    const daySnap = await getDoc(dayRef);
    if (daySnap.exists()) await updateDoc(dayRef, { pointsEarned: increment(actualEarned) });
    else await setDoc(dayRef, { pointsEarned: actualEarned, gamingMinutes: 0 });

    await updateDoc(doc(db, 'users', currentUser.uid), {
      'points.total': increment(actualEarned),
      'points.earnedAllTime': increment(actualEarned),
    });

    await updateDoc(doc(db, 'users', currentUser.uid, 'plannerTasks', task.id), { done: true, activityId: activityRef.id });

    await loadProfile();
    await loadDashboard();
    await loadPlanner();

    if (actualEarned < (task.points || 0)) toast(i18next.t('logActivity.capReached'), 'error');
    else toast(i18next.t('toast.earnedPts', { pts: actualEarned }));

    pulseEl(document.querySelector('.balance-card'));
    const afterEarned = userProfile.points?.earnedAllTime || 0;
    const afterLevel = Math.floor(afterEarned / XP_PER_LEVEL) + 1;
    if (afterLevel > beforeLevel) setTimeout(() => showLevelup(afterLevel, levelTitle(afterLevel)), 350);
    else confettiBurst();
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.saveRetry'), 'error');
  }
}

// Odznaczenie = cofnięcie dokładnie tego co markPlannerTaskDone przyznał
// (revertActivityPoints z dashboard.js, współdzielone z window.deleteActivity) + usunięcie
// wpisu z activities/Historii — bez modala potwierdzenia (checkbox, nie delete).
async function unmarkPlannerTaskDone(task) {
  try {
    if (task.activityId) {
      const ref = doc(db, 'users', currentUser.uid, 'activities', task.activityId);
      const actSnap = await getDoc(ref);
      if (actSnap.exists()) {
        await deleteDoc(ref);
        await revertActivityPoints(actSnap.data());
      }
    }
    await updateDoc(doc(db, 'users', currentUser.uid, 'plannerTasks', task.id), { done: false, activityId: null });
    await loadProfile();
    await loadDashboard();
    await loadPlanner();
  } catch (e) {
    console.error(e);
    toast(i18next.t('common.deleteError'), 'error');
  }
}

