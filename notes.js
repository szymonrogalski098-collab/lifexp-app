import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { confirmDialog, currentUser, dateISOLocal, db, escapeHtml, toast, userProfile } from "./core.js";

// ── Notatnik: dwie podzakładki (Notatki + Zadania) w jednym module ──
// Notatki i Zadania siedzą w jednym pliku, bo dzieli je tylko widok — obie
// listy są prostym CRUD-em na podkolekcji użytkownika, a Zadania dodatkowo
// napędzają mechanikę budowy PC (niżej, sekcja "budowa PC").

const NOTES_MAX = 30;
const NOTE_MAX_LINES = 1000;
const TODOS_MAX = 30;

let notes = [];        // { id, title, content, createdAt, archived }
let todos = [];        // { id, text, size, dueDate, done, createdAt, penaltyApplied }

let notesTab = 'notes';    // 'notes' | 'todos'   — górny przełącznik
let notesView = 'active';  // 'active' | 'archived' — widok w podzakładce Notatki

let editingNoteId = null;  // null = nowa notatka
let menuNoteId = null;     // notatka, dla której otwarto menu
let editingTodoId = null;  // null = nowe zadanie
let todoSize = 'S';

// ════════════════════════════════════════════════════════════════════
// BUDOWA PC — mechanika punktów
//
// Celowo TRZYMANA OSOBNO od renderowania: funkcje niżej są czyste (dostają
// stan, zwracają nowy stan, nie dotykają DOM ani Firestore), a widok czyta
// tylko gotowy wynik. Dzięki temu podmiana placeholdera na model 3D nie
// wymaga ruszania ani jednej linijki tej sekcji.
// ════════════════════════════════════════════════════════════════════

const PIECES_PER_COMPONENT = 3;
const TODO_SIZE_PIECES = { S: 1, M: 2, L: 3 };

// Obudowa i płyta główna ZAWSZE pierwsze i w tej kolejności; pozostałe cztery
// losowane raz na użytkownika.
const PC_FIXED_PREFIX = ['case', 'motherboard'];
const PC_RANDOM_POOL  = ['gpu', 'cpu', 'psu', 'ram'];
const PC_COMPONENT_COUNT = PC_FIXED_PREFIX.length + PC_RANDOM_POOL.length;

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Świeży build — losowanie kolejności dzieje się TYLKO tutaj, a ensurePcBuild()
// woła to dokładnie raz na użytkownika (patrz komentarz tam).
function makePcBuild() {
  const componentOrder = [...PC_FIXED_PREFIX, ...shuffled(PC_RANDOM_POOL)];
  const progress = {};
  for (const c of componentOrder) progress[c] = 0;
  return { componentOrder, progress, currentComponentIndex: 0 };
}

// Odczyt bez tworzenia. Zwraca null, gdy użytkownik jeszcze nie ma builda albo
// zapisany kształt jest uszkodzony — wtedy widok pokazuje "dodaj pierwsze zadanie".
function getPcBuild() {
  const b = userProfile?.pcBuild;
  if (!b || !Array.isArray(b.componentOrder) || b.componentOrder.length !== PC_COMPONENT_COUNT) return null;
  if (!b.progress || typeof b.currentComponentIndex !== 'number') return null;
  return b;
}

function clonePcBuild(b) {
  return { componentOrder: [...b.componentOrder], progress: { ...b.progress }, currentComponentIndex: b.currentComponentIndex };
}

// Dopisanie kawałków do AKTUALNIE budowanego komponentu. Nadmiar przepada —
// zadanie L kończące komponent stojący na 2/3 daje +1, nie przenosi +2 dalej.
// Komponent N+1 rusza dopiero, gdy N osiągnie 3/3 (stąd pojedynczy indeks).
function addPiecesToBuild(build, pieces) {
  const b = clonePcBuild(build);
  const idx = b.currentComponentIndex;
  if (idx >= b.componentOrder.length) return b;      // cały PC gotowy
  const comp = b.componentOrder[idx];
  b.progress[comp] = Math.min(PIECES_PER_COMPONENT, (b.progress[comp] || 0) + pieces);
  if (b.progress[comp] >= PIECES_PER_COMPONENT) b.currentComponentIndex = idx + 1;
  return b;
}

