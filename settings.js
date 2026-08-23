import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { choreDefs, loadChoreDefs, renderChores } from "./chores.js";
import { DAILY_LIMIT_DEFAULT, MODULE_REGISTRY, RATE_CHORES_PTS_DEFAULT, RATE_CHORES_ZL_DEFAULT, RATE_GENERAL_PTS_DEFAULT, RATE_GENERAL_ZL_DEFAULT, VAPID_KEY, activityDefs, applyModuleVisibility, auth, confirmDialog, currentUser, db, escapeHtml, i18nReady, isModuleEnabled, loadActivityDefs, loadProfile, messaging, renderModuleNav, swRegistration, toast, translateStaticPage, userProfile } from "./core.js";

// ── Wybór trybu konta (solo/nadzorowane, pierwsze uruchomienie) ──
// Osobna, niezależna brama od ankiety modułów niżej (patrz boot sequence
// w onAuthStateChanged) — dzięki temu istniejące konta sprzed tej funkcji
// (które mają już enabledModules ustawione z poprzedniego wdrożenia)
// i tak dostają to pytanie raz, bez specjalnego rozróżniania "nowy vs
// istniejący" user. Ten sam wzorzec Promise + resolve co openOnboarding.
let accountModePicked = null;
let accountModeResolve = null;

window.pickAccountMode = (mode) => {
  accountModePicked = mode;
  ['solo', 'supervised'].forEach((m) => {
    const el = document.getElementById('account-mode-opt-' + m);
    if (el) el.classList.toggle('selected', m === mode);
  });
  document.getElementById('account-mode-continue').disabled = false;
};

export function openAccountModeStep() {
  return new Promise((resolve) => {
    accountModeResolve = resolve;
    accountModePicked = null;
    ['solo', 'supervised'].forEach((m) => document.getElementById('account-mode-opt-' + m)?.classList.remove('selected'));
    document.getElementById('account-mode-continue').disabled = true;
    document.getElementById('account-mode-modal').classList.add('open');
  });
}

window.saveAccountModeStep = async () => {
  if (!accountModePicked) return;
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { accountMode: accountModePicked });
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.saveRetry'), 'error');
    return; // zostaw modal otwarty — spróbuj ponownie
  }
  userProfile.accountMode = accountModePicked;
  document.getElementById('account-mode-modal').classList.remove('open');
  applyAccountModeVisibility();
  if (accountModeResolve) { accountModeResolve(); accountModeResolve = null; }
};

// Chowa sekcje związane z rodzicem w Ustawieniach gdy tryb to solo — ten
// sam mechanizm co applyModuleVisibility, tylko sterowany accountMode
// zamiast enabledModules. Limit dzienny (settings-cat-dashboard) celowo
// NIE jest tu dotykany — to uniwersalne narzędzie samokontroli, nie
// funkcja nadzoru rodzica (patrz plan/decyzja usera).
export function applyAccountModeVisibility() {
  const solo = userProfile?.accountMode === 'solo';
  const parentBlock = document.getElementById('parent-email-block');
  if (parentBlock) parentBlock.style.display = solo ? 'none' : '';
  const reportCard = document.getElementById('weekly-report-card');
  if (reportCard) reportCard.style.display = solo ? 'none' : '';
  renderAccountModeSegmented();
}

function renderAccountModeSegmented() {
  document.querySelectorAll('#account-mode-tabs .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-mode') === userProfile?.accountMode);
  });
}

// Zmiana trybu w dowolnej chwili z Ustawień. Solo → Nadzorowane nie
// wymaga potwierdzenia (rozszerzenie dostępu, nic nie znika). Nadzorowane
// → Solo NAPRAWDĘ zrywa połączenie z rodzicem (czyści parentEmail i pola
// weryfikacji, nie tylko chowa UI) — solo ma znaczyć solo, żaden ukryty
// rodzic nie widzi już danych przez parent.html (patrz firestore.rules:
// dostęp rodzica jest w 100% zależny od pola parentEmail).
window.setAccountMode = async (mode) => {
  if (mode === userProfile.accountMode) return;
  try {
    if (mode === 'solo' && userProfile.parentEmail) {
      if (!await confirmDialog(i18next.t('accountMode.confirmSoloSwitch'))) return;
      await updateDoc(doc(db, 'users', currentUser.uid), {
        accountMode: 'solo', autoReport: false,
        parentEmail: '', parentEmailVerifiedAt: deleteField(),
        pendingParentEmail: deleteField(), parentEmailCode: deleteField(), parentEmailCodeExpiry: deleteField(),
      });
      userProfile.parentEmail = '';
      userProfile.parentEmailVerifiedAt = undefined;
      userProfile.autoReport = false;
      updateParentEmailUI();
      const reportToggle = document.getElementById('auto-report-toggle');
      if (reportToggle) reportToggle.checked = false;
    } else {
      await updateDoc(doc(db, 'users', currentUser.uid), { accountMode: mode });
    }
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.saveRetry'), 'error');
    return;
  }
  userProfile.accountMode = mode;
  applyAccountModeVisibility();
  toast(i18next.t('accountMode.updated'));
};

