# LifeXP — wskazówki dla asystentów AI

LifeXP to PWA do zdobywania punktów za produktywność i obowiązki. Trwa przebudowa na v2 metodą strangler:
v2 powstaje obok v1, na tych samych danych. Pełny plan i decyzje: `docs/v2/PLAN.md` (stan: sekcja 9.1).

## Mapa repo

| Ścieżka | Co to |
|---|---|
| katalog główny (`*.html`, `*.js`, `style.css`, `sw.js`) | **v1 — produkcja.** Vanilla ES modules, Firebase SDK 10.12.0 z CDN, bez build stepu |
| `v2/` | **v2 w budowie.** Vite + TypeScript strict + Preact; publikowane pod `/v2/` |
| `functions/` | Nowy backend (Cloud Functions, codebase `lifexp-v2`), na razie pusty szkielet |
| `tests/` | Playwright: v1 (`app`, `fps-gameplay`), v1 na emulatorach Firebase (`emulator`), v2 na emulatorach (`v2`) |
| `scripts/` | Skrypty Node: składanie strony, inwentaryzacja danych, stare skrypty push/raportu |
| `docs/v2/` | Plan, benchmark UI (`RESEARCH.md`), zachowania v1 (`GOLDEN.md`), dane (`INVENTORY.md`), backup |

## Komendy

```bash
npm test                      # testy v1 (Playwright, bez sieci)
npm run test:emulator         # v1 na emulatorach Auth + Firestore (wymaga Javy 21)
npm run check --prefix v2     # v2: typecheck + lint architektury + testy jednostkowe
npm run build --prefix v2     # v2: build do v2/dist
npm run test:v2               # v2: build + testy w przeglądarce na emulatorach (logowanie, powłoka; Java 21)
node scripts/build-site.js    # składa stronę Pages (v1 + v2/dist) w _site i sprawdza pliki v1
```

Deploy: workflow „Deploy” na każdy push do `main` (v1 w katalogu głównym bez zmian, v2 pod `/v2/`).

## Zasady nienaruszalne

- **Dane są wspólne dla v1 i v2** (projekt Firebase `faiobaj4`). Schemat tylko addytywny: nowe pola
  i kolekcje wolno dodawać; zmiana nazwy, typu albo usunięcie pola — nie. v1 musi czytać wszystko, co zapisze v2.
- **Repo jest publiczne.** Żadnych wartości danych, id dokumentów, e-maili, tokenów ani fragmentów sekretów
  w kodzie, logach Actions, artefaktach i dokumentacji.
- Funkcje wdrażaj wyłącznie jako `firebase deploy --only functions:lifexp-v2`. Goły deploy funkcji skasowałby
  stare funkcje, na których działa v1.
- Nie wyłączaj, nie pomijaj i nie oznaczaj jako „skip” testów, żeby CI przeszło.

## v1 (katalog główny)

- Zmiana pliku z listy `STATIC`/`HTML` w `sw.js` → podbij `CACHE` w `sw.js`, inaczej telefony dostaną stary plik.
- Nowy plik, którego v1 używa, musi przejść przez `scripts/build-site.js` (lista `EXCLUDE` to narzędzia, nie aplikacja).
- Testy są hermetyczne (`tests/support/hermetic.js`): żadnego ruchu poza localhost.
- „FPS gameplay” (~8 min, `.github/workflows/fps.yml`) CI uruchamia tylko przy zmianie `fps.html`, jego specu,
  `playwright.config.js` albo zależności; ręcznie z zakładki Actions. Szybkie testy `fps.html` są w jobie „App”.
- `?emulator=1` na localhost podłącza v1 do emulatorów (`firebase-config.js`); na produkcji jest nieaktywne.

## v2 (`v2/`)

Warstwy (PLAN.md 4.2); każda importuje tylko warstwy „pod sobą”, lint to egzekwuje (`v2/eslint.config.js`):

```
app → features → services / stores / offline → data → domain → lib
ui (design system) i i18n nie znają domeny ani danych
```

