import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField,
  collection, addDoc, query, where, orderBy, limit, getDocs, increment, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { loadPurchases } from "./activities.js";
import { loadAiChat } from "./assistants.js";
import { isBugAdmin, loadBugReportPage, renderAdminBugList, renderBugAreaSelect, renderBugKeywordsSettings, renderMyBugReports } from "./bug-reports.js";
import { choreDefs, loadChoreDefs, loadChores, renderChores } from "./chores.js";
import { loadDashboard, renderAchievements, renderGoal, renderLevel } from "./dashboard.js";
import { loadHistory, loadStats, loadStatsSection } from "./history-stats.js";
import { I18N_RESOURCES } from "./i18n-resources.js";
import { loadMoneySettingsUI, moneyBalance, renderMoney } from "./money.js";
import { initOfflineWrappers, maybeShowOfflineReview, updateOfflineBanner } from "./offline.js";
import { loadPlanner } from "./planner.js";
import { applyAccountModeVisibility, initSettingsAccordion, initSettingsModule, openAccountModeStep, openOnboarding, renderActivityDefsSettings, renderChoreDefsSettings, renderGamesList, renderModuleSettings, renderNotifHours, renderNotifHoursInfo, updateNotifStatus, updateParentEmailUI, updateReportInfo } from "./settings.js";
import { loadBroadcastsPage, maybeShowWhatsNew, renderBugHubNav, renderUpdateHistory, startBroadcastListener } from "./updates.js";


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline persistence: ostatnio zsynchronizowane dane (dashboard, historia, saldo...)
// są czytelne bez internetu. Single-tab manager — apka i tak żyje jako PWA w jednej karcie.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
});
export const messaging = getMessaging(app);
export const functions = getFunctions(app);

// ── System modułów (personalizacja interfejsu) ─────────
// Jedyne źródło prawdy "co jest modułem" — ankieta pierwszego uruchomienia,
// nawigacja (boczna kolumna + dolny pasek) i lista przełączników w
// Ustawieniach wszystkie czytają TĘ samą listę zamiast mieć własne,
// osobno utrzymywane kopie. Dashboard i Ustawienia są rdzeniem (zawsze
// widoczne, nigdy nie w tej liście) — reszta stron jest widoczna TYLKO
// gdy odpowiadający jej moduł jest włączony w users/{uid}.enabledModules.
// Wyłączenie modułu NIGDY nie kasuje żadnych danych — to czysto
// kosmetyczna zmiana widoczności (żaden kod w tym systemie nie wywołuje
// deleteDoc/deleteField), więc ponowne włączenie od razu przywraca
// wszystko dokładnie tak, jak było.
export const MODULE_REGISTRY = [
  { id: 'chores', icon: 'ti-checklist', labelKey: 'nav.chores', descKey: 'modules.choresDesc',
    pages: [{ id: 'chores', icon: 'ti-checklist', labelKey: 'nav.chores', bottomNav: true }] },
  { id: 'money', icon: 'ti-wallet', labelKey: 'nav.money', descKey: 'modules.moneyDesc',
    pages: [{ id: 'money', icon: 'ti-wallet', labelKey: 'nav.money', bottomNav: true }] },
  { id: 'games', icon: 'ti-device-gamepad', labelKey: 'nav.games', descKey: 'modules.gamesDesc',
    pages: [{ id: 'games', icon: 'ti-device-gamepad', labelKey: 'nav.games', bottomNav: true }] },
  // "Statystyki XP" łączy DWIE strony nawigacji (Statystyki + Historia)
  // oraz powiązane z nimi widgety/przyciski Dashboardu (patrz
  // applyModuleVisibility) pod JEDNYM przełącznikiem — to wszystko razem
  // to "używanie systemu śledzenia XP", więc dzieli się na sekcje osobno
  // nie miałoby sensu dla użytkownika.
  { id: 'stats', icon: 'ti-chart-bar', labelKey: 'nav.stats', descKey: 'modules.statsDesc',
    pages: [
      { id: 'stats', icon: 'ti-chart-bar', labelKey: 'nav.stats', bottomNav: false },
      { id: 'history', icon: 'ti-history', labelKey: 'nav.history', bottomNav: true },
      { id: 'log-activity', bottomNav: false },
      { id: 'log-gaming', bottomNav: false },
      { id: 'generator', bottomNav: false },
    ],
    dashboardActionButtons: ['log-activity', 'log-gaming', 'generator'],
    dashboardWidgets: ['week-chart-wrap', 'recent-list', 'top-activities-list', 'achievements-grid'] },
  { id: 'planner', icon: 'ti-calendar-time', labelKey: 'nav.planner', descKey: 'modules.plannerDesc',
    pages: [{ id: 'planner', icon: 'ti-calendar-time', labelKey: 'nav.planner', bottomNav: true }] },
  // Żartobliwy moduł "na chwilę" — patrz komentarz przy page-ai-chat.
  // bottomNav:true — boczna kolumna jest CAŁKOWICIE ukryta na telefonie
  // (.sidebar{display:none} poniżej 700px), więc bottomNav:false robiłby
  // moduł niewidocznym/nieosiągalnym na mobile mimo włączenia w Ustawieniach
  // (dokładnie to zgłoszone jako błąd — moduł "nie pokazuje się" po włączeniu).
  { id: 'aichat', icon: 'ti-robot', labelKey: 'nav.aichat', descKey: 'modules.aichatDesc',
    pages: [{ id: 'ai-chat', icon: 'ti-robot', labelKey: 'nav.aichat', bottomLabelKey: 'nav.aichatShort', bottomNav: true }] },
];