// ── Ankieta personalizacji (pierwsze uruchomienie) ─────
// Pokazuje się TYLKO gdy userProfile.enabledModules jeszcze nie istnieje
// (nowe konto ALBO istniejące konto sprzed wprowadzenia tego systemu —
// nierozróżnialne, stąd wszystko domyślnie zaznaczone: kliknięcie "Zapisz"
// bez żadnych zmian nie chowa nic, co user już widział). Blokująca —
// reszta sekwencji startowej (loadActivityDefs/loadDashboard) czeka na
// `await openOnboarding()`, żeby Dashboard od razu renderował się z
// właściwym zestawem widgetów zamiast migotać.
let onboardingResolve = null;
export function openOnboarding() {
  return new Promise((resolve) => {
    onboardingResolve = resolve;
    const list = document.getElementById('onboarding-list');
    list.innerHTML = MODULE_REGISTRY.map(m => `
      <label class="onboarding-row">
        <input type="checkbox" id="onb-${m.id}" checked>
        <span class="icon"><i class="ti ${m.icon}"></i></span>
        <span class="onb-text">
          <span class="onb-name" data-i18n="${m.labelKey}"></span><br>
          <span class="text2 onb-desc" data-i18n="${m.descKey}"></span>
        </span>
      </label>`).join('');
    translateStaticPage();
    document.getElementById('onboarding-modal').classList.add('open');
  });
}

window.saveOnboarding = async () => {
  const enabledModules = MODULE_REGISTRY.filter(m => document.getElementById('onb-' + m.id)?.checked).map(m => m.id);
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { enabledModules, onboardingDone: true });
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.saveRetry'), 'error');
    return; // zostaw modal otwarty — spróbuj ponownie zamiast utknąć w niespójnym stanie
  }
  userProfile.enabledModules = enabledModules;
  userProfile.onboardingDone = true;
  document.getElementById('onboarding-modal').classList.remove('open');
  renderModuleNav();
  applyModuleVisibility();
  if (onboardingResolve) { onboardingResolve(); onboardingResolve = null; }
};

// ── Ustawienia: akordeon kategorii (zwinięte domyślnie — długa lista kart
// była trudna do przejrzenia i winowajcą spadków FPS przy scrollu na telefonie).
// Stan zwinięcia zapamiętywany per-przeglądarka; przy pierwszej wizycie
// rozwijamy tylko kategorię wymagającą uwagi (np. brak zweryfikowanego
// emaila rodzica), reszta zostaje zwinięta.
const SETTINGS_COLLAPSE_KEY = 'lifexp-settings-collapsed';
function getSettingsCollapseState() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_COLLAPSE_KEY)) || {}; }
  catch { return {}; }
}
window.toggleSettingsCat = (catId) => {
  const el = document.getElementById('settings-cat-' + catId);
  if (!el) return;
  const collapsed = el.classList.toggle('collapsed');
  const state = getSettingsCollapseState();
  state[catId] = collapsed;
  localStorage.setItem(SETTINGS_COLLAPSE_KEY, JSON.stringify(state));
};
// Lista przełączników modułów w Ustawieniach — ten sam MODULE_REGISTRY co
// ankieta i nawigacja, więc dodanie nowego modułu do rejestru automatycznie
// pojawia się i tu, bez osobnej listy do utrzymania.
export function renderModuleSettings() {
  const el = document.getElementById('settings-modules-list');
  if (!el) return;
  el.innerHTML = MODULE_REGISTRY.map(m => `
    <div class="module-toggle-row">
      <span class="icon"><i class="ti ${m.icon}"></i></span>
      <span class="module-toggle-text">
        <span class="module-toggle-name" data-i18n="${m.labelKey}"></span><br>
        <span class="text2 module-toggle-desc" data-i18n="${m.descKey}"></span>
      </span>
      <label class="toggle">
        <input type="checkbox" ${isModuleEnabled(m.id) ? 'checked' : ''} onchange="toggleModule('${m.id}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>`).join('');
  translateStaticPage();
}