- Importy między warstwami przez alias `@/` (np. `@/domain/points`), nie przez `../../`.
- Każda zmiana danych przez serwis; serwis = czysta funkcja z `domain` + zapis w transakcji. Domena ma testy.
- Nowe pole Firestore: dodaj je do konwertera z wartością domyślną; istniejących pól nie zmieniaj.
- Zero inline `style` (wyjątek: zmienne CSS, np. `style={{ '--progress': x }}`), zero `innerHTML`/
  `dangerouslySetInnerHTML` poza komponentem Markdown, zero globali na `window`.
- Każdy tekst przez i18n, każda kwota przez `formatMoney`, każda data przez `lib/dates` (od etapu 1/2).
- Ikony tylko obok tekstu, nigdy zamiast niego (D9): `lucide-preact`, w `ui` przez `IconTile` albo jako `svg` z
  `aria-hidden`. Telefon: dolny pasek + drawer (D10). Motywy: LifeXP ciemny/jasny (jasny = styl referencyjny
  właściciela), iOS, Gold (PLAN.md 4.9).
- Firebase SDK w v2 przypięty do 10.12.x, dopóki działa v1. Jedna aplikacja Firebase (`data/firebase.ts`), ładowana
  leniwie; ta sama sesja logowania co v1. `?emulator=1` na localhost działa jak w v1 (`lib/emulator.ts`).
- Testy przeglądarkowe v2 logują się na emulatorach (`tests/support/v2.js`: fixture `account`, `openSignedIn`).
  Service Worker jest w nich zablokowany, poza `tests/v2/offline.spec.js`.
- Service Worker v2: `src/sw.ts` (Workbox, scope `/v2/`, cache `lifexp-v2-*`), rejestracja w `app/pwa.ts`, manifest
  w `vite.config.ts`. v1 `sw.js` może kasować tylko `lifexp-shell-*`.
- Akcent jako tekst albo ikona na powierzchni: `--color-accent-text`, nie `--color-accent` (to wypełnienie).
- Ekran modułu (`view` w `app/registry.ts`) dostaje z routera `RouteProps` (`path`, `params`, `navigate`). Kilka widoków
  jednego modułu przełącza `ViewSwitch` (linki: każdy widok ma własny adres).
- Zapis nie czeka na serwer: serwis zwraca wynik od razu i `saved` (Promise); ekran idzie dalej, a odrzucone `saved`
  zgłasza toastem. Offline zapisy kolejkuje Firestore, a nasłuch pokazuje je od razu.
- Ruch (decyzja właściciela: wszystkie animacje płynne): każda zmiana stanu przechodzi płynnie, nic nie przeskakuje.
  Ruch (przesunięcie, pojawienie się, wzrost) tylko przez `transform` i `opacity`; kolor przy hover/press może
  przechodzić `transition`. Czasy i krzywe wyłącznie z tokenów (`--duration-enter/exit`, `--ease-out/in`);
  wejście zwalnia do miejsca, wyjście jest krótsze. `prefers-reduced-motion` = 0 ms (tokeny robią to same). Czego nie
  zrobi CSS, to `ui/motion.ts` (`playEnter`, `cssDurationMs`). Test: `tests/v2/motion.spec.js`.
- Wykresy: `ui/components/BarChart` (jedna seria, jedna oś od zera, każda wartość także w tekście). Dwie miary
  o różnych jednostkach = dwa wykresy, nigdy dwie osie.

## Praca

- Przed PR: `npm run check --prefix v2` (i `npm test`, gdy ruszasz v1).
- Małe PR-y: jeden element etapu, moduł albo serwis na PR. Opis PR i komentarze w kodzie po polsku albo
  angielsku, tak jak w otaczającym kodzie.
- Commity i opisy PR od AI kończą się linią `Co-Authored-By: Claude …`. **Bez linku do sesji Claude**
  (`claude.ai/code/session_…`) — decyzja właściciela, repo jest publiczne.
