/**
 * Inwentaryzacja kształtu danych w Firestore — WYŁĄCZNIE schemat, nigdy wartości.
 *
 * Po co: przed etapem 2 v2 (konwertery danych) trzeba wiedzieć, jakie kształty
 * dokumentów naprawdę istnieją (legacy pola, brakujące pola, różne typy dat),
 * zamiast zgadywać z kodu. Patrz docs/v2/PLAN.md 5.3.
 *
 * Repo jest PUBLICZNE, a raport trafia do podsumowania joba GitHub Actions,
 * więc raport zawiera tylko: wzorce ścieżek kolekcji, klasy identyfikatorów
 * dokumentów (data, auto-id, …), nazwy pól, typy i liczniki. Wartości pojawiają
 * się wyłącznie dla enumów zdefiniowanych w kodzie aplikacji (ENUMS niżej);
 * każda inna wartość jest raportowana jako "<other>". Treści, e-maile, nazwy,
 * id dokumentów i tokeny nigdy nie są wypisywane.
 *
 * Uruchomienie:
 *   - GitHub Actions: workflow "Data inventory" (sekret FIREBASE_SERVICE_ACCOUNT)
 *   - lokalnie z kluczem:   GOOGLE_APPLICATION_CREDENTIALS=klucz.json node scripts/inventory.js
 *   - na emulatorze:        FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-lifexp node scripts/inventory.js
 * Opcje: --out <plik.md>  zapis raportu do pliku (domyślnie stdout)
 */
const fs = require('fs');

// Identyfikatory dokumentów zdefiniowane w kodzie aplikacji (seedy, stałe
// dokumenty) — tylko je wolno wypisać z nazwy.
const STRUCTURAL_IDS = new Set([
  'settings', 'balance', 'keywords',
  'learning', 'project', 'reading', 'exercise', 'school',
  'entryway', 'vacuum_stairs', 'wash_stairs', 'vacuum_ground', 'room_quick', 'room_deep', 'trash_segregated', 'dishwasher',
]);

// Pola z wartościami z zamkniętego zbioru zdefiniowanego w kodzie v1. Klucz to
// wzorzec ścieżki kolekcji + ścieżka pola (tablice jako "[]").
const ENUMS = {
  'users/{id} enabledModules[]': ['chores', 'money', 'games', 'stats', 'planner', 'notes', 'aichat'],
  'users/{id} accountMode': ['solo', 'supervised'],
  'users/{id} lang': ['pl', 'en'],
  'users/{id} goals[].type': ['points', 'money'],
  'users/{id}/activities/{id} type': ['learning', 'project', 'reading', 'exercise', 'school', '__generated__'],
  'users/{id}/moneyTransactions/{id} type': ['income', 'expense'],
  'users/{id}/moneyTransactions/{id} source': ['manual', 'chore_payout'],
  'users/{id}/moneyLoans/{id} direction': ['lent', 'borrowed'],
  'users/{id}/todos/{id} size': ['S', 'M', 'L'],
  'users/{id}/chores/{id} choreId': ['entryway', 'vacuum_stairs', 'wash_stairs', 'vacuum_ground', 'room_quick', 'room_deep', 'trash_segregated', 'dishwasher'],
  'bugReports/{id} status': ['new', 'spam', 'accepted', 'rejected', 'postponed'],
  'bugReports/{id} area': ['dashboard', 'money', 'chores', 'history', 'stats', 'settings', 'other'],
};

const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const MAX_MAP_KEYS = 30;