// Przełączenie modułu w dowolnej chwili — natychmiastowe, bez modala
// potwierdzenia (odwracalne, żadne dane nigdy nie są kasowane). Aktualizuje
// nawigację i widoczność widgetów Dashboardu od razu, bez przeładowania.
window.toggleModule = async (id, checked) => {
  const enabled = new Set(userProfile.enabledModules || []);
  if (checked) enabled.add(id); else enabled.delete(id);
  const enabledModules = [...enabled];
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { enabledModules });
  } catch (e) {
    console.error(e);
    toast(i18next.t('errors.saveRetry'), 'error');
    renderModuleSettings(); // przywróć checkbox do stanu sprzed nieudanej próby
    return;
  }
  userProfile.enabledModules = enabledModules;
  renderModuleNav();
  applyModuleVisibility();
  toast(i18next.t('modules.toggled'));
};

export function initSettingsAccordion() {
  const state = getSettingsCollapseState();
  const firstVisit = Object.keys(state).length === 0;
  const parentEmailNeedsAttention = !(userProfile?.parentEmail && userProfile?.parentEmailVerifiedAt);
  document.querySelectorAll('.settings-category').forEach(cat => {
    const id = cat.id.replace('settings-cat-', '');
    let collapsed;
    if (id in state) collapsed = state[id];
    else if (firstVisit && id === 'account' && userProfile?.accountMode === 'supervised' && parentEmailNeedsAttention) collapsed = false;
    else collapsed = true;
    cat.classList.toggle('collapsed', collapsed);
  });
}

window.logout = async () => {
  await signOut(auth);
  window.location.href = 'index.html';
};

// ── Settings ──────────────────────────────────────────
export async function saveSettings() {
  const name = document.getElementById('set-name').value.trim();
  const dailyLimit = parseInt(document.getElementById('set-daily-limit').value) || DAILY_LIMIT_DEFAULT;
  await updateDoc(doc(db, 'users', currentUser.uid), { name, dailyLimit });
  await loadProfile();
  toast(i18next.t('settings.saved'));
}
window.saveSettings = saveSettings;

export async function saveEconomyGeneral() {
  const genZl  = parseFloat(document.getElementById('econ-general-zl').value)  || RATE_GENERAL_ZL_DEFAULT;
  const genPts = parseFloat(document.getElementById('econ-general-pts').value) || RATE_GENERAL_PTS_DEFAULT;
  if (genPts <= 0) return toast(i18next.t('common.pointsMustBePositive'), 'error');

  await updateDoc(doc(db, 'users', currentUser.uid), {
    pointsRateGeneralZl: genZl, pointsRateGeneralPts: genPts,
  });
  await loadProfile();
  toast(i18next.t('settings.economyGeneralSaved'));
}
window.saveEconomyGeneral = saveEconomyGeneral;

export async function saveEconomyChores() {
  const choZl  = parseFloat(document.getElementById('econ-chore-zl').value)  || RATE_CHORES_ZL_DEFAULT;
  const choPts = parseFloat(document.getElementById('econ-chore-pts').value) || RATE_CHORES_PTS_DEFAULT;
  if (choPts <= 0) return toast(i18next.t('common.pointsMustBePositive'), 'error');

  await updateDoc(doc(db, 'users', currentUser.uid), {
    pointsRateChoresZl: choZl, pointsRateChoresPts: choPts,
  });
  await loadProfile();
  if (document.getElementById('page-chores').classList.contains('active')) renderChores();
  toast(i18next.t('settings.economyChoresSaved'));
}
window.saveEconomyChores = saveEconomyChores;

export function renderChoreDefsSettings() {
  const el = document.getElementById('chore-defs-list');
  if (!el) return;
  if (choreDefs.length === 0) { el.innerHTML = `<p class="text2">${i18next.t('chores.noDefs')}</p>`; return; }
  el.innerHTML = choreDefs.map(c => `
    <div class="preset-item" style="margin-bottom:6px">
      <span class="preset-info">${c.emoji ? c.emoji + ' ' : ''}${escapeHtml(c.name)} — ${c.points} ${i18next.t('logActivity.pkt')}${c.oneTime ? ' · ' + i18next.t('chores.oneTimeTag') : ''}</span>
      <button class="btn-secondary" onclick="deleteChoreDef('${c.id}')" style="padding:4px 10px;font-size:12px">${i18next.t('shop.delete')}</button>
    </div>`).join('');
}