// Domyślnie WSZYSTKO włączone — używane zarówno jako stan startowy ankiety
// (odznacz to, czego nie chcesz), jak i jako fallback dla `userProfile`
// sprzed tej funkcji (istniejący user bez pola enabledModules widzi
// wszystko dokładnie tak jak dotychczas, dopóki nie wypełni ankiety/nie
// zmieni czegoś w Ustawieniach).
export function isModuleEnabled(id) {
  if (!userProfile || userProfile.enabledModules === undefined) return true;
  return (userProfile.enabledModules || []).includes(id);
}

// Który moduł "posiada" daną stronę — null = strona rdzenia (Dashboard,
// Ustawienia, hub zgłoszeń błędów...), zawsze dostępna niezależnie od
// wyboru modułów.
function pageModuleId(pageId) {
  for (const m of MODULE_REGISTRY) if (m.pages.some(p => p.id === pageId)) return m.id;
  return null;
}

// ── i18n (Faza 5: Dashboard + Ustawienia) ──────────────

const LANG_DEFAULT = 'en';
export let i18nReady = i18next.init({
  lng: localStorage.getItem('lifexp-lang') || LANG_DEFAULT,
  fallbackLng: 'en',
  resources: I18N_RESOURCES,
});

export function translateStaticPage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = i18next.t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = i18next.t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = i18next.t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = i18next.t(el.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', i18next.t(el.getAttribute('data-i18n-aria')));
  });
}

window.applyLang = (lang) => {
  i18next.changeLanguage(lang, () => {
    localStorage.setItem('lifexp-lang', lang);
    document.documentElement.lang = lang;
    translateStaticPage();
    refreshDynamicI18n();
    ['en', 'pl'].forEach(l => {
      const el = document.getElementById('lang-opt-' + l);
      if (el) el.style.borderColor = l === lang ? 'var(--accent)' : 'var(--border)';
    });
  });
};