function classifyId(id) {
  if (STRUCTURAL_IDS.has(id)) return id;
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) return '<date YYYY-MM-DD>';
  if (/^[A-Za-z0-9]{20}$/.test(id)) return '<auto-id>';
  if (/^[A-Za-z0-9]{28}$/.test(id)) return '<uid-like>';
  return '<other>';
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') {
    if (v === '') return 'string:empty';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'string:date';
    if (/^\d{4}-\d{2}$/.test(v)) return 'string:month';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'string:iso-datetime';
    return 'string';
  }
  if (v && typeof v.toDate === 'function' && 'seconds' in v) return 'timestamp';
  if (v && 'latitude' in v && 'longitude' in v) return 'geopoint';
  if (v && typeof v.path === 'string' && typeof v.id === 'string' && v.firestore) return 'reference';
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return 'bytes';
  if (typeof v === 'object') return 'map';
  return typeof v;
}

class Inventory {
  constructor() {
    // pattern -> { docs, ids: Map, fields: Map(path -> Map(type -> n)), present: Map(path -> n), enums: Map(path -> Map(value -> n)) }
    this.collections = new Map();
  }

  bucket(pattern) {
    if (!this.collections.has(pattern)) {
      this.collections.set(pattern, { docs: 0, ids: new Map(), fields: new Map(), present: new Map(), enums: new Map() });
    }
    return this.collections.get(pattern);
  }

  addDoc(pattern, id, data) {
    const b = this.bucket(pattern);
    b.docs += 1;
    const idClass = classifyId(id);
    b.ids.set(idClass, (b.ids.get(idClass) || 0) + 1);
    const seen = new Set(); // count each field path once per document
    this.walk(b, pattern, '', data, seen);
  }

  note(b, path, type, seen) {
    // Obecność liczona osobno od typów: pole z różnymi typami w różnych
    // dokumentach (np. kwota int/float) jest obecne w sumie tych dokumentów.
    if (!seen.has(path)) {
      seen.add(path);
      b.present.set(path, (b.present.get(path) || 0) + 1);
    }
    const key = `${path}\u0000${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!b.fields.has(path)) b.fields.set(path, new Map());
    const t = b.fields.get(path);
    t.set(type, (t.get(type) || 0) + 1);
  }

  noteEnum(b, pattern, path, value) {
    const allowed = ENUMS[`${pattern} ${path}`];
    if (!allowed) return;
    const shown = typeof value === 'string' && allowed.includes(value) ? value : '<other>';
    if (!b.enums.has(path)) b.enums.set(path, new Map());
    const m = b.enums.get(path);
    m.set(shown, (m.get(shown) || 0) + 1);
  }

  walk(b, pattern, prefix, value, seen) {
    const entries = Object.entries(value || {});
    const collapse = entries.length > MAX_MAP_KEYS || entries.some(([k]) => !SAFE_KEY.test(k));
    for (const [k, v] of entries) {
      const name = collapse ? '{*}' : k;
      const path = prefix ? `${prefix}.${name}` : name;
      this.walkValue(b, pattern, path, v, seen);
    }
  }

  walkValue(b, pattern, path, v, seen) {
    const type = typeOf(v);
    this.note(b, path, type, seen);
    if (type === 'map') this.walk(b, pattern, path, v, seen);
    else if (type === 'array') {
      for (const item of v) {
        const itemType = typeOf(item);
        this.note(b, `${path}[]`, itemType, seen);
        if (itemType === 'map') this.walk(b, pattern, `${path}[]`, item, seen);
        else this.noteEnum(b, pattern, `${path}[]`, item);
      }
    } else {
      this.noteEnum(b, pattern, path, v);
    }
  }

  toMarkdown(meta) {
    const lines = [];
    lines.push('# LifeXP — inwentaryzacja kształtu danych');
    lines.push('');
    lines.push(`Wygenerowano: ${meta.generatedAt} · projekt: \`${meta.projectId}\` · tylko schemat, bez wartości (scripts/inventory.js).`);
    lines.push('');
    const patterns = [...this.collections.keys()].sort();
    lines.push('| Kolekcja | Dokumenty | Klasy id |');
    lines.push('|---|---:|---|');
    for (const p of patterns) {
      const b = this.collections.get(p);
      lines.push(`| \`${p}\` | ${b.docs} | ${fmtCounts(b.ids)} |`);
    }
    for (const p of patterns) {
      const b = this.collections.get(p);
      lines.push('');
      lines.push(`## \`${p}\` (${b.docs})`);
      lines.push('');
      lines.push('| Pole | Obecne w | Typy |');
      lines.push('|---|---:|---|');
      for (const path of [...b.fields.keys()].sort()) {
        const types = b.fields.get(path);
        const present = path.includes('[]') ? '—' : `${b.present.get(path)}/${b.docs}`;
        lines.push(`| \`${path}\` | ${present} | ${fmtCounts(types)} |`);
      }
      if (b.enums.size) {
        lines.push('');
        lines.push('Wartości enumów (zdefiniowanych w kodzie):');
        lines.push('');
        for (const path of [...b.enums.keys()].sort()) lines.push(`- \`${path}\`: ${fmtCounts(b.enums.get(path))}`);
      }
    }
    lines.push('');
    return lines.join('\n');
  }
}