export async function addChoreDef() {
  const name = document.getElementById('cd-name').value.trim();
  const desc = document.getElementById('cd-desc').value.trim();
  const points = parseInt(document.getElementById('cd-points').value);
  const emoji = document.getElementById('cd-emoji').value.trim();
  const oneTime = document.getElementById('cd-onetime').checked;
  if (!name) return toast(i18next.t('common.enterName'), 'error');
  if (!points || points <= 0) return toast(i18next.t('common.enterPoints'), 'error');

  const order = choreDefs.length ? Math.max(...choreDefs.map(c => c.order || 0)) + 1 : 0;
  await addDoc(collection(db, 'users', currentUser.uid, 'choreDefs'), { name, desc, emoji, points, oneTime, order });
  await loadChoreDefs();
  renderChoreDefsSettings();

  document.getElementById('cd-name').value = '';
  document.getElementById('cd-desc').value = '';
  document.getElementById('cd-points').value = '';
  document.getElementById('cd-emoji').value = '';
  document.getElementById('cd-onetime').checked = false;
  renderChoreEmojiPicker();
  toast(i18next.t('chores.added', { name, interpolation: { escapeValue: false } }));
}
window.addChoreDef = addChoreDef;

// ── Emoji picker dla obowiązków (bez wolnego wpisywania tekstu) ──
const CHORE_EMOJI_PRESETS = ['🧹','🪣','🧽','🗑️','🍽️','🛏️','🧺','🚿','🪴','🔧','📦','🐶'];
function renderChoreEmojiPicker() {
  const el = document.getElementById('cd-emoji-picker');
  if (!el) return;
  const current = document.getElementById('cd-emoji').value;
  el.innerHTML = CHORE_EMOJI_PRESETS.map(e => `
    <button type="button" class="btn-secondary" data-emoji="${e}" onclick="pickChoreEmoji('${e}')"
      style="padding:6px 10px;font-size:16px;border-color:${e === current ? 'var(--accent)' : 'var(--border)'}">${e}</button>
  `).join('');
}
window.pickChoreEmoji = (emoji) => {
  const hidden = document.getElementById('cd-emoji');
  hidden.value = (hidden.value === emoji) ? '' : emoji;
  document.querySelectorAll('#cd-emoji-picker button').forEach(b => {
    b.style.borderColor = (b.dataset.emoji === hidden.value) ? 'var(--accent)' : 'var(--border)';
  });
};
renderChoreEmojiPicker();

window.deleteChoreDef = async (id) => {
  if (!await confirmDialog(i18next.t('confirm.deleteChoreDef'))) return;
  await deleteDoc(doc(db, 'users', currentUser.uid, 'choreDefs', id));
  await loadChoreDefs();
  renderChoreDefsSettings();
  toast(i18next.t('chores.defDeleted'));
};

// ── Zarządzanie aktywnościami w Ustawieniach ───────────
export function renderActivityDefsSettings() {
  const el = document.getElementById('activity-defs-list');
  if (!el) return;
  if (activityDefs.length === 0) { el.innerHTML = `<p class="text2">${i18next.t('settings.noActivityDefs')}</p>`; return; }
  el.innerHTML = activityDefs.map(a => `
    <div class="preset-item" style="margin-bottom:6px">
      <span class="preset-info"><i class="ti ${a.icon}" style="color:${a.color};margin-right:6px"></i>${escapeHtml(a.name)} — ${a.points} ${i18next.t('settings.ptsPerHourShort')}</span>
      <button class="btn-secondary" onclick="deleteActivityDef('${a.id}')" style="padding:4px 10px;font-size:12px">${i18next.t('shop.delete')}</button>
    </div>`).join('');
}