// Kara: -1 kawałek z OSTATNIEGO komponentu stojącego na pełnych 3/3, licząc od
// końca kolejności. Aktualnie budowany nigdy nie obrywa, więc currentComponentIndex
// zostaje nietknięty. Gdy żaden komponent nie jest na 3/3 — kara nie ma efektu.
function applyPenaltyToBuild(build) {
  const b = clonePcBuild(build);
  for (let i = b.componentOrder.length - 1; i >= 0; i--) {
    const comp = b.componentOrder[i];
    if ((b.progress[comp] || 0) >= PIECES_PER_COMPONENT) {
      b.progress[comp] = PIECES_PER_COMPONENT - 1;
      return b;
    }
  }
  return b;
}

async function savePcBuild(build) {
  userProfile.pcBuild = build;
  await updateDoc(doc(db, 'users', currentUser.uid), { pcBuild: build });
}

// Losowanie kolejności odpala się przy PIERWSZYM zadaniu i tylko wtedy: jeśli
// profil ma już pcBuild, zwracamy go bez zmian, więc kolejność jest stała na
// zawsze dla danego konta.
async function ensurePcBuild() {
  const existing = getPcBuild();
  if (existing) return existing;
  const build = makePcBuild();
  await savePcBuild(build);
  return build;
}

// Kary za przeterminowane zadania. `penaltyApplied` na zadaniu gwarantuje, że
// jedno spóźnienie kosztuje dokładnie jeden kawałek, choćby użytkownik wchodził
// w zakładkę sto razy. Flagę stawiamy TAKŻE gdy kara nie miała efektu (brak
// ukończonego komponentu) — inaczej to samo zadanie próbowałoby karać w
// nieskończoność, gdy build wreszcie urośnie.
async function applyOverduePenalties() {
  // dateISOLocal, NIE todayStr: dueDate pochodzi z <input type="date">, czyli
  // z LOKALNEGO kalendarza uzytkownika, a todayStr() liczy w UTC. Wieczorem w
  // UTC+2 te dwie daty sie rozjezdzaja i kara/nagroda wypadalaby o dzien obok.
  const today = dateISOLocal();
  const overdue = todos.filter(t => !t.done && !t.penaltyApplied && t.dueDate && t.dueDate < today);
  if (!overdue.length) return;

  let build = getPcBuild();
  for (const t of overdue) {
    if (build) build = applyPenaltyToBuild(build);
    await updateDoc(doc(db, 'users', currentUser.uid, 'todos', t.id), { penaltyApplied: true });
    t.penaltyApplied = true;
  }
  if (build) await savePcBuild(build);
}

// ════════════════════════════════════════════════════════════════════
// Wczytywanie i przełączanie zakładek
// ════════════════════════════════════════════════════════════════════

export async function loadNotes() {
  await Promise.all([loadNotesList(), loadTodosList()]);
  await applyOverduePenalties();
  syncNotesTabs();
  renderNotes();
  renderTodos();
  renderPcBuild();
}