// Ponownie renderuje sekcje generowane z JS (poziom, osiągnięcia, ciekawostki),
// żeby zmiana języka odświeżyła też treści już wyrenderowane wcześniej.
function refreshDynamicI18n() {
  try {
    renderNotifHoursInfo();
    if (userProfile) {
      renderLevel((userProfile.points?.earnedAllTime) || 0);
      renderAchievements();
      renderGoal();
      updateParentEmailUI();
      updateReportInfo();
      if (document.getElementById('page-dashboard').classList.contains('active')) loadStatsSection();
      if (document.getElementById('page-settings').classList.contains('active')) updateNotifStatus();
    }
    if (typeof activityDefs !== 'undefined' && activityDefs.length) renderActivityTypeSelect();
    if (document.getElementById('page-money').classList.contains('active') && moneyBalance) renderMoney();
    if (document.getElementById('page-report-bug').classList.contains('active')) {
      if (isBugAdmin) { renderBugKeywordsSettings(); renderAdminBugList(); }
      else { renderBugAreaSelect(); renderMyBugReports(); }
    }
    if (document.getElementById('page-update-history').classList.contains('active')) renderUpdateHistory();
    if (document.getElementById('page-chores').classList.contains('active') && typeof choreDefs !== 'undefined' && choreDefs.length) renderChores();
    if (document.getElementById('page-settings').classList.contains('active')) {
      if (typeof choreDefs !== 'undefined' && choreDefs.length) renderChoreDefsSettings();
      if (typeof activityDefs !== 'undefined' && activityDefs.length) renderActivityDefsSettings();
      renderGamesList();
    }
  } catch (e) { /* dashboard jeszcze nie załadowany — nic nie robimy */ }
}

i18nReady.then(() => {
  translateStaticPage();
  const saved = localStorage.getItem('lifexp-lang') || LANG_DEFAULT;
  ['en', 'pl'].forEach(l => {
    const el = document.getElementById('lang-opt-' + l);
    if (el) el.style.borderColor = l === saved ? 'var(--accent)' : 'var(--border)';
  });
});

// WSTAW tu klucz VAPID z Firebase Console → Cloud Messaging → "Web Push certificates".
export const VAPID_KEY = 'BKEWA7plEmqtfgKPW2fa95bRvJm3dwygOWXOVFSKzHvjDJMZu8-m45-wJedy1sVoBV2bK78fC03xaAnNzDSeDok';

// Rejestracja service workera (PWA + push). Idempotentna.
export let swRegistration = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(r => { swRegistration = r; }).catch(e => console.warn('SW register failed', e));
}

export let currentUser = null;
export let userProfile = null;

export const DAILY_LIMIT_DEFAULT = 150;
export const RATE_GENERAL_ZL_DEFAULT  = 1;
export const RATE_GENERAL_PTS_DEFAULT = 10;
export const RATE_CHORES_ZL_DEFAULT   = 0.45;
export const RATE_CHORES_PTS_DEFAULT  = 1;
export function rateGeneral() {
  const zl  = userProfile?.pointsRateGeneralZl;
  const pts = userProfile?.pointsRateGeneralPts;
  return (zl && pts) ? (zl / pts) : (RATE_GENERAL_ZL_DEFAULT / RATE_GENERAL_PTS_DEFAULT);
}
export function rateChores() {
  const zl  = userProfile?.pointsRateChoresZl;
  const pts = userProfile?.pointsRateChoresPts;
  return (zl && pts) ? (zl / pts) : (RATE_CHORES_ZL_DEFAULT / RATE_CHORES_PTS_DEFAULT);
}

// Definicje aktywności — edytowalne w Ustawieniach, przechowywane w Firestore
// (users/{uid}/activityDefs). Seed zachowuje te same `id` co dawna stała lista,
// żeby historyczne wpisy `activities` (referencujące `type`) się nie zgubiły.
export let activityDefs = [];
let activityDefsSeeded = false;
export const activityDefById = (id) => activityDefs.find(a => a.id === id) || { name: id, points: 0, color: '#6c63ff', icon: 'ti-star' };