export async function addActivityDef() {
  const name = document.getElementById('ad-name').value.trim();
  const points = parseInt(document.getElementById('ad-points').value);
  const icon = document.getElementById('ad-icon').value || ACTIVITY_ICON_PRESETS[0];
  const color = document.getElementById('ad-color').value || ACTIVITY_COLOR_PRESETS[0];
  if (!name) return toast(i18next.t('common.enterName'), 'error');
  if (!points || points <= 0) return toast(i18next.t('common.enterPoints'), 'error');

  const order = activityDefs.length ? Math.max(...activityDefs.map(a => a.order || 0)) + 1 : 0;
  await addDoc(collection(db, 'users', currentUser.uid, 'activityDefs'), { name, points, icon, color, order });
  await loadActivityDefs();
  renderActivityDefsSettings();

  document.getElementById('ad-name').value = '';
  document.getElementById('ad-points').value = '';
  document.getElementById('ad-icon').value = '';
  document.getElementById('ad-color').value = '';
  renderActivityIconPicker();
  renderActivityColorPicker();
  toast(i18next.t('settings.activityAdded', { name, interpolation: { escapeValue: false } }));
}
window.addActivityDef = addActivityDef;

window.deleteActivityDef = async (id) => {
  if (!await confirmDialog(i18next.t('confirm.deleteActivityDef'))) return;
  await deleteDoc(doc(db, 'users', currentUser.uid, 'activityDefs', id));
  await loadActivityDefs();
  renderActivityDefsSettings();
  toast(i18next.t('settings.activityDeleted'));
};

// ── Pickery ikony i koloru dla aktywności (bez wolnego wpisywania) ──
const ACTIVITY_ICON_PRESETS = ['ti-book','ti-code','ti-run','ti-school','ti-book-2','ti-music','ti-palette','ti-language','ti-bike','ti-dumbbell','ti-pencil','ti-brain'];
const ACTIVITY_COLOR_PRESETS = ['#6c63ff','#4ecca3','#ffd700','#ff6b6b','#8a8fa8','#ff9f43','#00d2d3','#feca57'];

function renderActivityIconPicker() {
  const el = document.getElementById('ad-icon-picker');
  if (!el) return;
  const current = document.getElementById('ad-icon').value;
  el.innerHTML = ACTIVITY_ICON_PRESETS.map(ic => `
    <button type="button" class="btn-secondary" data-icon="${ic}" onclick="pickActivityIcon('${ic}')"
      style="padding:6px 10px;font-size:16px;border-color:${ic === current ? 'var(--accent)' : 'var(--border)'}"><i class="ti ${ic}"></i></button>
  `).join('');
}
window.pickActivityIcon = (icon) => {
  const hidden = document.getElementById('ad-icon');
  hidden.value = (hidden.value === icon) ? '' : icon;
  document.querySelectorAll('#ad-icon-picker button').forEach(b => {
    b.style.borderColor = (b.dataset.icon === hidden.value) ? 'var(--accent)' : 'var(--border)';
  });
};
renderActivityIconPicker();

function renderActivityColorPicker() {
  const el = document.getElementById('ad-color-picker');
  if (!el) return;
  const current = document.getElementById('ad-color').value;
  el.innerHTML = ACTIVITY_COLOR_PRESETS.map(c => `
    <button type="button" data-color="${c}" onclick="pickActivityColor('${c}')"
      style="width:28px;height:28px;border-radius:8px;background:${c};border:2px solid ${c === current ? 'var(--accent)' : 'var(--border)'};padding:0"></button>
  `).join('');
}
window.pickActivityColor = (color) => {
  const hidden = document.getElementById('ad-color');
  hidden.value = (hidden.value === color) ? '' : color;
  document.querySelectorAll('#ad-color-picker button').forEach(b => {
    b.style.borderColor = (b.dataset.color === hidden.value) ? 'var(--accent)' : 'var(--border)';
  });
};
renderActivityColorPicker();

export function updateParentEmailUI() {
  const verified   = userProfile?.parentEmail;
  const verifiedAt = userProfile?.parentEmailVerifiedAt;
  const pending    = userProfile?.pendingParentEmail;

  const verifiedRow = document.getElementById('parent-email-verified-row');
  const inputRow    = document.getElementById('parent-email-input-row');
  const pendingRow  = document.getElementById('parent-email-pending-row');
  if (!verifiedRow) return;

  if (pending) {
    verifiedRow.style.display = 'none';
    inputRow.style.display    = 'none';
    pendingRow.style.display  = 'block';
    document.getElementById('parent-email-pending-addr').textContent = pending;
  } else if (verified && verifiedAt) {
    verifiedRow.style.display = 'flex';
    inputRow.style.display    = 'none';
    pendingRow.style.display  = 'none';
    document.getElementById('parent-email-verified-addr').textContent = verified;
  } else if (verified && !verifiedAt) {
    // Email zapisany zanim istniała weryfikacja kodem — nie ufamy mu, wymuszamy ponowną weryfikację.
    verifiedRow.style.display = 'none';
    pendingRow.style.display  = 'none';
    inputRow.style.display    = 'block';
    document.getElementById('set-parent-email').value = verified;
    document.getElementById('parent-email-reverify-warn').style.display = 'block';
  } else {
    verifiedRow.style.display = 'none';
    inputRow.style.display    = 'block';
    pendingRow.style.display  = 'none';
    document.getElementById('parent-email-reverify-warn').style.display = 'none';
  }
}