function fmtCounts(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(', ');
}

async function scanCollection(inv, colRef, pattern) {
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    inv.addDoc(pattern, doc.id, doc.data());
    const subs = await doc.ref.listCollections();
    for (const sub of subs) {
      const name = SAFE_KEY.test(sub.id) ? sub.id : '<other>';
      await scanCollection(inv, sub, `${pattern}/${name}/{id}`);
    }
  }
}

/** Scan every collection reachable from the root. `db` is a firebase-admin Firestore. */
async function buildInventory(db) {
  const inv = new Inventory();
  for (const col of await db.listCollections()) {
    const name = SAFE_KEY.test(col.id) ? col.id : '<other>';
    await scanCollection(inv, col, `${name}/{id}`);
  }
  return inv;
}

// Błędy są wypisywane w PUBLICZNYM logu Actions, więc nigdy nie mogą zawierać
// fragmentu sekretu. Stąd własne komunikaty zamiast np. oryginalnego błędu
// JSON.parse, który cytuje początek parsowanego tekstu.
function parseServiceAccount(raw) {
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { sa = null; }
  if (!sa || sa.type !== 'service_account' || !sa.private_key || !sa.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT nie zawiera klucza konta serwisowego. Sekret musi mieć CAŁĄ '
      + 'zawartość pliku JSON pobranego przez "Generate new private key" (zaczyna się od "{" i zawiera '
      + '"type": "service_account"), a nie fragment kodu z konsoli Firebase.');
  }
  return sa;
}

function explain(e) {
  if (e && e.code === 16) {
    return 'Google odrzucił klucz (UNAUTHENTICATED): klucz w FIREBASE_SERVICE_ACCOUNT został usunięty albo '
      + 'wyłączony. Wygeneruj nowy klucz (Firebase Console → Project settings → Service accounts) i podmień sekret.';
  }
  if (e && e.code === 7) {
    return 'Brak uprawnień (PERMISSION_DENIED): konto serwisowe z sekretu nie ma dostępu do Firestore tego projektu.';
  }
  return (e && e.message) || String(e);
}

async function main() {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  let projectId = process.env.GCLOUD_PROJECT;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    projectId = sa.project_id;
    initializeApp({ credential: cert(sa), projectId });
  } else {
    initializeApp(projectId ? { projectId } : undefined);
  }
  const db = getFirestore();
  const inv = await buildInventory(db);
  const md = inv.toMarkdown({ generatedAt: new Date().toISOString(), projectId: projectId || '(default)' });
  const outIdx = process.argv.indexOf('--out');
  if (outIdx > -1) fs.writeFileSync(process.argv[outIdx + 1], md);
  else process.stdout.write(md);
}

if (require.main === module) {
  main().catch((e) => { console.error(explain(e)); process.exit(1); });
}

module.exports = { Inventory, buildInventory, classifyId, typeOf, parseServiceAccount, explain };