async function ensureActivityDefsSeeded() {
  if (activityDefsSeeded) return;
  const snap = await getDocs(collection(db, 'users', currentUser.uid, 'activityDefs'));
  if (!snap.empty) { activityDefsSeeded = true; return; }
  const seed = [
    { id: 'learning', name: 'Nauka (JS, Unity, C#)', points: 40, color: '#6c63ff', icon: 'ti-book',   order: 0 },
    { id: 'project',  name: 'Praca nad projektem',   points: 35, color: '#4ecca3', icon: 'ti-code',   order: 1 },
    { id: 'reading',  name: 'Czytanie / kurs',       points: 25, color: '#ffd700', icon: 'ti-book-2', order: 2 },
    { id: 'exercise', name: 'Ćwiczenia fizyczne',    points: 30, color: '#ff6b6b', icon: 'ti-run',    order: 3 },
    { id: 'school',   name: 'Zadania szkolne',       points: 20, color: '#8a8fa8', icon: 'ti-school', order: 4 },
  ];
  for (const a of seed) {
    const { id, ...data } = a;
    await setDoc(doc(db, 'users', currentUser.uid, 'activityDefs', id), data);
  }
  activityDefsSeeded = true;
}

export async function loadActivityDefs() {
  await ensureActivityDefsSeeded();
  const q = query(collection(db, 'users', currentUser.uid, 'activityDefs'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  activityDefs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderActivityTypeSelect();
}

function renderActivityTypeSelect() {
  const sel = document.getElementById('act-type');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">${i18next.t('logActivity.choose')}</option>` + activityDefs.map(a =>
    `<option value="${a.id}" data-pts="${a.points}">${escapeHtml(a.name)} — ${a.points} ${i18next.t('logActivity.pkt')}/h</option>`
  ).join('');
  if (current) sel.value = current;
}

// ── Ekran ładowania ───────────────────────────────────
// Sam overlay jest w statycznym HTML app.html (widoczny od pierwszego
// malowania) — tutaj tylko go chowamy i pokazujemy. Musi zniknąć w KAŻDEJ
// ścieżce wyjścia z bootstrapu poniżej, łącznie z błędami i przekierowaniami,
// inaczej użytkownik zostaje na wiecznym ekranie ładowania.
let bootOverlayHideTimer = null;

function hideBootOverlay() {
  const el = document.getElementById('boot-overlay');
  if (!el || el.hidden) return;
  clearTimeout(bootOverlayHideTimer);
  if (prefersReduced()) { el.hidden = true; return; }
  el.classList.add('hiding');
  bootOverlayHideTimer = setTimeout(() => {
    el.hidden = true;
    el.classList.remove('hiding');
  }, 200);
}

// Ponowne pokazanie po modalu wymagającym interakcji (wybór trybu konta,
// ankieta) — clearTimeout ubija fade-out w locie, gdyby jeszcze trwał.
function showBootOverlay() {
  const el = document.getElementById('boot-overlay');
  if (!el) return;
  clearTimeout(bootOverlayHideTimer);
  el.classList.remove('hiding');
  el.hidden = false;
}

// ── Auth ──────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) { hideBootOverlay(); window.location.href = 'index.html'; return; }
  currentUser = user;

  try {
    await loadProfile();
  } catch (e) {
    console.error('loadProfile failed:', e);
    document.getElementById('user-name').textContent = i18next.t('errors.connectionShort');
    toast(i18next.t('errors.connection'), 'error');
    hideBootOverlay();
    return;
  }

  // Email verification gate
  if (!userProfile.emailVerified) {
    if (currentUser.emailVerified) {
      await updateDoc(doc(db, 'users', currentUser.uid), { emailVerified: true });
      userProfile.emailVerified = true;
    } else {
      hideBootOverlay();
      window.location.href = 'verify.html';
      return;
    }
  }

  // Wybór trybu konta (solo/nadzorowane) — osobna brama od ankiety modułów
  // poniżej, więc odpala się raz dla KAŻDEGO konta (też istniejącego sprzed
  // tej funkcji), niezależnie od stanu enabledModules.
  if (userProfile.accountMode === undefined) {
    hideBootOverlay();
    await openAccountModeStep();
    showBootOverlay();
  }
  applyAccountModeVisibility();

  // Ankieta personalizacji — tylko raz, przed pierwszym renderem Dashboardu
  // z prawdziwym zestawem modułów (patrz komentarz przy openOnboarding w settings.js).
  if (userProfile.enabledModules === undefined) {
    hideBootOverlay();
    await openOnboarding();
    showBootOverlay();
  }
  renderModuleNav();
  applyModuleVisibility();

  try {
    await loadActivityDefs();
  } catch (e) {
    console.error('loadActivityDefs failed:', e);
  }

  try {
    await loadDashboard();
  } catch (e) {
    console.error('loadDashboard failed:', e);
    toast(i18next.t('errors.loadFailed'), 'error');
  }

  // Bootstrap skończony (również gdy loadActivityDefs/loadDashboard rzuciły —
  // oba catch idą dalej, bez return) — zdejmij ekran ładowania, zanim pokażą
  // się modale "Co nowego?" i przegląd szkiców offline.
  hideBootOverlay();

  // Po załadowaniu apki — pokaż „Co nowego?" raz na nową wersję, potem odpal
  // NA ŻYWO nasłuch globalnych wiadomości (nie jednorazowy check — nowa wiadomość
  // wysłana podczas gdy apka jest otwarta ma się pokazać od razu, bez odświeżenia).
  maybeShowWhatsNew();
  startBroadcastListener();

  // Tryb offline: pokaż baner jeśli nie ma internetu, a jeśli jest — zaproponuj
  // przegląd szkiców zrobionych offline (kolejka w localStorage).
  updateOfflineBanner();
  maybeShowOfflineReview();
});