// Wydzielone z showPage('settings') — musi się odświeżać zaraz po każdym loadProfile(),
// nie tylko przy wejściu na stronę Ustawień, bo inaczej po weryfikacji maila (która woła
// loadProfile, ale nie showPage) ten tekst zostawał z poprzedniego (błędnego) stanu.
export function updateReportInfo() {
  const info = document.getElementById('report-email-info');
  if (!info) return;
  const pe = userProfile?.parentEmail;
  const verifiedAt = userProfile?.parentEmailVerifiedAt;
  info.textContent = (pe && verifiedAt)
    ? i18next.t('settings.reportSentTo', { email: pe })
    : i18next.t('settings.reportNoEmail');
  info.style.color = (pe && verifiedAt) ? '' : 'var(--warn)';
}

window.sendParentEmailVerification = async () => {
  const email = document.getElementById('set-parent-email').value.trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    toast(i18next.t('settings.enterValidEmail'), 'error'); return;
  }
  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 10 * 60 * 1000;
  await updateDoc(doc(db, 'users', currentUser.uid), {
    pendingParentEmail: email, parentEmailCode: code, parentEmailCodeExpiry: expiry
  });
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 'service_417sg11',
      template_id: 'template_f2b4jeo',
      user_id: '1vFk29QDNKopU0RnJ',
      template_params: {
        to_email: email,
        user_name: userProfile.name || 'Użytkownik',
        code: code,
      }
    })
  });
  if (!res.ok) { toast(i18next.t('settings.emailSendError'), 'error'); return; }
  userProfile.pendingParentEmail = email;
  updateParentEmailUI();
  toast(i18next.t('settings.codeSent'));
};

window.verifyParentEmailCode = async () => {
  const input = document.getElementById('parent-email-code').value.trim();
  const snap  = await getDoc(doc(db, 'users', currentUser.uid));
  const data  = snap.data();
  if (!data.parentEmailCode || !data.pendingParentEmail) {
    toast(i18next.t('settings.noPendingVerification'), 'error'); return;
  }
  if (Date.now() > data.parentEmailCodeExpiry) {
    toast(i18next.t('settings.codeExpired'), 'error'); return;
  }
  if (input !== data.parentEmailCode) {
    toast(i18next.t('settings.codeInvalid'), 'error'); return;
  }
  await updateDoc(doc(db, 'users', currentUser.uid), {
    parentEmail: data.pendingParentEmail,
    parentEmailVerifiedAt: new Date().toISOString(),
    pendingParentEmail: deleteField(),
    parentEmailCode: deleteField(),
    parentEmailCodeExpiry: deleteField(),
  });
  await loadProfile();
  toast(i18next.t('settings.parentEmailVerified'), 'success');
};

window.cancelParentEmailVerification = async () => {
  await updateDoc(doc(db, 'users', currentUser.uid), {
    pendingParentEmail: deleteField(),
    parentEmailCode: deleteField(),
    parentEmailCodeExpiry: deleteField(),
  });
  userProfile.pendingParentEmail = null;
  updateParentEmailUI();
};

window.changeParentEmail = () => {
  document.getElementById('parent-email-verified-row').style.display = 'none';
  document.getElementById('parent-email-input-row').style.display    = 'block';
  document.getElementById('set-parent-email').value = '';
};

export function renderGamesList() {
  const games = userProfile?.games || [];
  const el = document.getElementById('games-list');
  if (games.length === 0) { el.innerHTML = `<p class="text2" style="margin-bottom:8px">${i18next.t('settings.noGames')}</p>`; return; }
  el.innerHTML = games.map((g, i) => `
    <div class="preset-item" style="margin-bottom:6px">
      <span class="preset-info">🎮 ${escapeHtml(g)}</span>
      <button class="btn-secondary" onclick="removeGame(${i})" style="padding:4px 10px;font-size:12px">${i18next.t('shop.delete')}</button>
    </div>
  `).join('');
}