async function loadNotesList() {
  const snap = await getDocs(query(collection(db, 'users', currentUser.uid, 'notes'), orderBy('createdAt', 'desc')));
  notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadTodosList() {
  const snap = await getDocs(query(collection(db, 'users', currentUser.uid, 'todos'), orderBy('createdAt', 'desc')));
  todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function syncNotesTabs() {
  document.querySelectorAll('#notes-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === notesTab));
  document.querySelectorAll('#notes-view-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === notesView));
  document.getElementById('notes-pane-notes').style.display = notesTab === 'notes' ? '' : 'none';
  document.getElementById('notes-pane-todos').style.display = notesTab === 'todos' ? '' : 'none';
  // FAB dodaje notatki, więc na zakładce Zadań nie ma czego robić.
  document.getElementById('notes-fab').style.display = notesTab === 'notes' ? '' : 'none';
}

window.selectNotesTab = (tab) => {
  notesTab = tab;
  syncNotesTabs();
};

window.selectNotesView = (view) => {
  notesView = view;
  syncNotesTabs();
  renderNotes();
};

// ════════════════════════════════════════════════════════════════════
// Notatki
// ════════════════════════════════════════════════════════════════════

function visibleNotes() {
  return notes.filter(n => (notesView === 'archived') === !!n.archived);
}

function formatNoteDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderNotes() {
  const el = document.getElementById('notes-list');
  const list = visibleNotes();
  if (!list.length) {
    const key = notesView === 'archived' ? 'notes.emptyArchived' : 'notes.empty';
    el.innerHTML = `<div class="sheet-empty">${i18next.t(key)}</div>`;
    return;
  }
  el.innerHTML = list.map(n => `
    <div class="note-item" data-note="${n.id}" onclick="openNoteEditor('${n.id}')">
      <div class="ni-main">
        <div class="ni-title">${escapeHtml(n.title || '')}</div>
        <div class="ni-date">${formatNoteDate(n.createdAt)}</div>
      </div>
      <button class="note-dots" aria-label="${i18next.t('notes.menuAria')}"
        onclick="event.stopPropagation(); openNoteMenu('${n.id}')">⋯</button>
    </div>`).join('');
  attachNoteLongPress();
}

// Long-press na mobile otwiera to samo menu co trzy kropki na desktopie.
// Appka nie miała wcześniej tego wzorca, więc jest napisany tutaj od zera:
// pointerdown startuje licznik, a ruch palcem (scroll) albo puszczenie przed
// czasem go kasuje, żeby przewijanie listy nie otwierało menu przypadkiem.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

function attachNoteLongPress() {
  document.querySelectorAll('#notes-list .note-item').forEach(row => {
    let timer = null, startX = 0, startY = 0, fired = false;

    const cancel = () => { clearTimeout(timer); timer = null; };

    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;      // desktop ma trzy kropki
      startX = e.clientX; startY = e.clientY; fired = false;
      timer = setTimeout(() => {
        fired = true;
        openNoteMenu(row.dataset.note);
      }, LONG_PRESS_MS);
    });
    row.addEventListener('pointermove', (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > LONG_PRESS_MOVE_TOLERANCE ||
          Math.abs(e.clientY - startY) > LONG_PRESS_MOVE_TOLERANCE) cancel();
    });
    row.addEventListener('pointerup', cancel);
    row.addEventListener('pointercancel', cancel);
    // Po długim przytrzymaniu tłumimy zwykłe kliknięcie, żeby zaraz po menu
    // nie otworzył się jeszcze edytor notatki.
    row.addEventListener('click', (e) => {
      if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
    }, true);
  });
}

window.openNoteEditor = (id) => {
  const active = notes.filter(n => !n.archived);
  if (!id && active.length >= NOTES_MAX) {
    return toast(i18next.t('notes.maxNotes', { max: NOTES_MAX }), 'error');
  }
  editingNoteId = id || null;
  const note = id ? notes.find(n => n.id === id) : null;
  document.getElementById('note-title').value = note?.title || '';
  document.getElementById('note-content').value = note?.content || '';
  document.getElementById('note-editor-hint').textContent = '';
  document.getElementById('note-editor').classList.add('open');
};

window.closeNoteEditor = () => {
  document.getElementById('note-editor').classList.remove('open');
  editingNoteId = null;
};

window.saveNote = async () => {
  const title = document.getElementById('note-title').value.trim();
  const content = document.getElementById('note-content').value;

  if (!title) return toast(i18next.t('notes.needTitle'), 'error');

  // Limit linii liczymy na treści, żeby komunikat mógł podać realną liczbę —
  // cichy obcinacz byłby gorszy niż jasne "skróć o tyle a tyle".
  const lines = content.split('\n').length;
  if (lines > NOTE_MAX_LINES) {
    const msg = i18next.t('notes.maxLines', { lines, max: NOTE_MAX_LINES });
    document.getElementById('note-editor-hint').textContent = msg;
    return toast(msg, 'error');
  }

  try {
    if (editingNoteId) {
      await updateDoc(doc(db, 'users', currentUser.uid, 'notes', editingNoteId), { title, content });
      const n = notes.find(x => x.id === editingNoteId);
      if (n) { n.title = title; n.content = content; }
    } else {
      const createdAt = new Date().toISOString();
      const ref = await addDoc(collection(db, 'users', currentUser.uid, 'notes'),
        { title, content, createdAt, archived: false });
      notes.unshift({ id: ref.id, title, content, createdAt, archived: false });
    }
    closeNoteEditor();
    renderNotes();
    toast(i18next.t('notes.saved'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('shop.saveError'), 'error');
  }
};

window.openNoteMenu = (id) => {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  menuNoteId = id;
  document.getElementById('note-menu-title').textContent = note.title || '';
  document.getElementById('note-menu-archive').textContent =
    i18next.t(note.archived ? 'notes.menuRestore' : 'notes.menuArchive');
  document.getElementById('note-menu-delete').textContent =
    i18next.t(note.archived ? 'notes.menuDeleteForever' : 'notes.menuDelete');
  document.getElementById('note-menu').classList.add('open');
};

window.closeNoteMenu = () => {
  document.getElementById('note-menu').classList.remove('open');
  menuNoteId = null;
};

// Archiwizacja to zwykły przełącznik flagi — z widoku "Zarchiwizowane" ten sam
// przycisk przywraca notatkę z powrotem do aktywnych.
window.noteMenuArchive = async () => {
  const note = notes.find(n => n.id === menuNoteId);
  if (!note) return;
  const archived = !note.archived;
  closeNoteMenu();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'notes', note.id), { archived });
    note.archived = archived;
    renderNotes();
    toast(i18next.t(archived ? 'notes.archived' : 'notes.restored'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('shop.saveError'), 'error');
  }
};