export async function loadProfile() {
  const ref = doc(db, 'users', currentUser.uid);
  let snap = await getDoc(ref);

  // Self-heal: the profile doc may be missing if a Google login redirected
  // here before index.html finished writing it. Create it from the auth
  // user so the UI never hangs on "Ładowanie...".
  if (!snap.exists()) {
    await setDoc(ref, {
      name: currentUser.displayName || 'Użytkownik',
      email: currentUser.email || '',
      parentEmail: '',
      createdAt: new Date().toISOString(),
      points: { total: 0, earnedAllTime: 0, spentAllTime: 0 },
      emailVerified: currentUser.emailVerified === true
    });
    snap = await getDoc(ref);
  }

  userProfile = snap.data() || {};
  // Guarantee the points map exists so stats never read undefined.
  userProfile.points = Object.assign(
    { total: 0, earnedAllTime: 0, spentAllTime: 0 },
    userProfile.points || {}
  );

  const initials = (userProfile.name || 'U')[0].toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = userProfile.name || 'Użytkownik';

  // Prefill settings
  document.getElementById('set-name').value = userProfile.name || '';
  document.getElementById('set-daily-limit').value = userProfile.dailyLimit || DAILY_LIMIT_DEFAULT;
  updateParentEmailUI();
  updateReportInfo();

  document.getElementById('econ-general-zl').value  = userProfile.pointsRateGeneralZl  || RATE_GENERAL_ZL_DEFAULT;
  document.getElementById('econ-general-pts').value = userProfile.pointsRateGeneralPts || RATE_GENERAL_PTS_DEFAULT;
  document.getElementById('econ-chore-zl').value    = userProfile.pointsRateChoresZl   || RATE_CHORES_ZL_DEFAULT;
  document.getElementById('econ-chore-pts').value   = userProfile.pointsRateChoresPts  || RATE_CHORES_PTS_DEFAULT;

  renderGamesList();
}

