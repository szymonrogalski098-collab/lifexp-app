/**
 * Składa stronę GitHub Pages z dwóch części (PLAN.md 3.1):
 *   /      — pliki v1 z katalogu głównego repo, bez żadnych zmian,
 *   /v2/   — zbudowane v2 (najpierw: npm run build --prefix v2).
 *
 * Do czasu tego skryptu Pages publikowało cały katalog główny. Teraz narzędzia
 * deweloperskie (testy, skrypty, dokumentacja, v2/src) zostają poza stroną,
 * więc po złożeniu skrypt sprawdza, że v1 ma wszystko, czego używa: pliki
 * z listy Service Workera, lokalne src/href w HTML i importy modułów JS.
 * Brak czegokolwiek = błąd, zanim trafi to na produkcję.
 *
 * Uruchomienie: node scripts/build-site.js [--out _site]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const outArg = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, outArg > -1 ? process.argv[outArg + 1] : '_site');
const V2_DIST = path.join(ROOT, 'v2', 'dist');

// Wpisy katalogu głównego, które nie są częścią aplikacji v1.
const EXCLUDE = new Set([
  'node_modules', 'v2', 'functions', 'tests', 'test-results', 'playwright-report', 'scripts', 'docs',
  'email-templates', '_site', 'package.json', 'package-lock.json', 'playwright.config.js',
  'firebase.json', 'firebase.emulators.json', 'firestore.rules',
]);
const EXCLUDE_EXT = new Set(['.md', '.log']);

function isPublished(name) {
  return !name.startsWith('.') && !EXCLUDE.has(name) && !EXCLUDE_EXT.has(path.extname(name));
}

function assemble() {
  if (!fs.existsSync(path.join(V2_DIST, 'index.html'))) {
    throw new Error('Brak v2/dist/index.html — najpierw: npm run build --prefix v2');
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(ROOT)) {
    if (isPublished(name)) fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
  }
  fs.cpSync(V2_DIST, path.join(OUT, 'v2'), { recursive: true });
}

// Lokalna ścieżka z atrybutu/importu → ścieżka pliku w OUT, albo null dla adresów zewnętrznych.
function localTarget(ref, fromFile) {
  if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) || ref.includes('${')) return null;
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return null;
  const base = clean.startsWith('/') ? OUT : path.dirname(fromFile);
  return path.join(base, clean.replace(/^\//, ''));
}

function missingReferences() {
  const missing = new Set();
  const expect = (target, from) => {
    if (target && !fs.existsSync(target)) missing.add(`${path.relative(OUT, target)} (z ${path.relative(OUT, from)})`);
  };

  // 1. Pliki precache'owane przez Service Worker v1.
  const swPath = path.join(OUT, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  for (const list of ['STATIC', 'HTML']) {
    const m = sw.match(new RegExp(`const ${list}\\s*=\\s*\\[([^\\]]*)\\]`));
    if (!m) throw new Error(`Nie znaleziono listy ${list} w sw.js`);
    for (const [, file] of m[1].matchAll(/'([^']+)'/g)) expect(path.join(OUT, file), swPath);
  }

  // 2. Lokalne src/href w HTML i importy w JS (także w <script type="module"> wewnątrz HTML).
  const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  const ASSET_LITERAL = /['"`]((?:\.\/)?[\w./-]+\.(?:html|js|json|css|png|svg|webmanifest))[?#'"`]/g;
  for (const name of fs.readdirSync(OUT)) {
    const file = path.join(OUT, name);
    const ext = path.extname(name);
    if (ext !== '.html' && ext !== '.js') continue;
    const text = fs.readFileSync(file, 'utf8');
    if (ext === '.html') {
      for (const [, ref] of text.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) expect(localTarget(ref, file), file);
    }
    for (const [, ref] of text.matchAll(IMPORT)) expect(localTarget(ref, file), file);
    // Nazwy plików w literałach, np. clients.openWindow('app.html') albo register('sw.js').
    for (const [, ref] of text.matchAll(ASSET_LITERAL)) expect(localTarget(ref, file), file);
  }

  // 3. v2.
  expect(path.join(OUT, 'v2', 'index.html'), path.join(OUT, 'v2'));
  return [...missing].sort();
}

function main() {
  assemble();
  const missing = missingReferences();
  if (missing.length) {
    console.error(`Złożona strona nie ma plików, których używa v1:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  const count = fs.readdirSync(OUT).length;
  console.log(`Strona złożona w ${path.relative(ROOT, OUT) || '.'}: ${count} wpisów w katalogu głównym, v2 w /v2/.`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { isPublished, localTarget };