window.noteMenuDelete = async () => {
  const note = notes.find(n => n.id === menuNoteId);
  if (!note) return;
  const wasArchived = !!note.archived;
  closeNoteMenu();
  const msg = i18next.t(wasArchived ? 'notes.confirmDeleteForever' : 'notes.confirmDelete');
  if (!await confirmDialog(msg, i18next.t('common.delete'))) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'notes', note.id));
    notes = notes.filter(n => n.id !== note.id);
    renderNotes();
    toast(i18next.t('notes.deleted'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('common.deleteError'), 'error');
  }
};

// ════════════════════════════════════════════════════════════════════
// Zadania (To Do)
// ════════════════════════════════════════════════════════════════════

function renderTodos() {
  const el = document.getElementById('todos-list');
  if (!todos.length) {
    el.innerHTML = `<div class="sheet-empty">${i18next.t('notes.emptyTodos')}</div>`;
    return;
  }
  const today = dateISOLocal();
  el.innerHTML = todos.map(t => {
    const overdue = !t.done && t.dueDate && t.dueDate < today;
    return `
    <div class="todo-item ${t.done ? 'done' : ''}">
      <button class="todo-check ${t.done ? 'checked' : ''}"
        ${t.done ? 'disabled' : `onclick="markTodoDone('${t.id}')"`}
        aria-label="${i18next.t('notes.markDone')}">${t.done ? '✓' : ''}</button>
      <div class="ti-main" ${t.done ? '' : `onclick="openTodoForm('${t.id}')" style="cursor:pointer"`}>
        <div class="ti-text">${escapeHtml(t.text || '')}</div>
        <div class="ti-meta">
          <span class="todo-size-tag">${t.size || 'S'}</span>
          <span class="${overdue ? 'todo-overdue' : ''}">${escapeHtml(t.dueDate || '')}</span>
          ${t.done ? `<span>${i18next.t('notes.doneTag')}</span>` : ''}
          ${overdue ? `<span class="todo-overdue">${i18next.t('notes.overdueTag')}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

window.setTodoSize = (size) => {
  todoSize = size;
  document.querySelectorAll('#todo-size-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
};

window.openTodoForm = (id) => {
  if (!id && todos.length >= TODOS_MAX) {
    return toast(i18next.t('notes.maxTodos', { max: TODOS_MAX }), 'error');
  }
  editingTodoId = id || null;
  const t = id ? todos.find(x => x.id === id) : null;
  document.getElementById('todo-form-title').textContent = i18next.t(id ? 'notes.editTodo' : 'notes.newTodo');
  document.getElementById('todo-text').value = t?.text || '';
  document.getElementById('todo-due').value = t?.dueDate || '';
  setTodoSize(t?.size || 'S');
  document.getElementById('todo-form').classList.add('open');
};

window.closeTodoForm = () => {
  document.getElementById('todo-form').classList.remove('open');
  editingTodoId = null;
};

window.saveTodo = async () => {
  const text = document.getElementById('todo-text').value.trim();
  const dueDate = document.getElementById('todo-due').value;

  if (!text) return toast(i18next.t('notes.needText'), 'error');
  if (!dueDate) return toast(i18next.t('notes.needDue'), 'error');
  if (dueDate < dateISOLocal()) return toast(i18next.t('notes.dueInPast'), 'error');

  // Potwierdzenie TYLKO przy dodawaniu — przy edycji użytkownik zna już stawkę.
  if (!editingTodoId) {
    const ok = await confirmDialog(
      i18next.t('notes.addConfirm', { date: dueDate, interpolation: { escapeValue: false } }),
      i18next.t('notes.addConfirmOk'));
    if (!ok) return;
  }

  try {
    if (editingTodoId) {
      await updateDoc(doc(db, 'users', currentUser.uid, 'todos', editingTodoId), { text, dueDate, size: todoSize });
      const t = todos.find(x => x.id === editingTodoId);
      if (t) { t.text = text; t.dueDate = dueDate; t.size = todoSize; }
    } else {
      // Pierwsze zadanie zakłada build (i losuje kolejność komponentów).
      await ensurePcBuild();
      const createdAt = new Date().toISOString();
      const ref = await addDoc(collection(db, 'users', currentUser.uid, 'todos'),
        { text, dueDate, size: todoSize, done: false, createdAt, penaltyApplied: false });
      todos.unshift({ id: ref.id, text, dueDate, size: todoSize, done: false, createdAt, penaltyApplied: false });
    }
    closeTodoForm();
    renderTodos();
    renderPcBuild();
    toast(i18next.t('notes.todoSaved'));
  } catch (e) {
    console.error(e);
    toast(i18next.t('shop.saveError'), 'error');
  }
};

// Odznaczenie jest jednokierunkowe: cofnięcie musiałoby odbierać przyznane
// kawałki, a tego mechanika nie definiuje — dlatego przycisk gaśnie po kliknięciu.
window.markTodoDone = async (id) => {
  const t = todos.find(x => x.id === id);
  if (!t || t.done) return;

  // Kawałki należą się tylko za zrobienie w terminie; dzień terminu jeszcze się liczy.
  const inTime = dateISOLocal() <= t.dueDate;
  const pieces = TODO_SIZE_PIECES[t.size] || 1;

  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'todos', id), { done: true });
    t.done = true;

    if (inTime) {
      const build = await ensurePcBuild();
      await savePcBuild(addPiecesToBuild(build, pieces));
      toast(i18next.t('notes.earnedPieces', { n: pieces }));
    } else {
      toast(i18next.t('notes.lateNoPieces'));
    }
    renderTodos();
    renderPcBuild();
  } catch (e) {
    console.error(e);
    toast(i18next.t('shop.saveError'), 'error');
  }
};

// ════════════════════════════════════════════════════════════════════
// Widok budowy PC — PLACEHOLDER do podmiany na 3D
//
// Czyta wyłącznie stan zwrócony przez getPcBuild() i nic nie liczy. Żeby
// wstawić tu model 3D, wystarczy podmienić ciało tej jednej funkcji.
// ════════════════════════════════════════════════════════════════════

function renderPcBuild() {
  const el = document.getElementById('pcbuild-view');
  const build = getPcBuild();

  if (!build) {
    el.innerHTML = `<h3 style="margin-bottom:10px">${i18next.t('notes.pcTitle')}</h3>
      <p class="text2">${i18next.t('notes.pcNoBuild')}</p>`;
    return;
  }

  const done = build.currentComponentIndex >= build.componentOrder.length;
  const rows = build.componentOrder.map((comp, i) => {
    const filled = build.progress[comp] || 0;
    const state = i === build.currentComponentIndex ? 'current' : (i > build.currentComponentIndex ? 'locked' : '');
    const pips = Array.from({ length: PIECES_PER_COMPONENT },
      (_, p) => `<div class="pc-pip ${p < filled ? 'filled' : ''}"></div>`).join('');
    return `
      <div class="pc-comp ${state}">
        <div class="pc-name">${i18next.t('notes.comp_' + comp)}</div>
        <div class="pc-pips">${pips}</div>
        <div class="pc-count">${filled}/${PIECES_PER_COMPONENT}</div>
      </div>`;
  }).join('');

  const caption = done
    ? i18next.t('notes.pcComplete')
    : i18next.t('notes.pcCurrent') + ': ' + i18next.t('notes.comp_' + build.componentOrder[build.currentComponentIndex]);

  el.innerHTML = `<h3 style="margin-bottom:10px">${i18next.t('notes.pcTitle')}</h3>
    <p class="text2" style="margin-bottom:12px">${caption}</p>
    ${rows}`;
}