export async function addGame() {
  const input = document.getElementById('new-game-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    const games = [...(Array.isArray(userProfile?.games) ? userProfile.games : []), name];
    await updateDoc(doc(db, 'users', currentUser.uid), { games });
    await loadProfile();
    input.value = '';
    toast(i18next.t('settings.gameAdded', { name, interpolation: { escapeValue: false } }));
  } catch (e) {
    console.error(e);
    toast(i18next.t('settings.gameSaveError'), 'error');
  }
}
window.addGame = addGame;

window.removeGame = async (i) => {
  if (!await confirmDialog(i18next.t('confirm.deleteGame'))) return;
  try {
    const games = [...(Array.isArray(userProfile?.games) ? userProfile.games : [])];
    games.splice(i, 1);
    await updateDoc(doc(db, 'users', currentUser.uid), { games });
    await loadProfile();
    toast(i18next.t('settings.gameDeleted'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('settings.gameDeleteError'), 'error');
  }
};

// ── Powiadomienia push (FCM) ──────────────────────────
export function updateNotifStatus(on) {
  const el = document.getElementById('notif-status');
  const btn = document.getElementById('notif-btn');
  if (!el) return;
  if (typeof Notification === 'undefined') {
    el.textContent = i18next.t('settings.notifUnsupported');
    if (btn) btn.style.display = 'none';
    return;
  }
  if (on || Notification.permission === 'granted') {
    el.textContent = i18next.t('settings.notifOn');
    if (btn) btn.textContent = i18next.t('settings.refreshToken');
  } else if (Notification.permission === 'denied') {
    el.textContent = i18next.t('settings.notifBlocked');
  } else {
    el.textContent = i18next.t('settings.notifOff');
  }
  renderNotifHours();
}

// ── Motywy ────────────────────────────────────────────
const THEME_ACCENTS = { lifexp: '#6c63ff', apple: '#1d6b4f', gold: '#f5c842' };
const THEME_BORDERS = { lifexp: '#2a2d3a', apple: '#3a3a3c', gold: '#2e2a1e' };

window.applyTheme = (name) => {
  document.body.classList.remove('theme-apple', 'theme-gold');
  if (name === 'apple') document.body.classList.add('theme-apple');
  if (name === 'gold')  document.body.classList.add('theme-gold');
  localStorage.setItem('lifexp-theme', name);

  // Update borders: active = accent, inactive = dim
  ['lifexp', 'apple', 'gold'].forEach(t => {
    const el = document.getElementById('theme-opt-' + t);
    if (!el) return;
    const isActive = t === name;
    el.style.borderColor = isActive ? THEME_ACCENTS[t] : THEME_BORDERS[t];
    el.style.transform = isActive ? 'scale(1.04)' : '';
    // Update label checkmark — lastElementChild, bo querySelector('div:last-child')
    // łapał pierwszy zagnieżdżony div i nadpisywał podgląd motywu tekstem.
    const label = el.lastElementChild;
    if (label) {
      const baseName = { lifexp: 'LifeXP', apple: 'Apple', gold: 'Gold' }[t];
      label.textContent = isActive ? baseName + ' ✓' : baseName;
    }
  });
};

(function loadTheme() {
  const saved = localStorage.getItem('lifexp-theme') || 'lifexp';
  applyTheme(saved);
})();

// ── Czcionka ──────────────────────────────────────────
const FONT_STACKS = {
  manrope: "'Manrope', sans-serif",
  jakarta: "'Plus Jakarta Sans', sans-serif",
  poppins: "'Poppins', sans-serif",
  inter:   "'Inter', sans-serif",
};
const FONT_DEFAULT = 'manrope';

window.applyFont = (name) => {
  const stack = FONT_STACKS[name] || FONT_STACKS[FONT_DEFAULT];
  document.body.style.setProperty('--font-user', stack);
  localStorage.setItem('lifexp-font', name);

  Object.keys(FONT_STACKS).forEach(f => {
    const el = document.getElementById('font-opt-' + f);
    if (!el) return;
    el.style.borderColor = f === name ? 'var(--accent)' : 'var(--border)';
  });
};

(function loadFont() {
  const saved = localStorage.getItem('lifexp-font') || FONT_DEFAULT;
  applyFont(saved);
})();

// ── Strefa czasowa (wykryta z przeglądarki, tylko etykieta) ──
function detectedTimezone() {
  try {
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const h = Math.floor(abs / 60), m = abs % 60;
    return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  } catch (e) {
    return 'UTC';
  }
}
export function renderNotifHoursInfo() {
  const el = document.getElementById('notif-hours-info');
  if (!el) return;
  // escapeValue:false tylko tu — tz to nasz własny string (nigdy dane usera),
  // domyślne globalne escapowanie zostaje włączone (chroni np. facts.favoriteActivity
  // które trafia do innerHTML z nazwą aktywności edytowalną przez użytkownika).
  el.textContent = i18next.t('settings.notifHoursInfo', { tz: detectedTimezone(), interpolation: { escapeValue: false } });
}

window.enableNotifications = async () => {
  if (typeof Notification === 'undefined') return toast(i18next.t('settings.notifUnsupported'), 'error');
  if (VAPID_KEY === 'WSTAW_VAPID_KEY') return toast(i18next.t('settings.notifNoVapid'), 'error');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { updateNotifStatus(false); return toast(i18next.t('settings.notifDenied'), 'error'); }
    const reg = swRegistration || await navigator.serviceWorker.register('sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return toast(i18next.t('settings.notifNoToken'), 'error');
    await setDoc(doc(db, 'users', currentUser.uid, 'fcmTokens', token), {
      token, createdAt: new Date(), ua: navigator.userAgent
    });
    updateNotifStatus(true);
    toast(i18next.t('settings.notifEnabled'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('settings.notifEnableError'), 'error');
  }
};

// Powiadomienie odebrane gdy apka jest na pierwszym planie → pokaż toast.

// ── Email Report ──────────────────────────────────────
window.toggleAutoReport = async (on) => {
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { autoReport: on });
    userProfile.autoReport = on;
    toast(on ? i18next.t('settings.weeklyReportOn') : i18next.t('settings.weeklyReportOff'));
  } catch (e) {
    toast(i18next.t('shop.saveError'), 'error');
    const t = document.getElementById('auto-report-toggle');
    if (t) t.checked = !on;
  }
};