// ── Navigation ────────────────────────────────────────
// Buduje kolumnę boczną + dolny pasek WYŁĄCZNIE z MODULE_REGISTRY —
// wyłączony moduł nigdy nie trafia do DOM-u (nie jest ukrywany po fakcie
// przez CSS). `pages[].icon`/`labelKey` obecne = strona ma wpis w
// nawigacji bocznej; dodatkowo `bottomNav: true` = ma też wpis w dolnym
// pasku (część stron, np. log-activity/log-gaming/generator, celowo nie
// ma ani jednego — są osiągalne tylko z przycisków na Dashboardzie,
// dokładnie jak przed tym systemem). Wywoływana raz po wczytaniu profilu
// i ponownie po każdym przełączeniu modułu w Ustawieniach.
export function renderModuleNav() {
  const sideEl = document.getElementById('sidebar-nav-modules');
  const bnEl = document.getElementById('bn-nav-modules');
  if (!sideEl || !bnEl) return;
  let sideHtml = '', bnHtml = '';
  for (const m of MODULE_REGISTRY) {
    if (!isModuleEnabled(m.id)) continue;
    for (const p of m.pages) {
      if (!p.icon || !p.labelKey) continue;
      sideHtml += `<div class="nav-item" data-page="${p.id}" onclick="showPage('${p.id}')">` +
        `<span class="icon"><i class="ti ${p.icon}"></i></span> <span data-i18n="${p.labelKey}"></span></div>`;
      if (p.bottomNav) {
        // bottomLabelKey opcjonalnie skraca etykietę TYLKO w dolnym pasku
        // (miejsca tam mniej niż w bocznej kolumnie) — sidebar zawsze
        // pokazuje pełną labelKey.
        bnHtml += `<div class="bn-item" data-page="${p.id}" onclick="showPage('${p.id}')">` +
          `<span class="bn-icon"><i class="ti ${p.icon}"></i></span><span data-i18n="${p.bottomLabelKey || p.labelKey}"></span></div>`;
      }
    }
  }
  sideEl.innerHTML = sideHtml;
  bnEl.innerHTML = bnHtml;
  translateStaticPage();
}

// Chowa/pokazuje część Dashboardu powiązaną z modułem "stats" (wykres
// tygodnia/ostatnie aktywności/TOP aktywności/osiągnięcia + cały wiersz
// przycisków Zaloguj aktywność/granie/"Co teraz?", bo WSZYSTKIE trzy
// należą do tego modułu — stąd chowanie całego .action-row zamiast
// przycisku po przycisku, żeby nie zostawić pustego wiersza z marginesem).
// Ten sam mechanizm co #goal-card/#facts-card (display:none), tylko
// sterowany wyborem modułów zamiast własnego stanu widgetu. Widget Celów
// (#goal-card) celowo NIE jest tu dotykany — zostaje jak dziś, poza
// systemem modułów.
export function applyModuleVisibility() {
  const statsOn = isModuleEnabled('stats');
  const statsMod = MODULE_REGISTRY.find(m => m.id === 'stats');
  (statsMod.dashboardWidgets || []).forEach((id) => {
    const el = document.getElementById(id);
    const card = el && el.closest('.card');
    if (card) card.style.display = statsOn ? '' : 'none';
  });
  const actionRow = document.querySelector('#page-dashboard .action-row');
  if (actionRow) actionRow.style.display = statsOn ? '' : 'none';
}