// ── Godziny powiadomień ───────────────────────────────
export function renderNotifHours() {
  const hours = userProfile?.notifHours || [];
  const card = document.getElementById('notif-hours-card');
  if (card) card.style.display = Notification.permission === 'granted' ? 'block' : 'none';
  const el = document.getElementById('notif-hours-chips');
  if (!el) return;
  if (hours.length === 0) {
    el.innerHTML = `<span class="text2" style="font-size:13px">${i18next.t('settings.notifNoHours')}</span>`;
    return;
  }
  el.innerHTML = hours.slice().sort((a,b)=>a-b).map(h =>
    `<span class="tag" style="background:var(--accent);color:#fff;font-size:13px;display:inline-flex;align-items:center;gap:6px">
      ${h}:00
      <span onclick="removeNotifHour(${h})" style="cursor:pointer;opacity:.8;font-size:15px;line-height:1">×</span>
    </span>`
  ).join('');
}

window.addNotifHour = async () => {
  const sel = document.getElementById('notif-hour-select');
  const h = parseInt(sel.value);
  if (isNaN(h)) return toast(i18next.t('settings.chooseHourToast'), 'error');
  const hours = userProfile?.notifHours || [];
  if (hours.includes(h)) return toast(i18next.t('settings.hourAlreadyAdded'), 'error');
  if (hours.length >= 3) return toast(i18next.t('settings.maxThreeHours'), 'error');
  const newHours = [...hours, h];
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { notifHours: newHours });
    userProfile.notifHours = newHours;
    sel.value = '';
    renderNotifHours();
    toast(i18next.t('settings.hourAdded', { h }));
  } catch (e) { toast(i18next.t('shop.saveError'), 'error'); }
};

window.removeNotifHour = async (h) => {
  const newHours = (userProfile?.notifHours || []).filter(x => x !== h);
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { notifHours: newHours });
    userProfile.notifHours = newHours;
    renderNotifHours();
    toast(i18next.t('settings.hourRemoved', { h }));
  } catch (e) { toast(i18next.t('shop.saveError'), 'error'); }
};


export function initSettingsModule() {
  i18nReady.then(renderNotifHoursInfo);
  onMessage(messaging, (payload) => {
    toast(payload.notification?.title || i18next.t('settings.newNotification'));
  });
}