window.showPage = (id) => {
  // Bramka: strona należąca do wyłączonego modułu nigdy się nie otwiera —
  // chroni przed martwym uchwytem zdarzenia, cofnięciem w przeglądarce
  // albo jakimkolwiek innym odwołaniem sprzed wyłączenia modułu.
  const modId = pageModuleId(id);
  if (modId && !isModuleEnabled(modId)) id = 'dashboard';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-page="${id}"]`);
  if (navItem) navItem.classList.add('active');

  // Bottom nav active state
  document.querySelectorAll('.bn-item').forEach(n => n.classList.remove('active'));
  const bnItem = document.querySelector(`.bn-item[data-page="${id}"]`);
  if (bnItem) bnItem.classList.add('active');

  if (id === 'stats') loadStats();
  if (id === 'shop') loadPurchases();
  if (id === 'money') loadMoney();
  if (id === 'report-bug') { renderBugHubNav('report'); loadBugReportPage(); }
  if (id === 'broadcasts') { renderBugHubNav('broadcast'); loadBroadcastsPage(); }
  if (id === 'update-history') { renderBugHubNav('history'); renderUpdateHistory(); }
  if (id === 'log-gaming') { updateGameSelect(); loadGamingHistory(); }
  if (id === 'history') loadHistory();
  if (id === 'chores') loadChores();
  if (id === 'planner') loadPlanner();
  if (id === 'ai-chat') loadAiChat();
  if (id === 'games' && window.LifeXPGames) LifeXPGames.showMenu();
  if (id === 'settings') {
    renderModuleSettings();
    applyAccountModeVisibility();
    loadChoreDefs().then(renderChoreDefsSettings);
    loadActivityDefs().then(renderActivityDefsSettings);
    loadMoneySettingsUI();
    updateNotifStatus();
    const rToggle = document.getElementById('auto-report-toggle');
    if (rToggle) rToggle.checked = userProfile?.autoReport === true;
    updateReportInfo();
    renderNotifHours();
    initSettingsAccordion();
  }
};

// ── Toast ─────────────────────────────────────────────
export function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => el.className = '', 3000);
}

// ── Helpers ───────────────────────────────────────────
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function formatPLN(pts) {
  return (pts * rateGeneral()).toFixed(2).replace('.', ',') + ' zł';
}

export function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Animation helpers ─────────────────────────────────
export const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Count-up: animates an element's number from its previous value to `to`.
export function animateCount(el, to, format) {
  const fmt = format || (v => String(Math.round(v)));
  const from = Number(el.dataset.val || 0);
  el.dataset.val = to;
  if (prefersReduced() || from === to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const dur = 600;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

// Lightweight DOM confetti burst from the upper-center of the viewport.
export function confettiBurst() {
  if (prefersReduced()) return;
  const colors = ['#6c63ff', '#4ecca3', '#ffd700', '#ff6b6b'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 140) + 'px';
    p.style.top = (window.innerHeight * 0.32) + 'px';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', ((Math.random() - 0.5) * 380) + 'px');
    p.style.setProperty('--dy', (220 + Math.random() * 260) + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    p.style.setProperty('--dur', (1.3 + Math.random() * 0.5) + 's');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}

export function pulseEl(el) { if (!el || prefersReduced()) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }

window.closeLevelup = () => document.getElementById('levelup-modal').classList.remove('open');
export function showLevelup(level, title) {
  document.getElementById('levelup-text').textContent = `${i18next.t('dashboard.level', { n: level })} — ${title}`;
  document.getElementById('levelup-modal').classList.add('open');
  confettiBurst();
}

export async function getTodayPts() {
  const snap = await getDoc(doc(db, 'users', currentUser.uid, 'dailyLog', todayStr()));
  return snap.exists() ? (snap.data().pointsEarned || 0) : 0;
}

export async function getDailyLimit() {
  return userProfile?.dailyLimit || DAILY_LIMIT_DEFAULT;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function dateISOLocal(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const monthKeyOf = (iso) => iso.slice(0, 7);
export function monthKeys() {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const p = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
  return { cur, prev };
}
// Uniwersalny modal potwierdzenia → Promise<boolean> (zamiennik window.confirm)
export function confirmDialog(message, okLabel) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-text').textContent = message;
    const ok = document.getElementById('confirm-modal-ok');
    const cancel = document.getElementById('confirm-modal-cancel');
    ok.textContent = okLabel || i18next.t('common.delete');
    cancel.textContent = i18next.t('common.cancel');
    modal.classList.add('open');
    const finish = (val) => { modal.classList.remove('open'); ok.onclick = null; cancel.onclick = null; resolve(val); };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
  });
}
// games.js is a separate classic-script IIFE (not this module) and calls
// confirmDialog() directly (e.g. Redstone's "Clear world") — must be on
// window, same as the reverse export window.LifeXPGames.
window.confirmDialog = confirmDialog;
export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
export const fmtMoney = (v) => round2(v).toFixed(2).replace('.', ',') + ' zł';
export function monthLabelLocale(mk) {
  const [y, m] = mk.split('-').map(Number);
  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  const s = new Date(y, m - 1, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

initSettingsModule();
initOfflineWrappers();
