# LifeXP v2 — audyt i plan architektury

Status: **etap 0 zrobiony (9.1); etapy 1+ czekają na akceptację**. Audyt robiony na `main` @ `3250146` (2026-09-01).
Rewizja 2: kod Cloud Functions nieodnaleziony → backend Ex-us odtwarzany od nowa (6.12).
Rewizja 3: decyzje z benchmarku podobnych aplikacji (`RESEARCH.md`, oznaczenia U1-U15) naniesione na sekcje 6 i 7.
Rewizja 4 (2026-09-27): wyniki inwentaryzacji produkcji (`INVENTORY.md`) naniesione na 1.5, 1.11 i 5.2-5.4.
Baseline testów (Playwright, lokalnie w sandboxie): **43/50 zielonych**. 7 failujących to wyłącznie FPS
(timeouty WebGL w headless Chromium). Testy logiki LifeXP (punkty, Money, obowiązki) nie istnieją.

Spis treści

0. [TL;DR](#0-tldr)
1. [Audyt obecnej aplikacji](#1-audyt-obecnej-aplikacji)
2. [Analiza architektury](#2-analiza-architektury)
3. [Plan migracji](#3-plan-migracji)
4. [Architektura LifeXP v2](#4-architektura-lifexp-v2)
5. [Model danych](#5-model-danych)
6. [Architektura Ex-us](#6-architektura-ex-us)
7. [Architektura UI](#7-architektura-ui)
8. [Strategia testowania](#8-strategia-testowania)
9. [Kolejność implementacji](#9-kolejność-implementacji)
10. [Ryzyka](#10-ryzyka)
11. [Rekomendacja i uzasadnienie](#11-rekomendacja-i-uzasadnienie)
12. [Otwarte decyzje](#12-otwarte-decyzje)

---

## 0. TL;DR

1. **Backend zostaje**: ten sam projekt Firebase (`faiobaj4`), Auth, Firestore, reguły, te same kolekcje i pola.
   Zmiany schematu tylko **addytywne** (nowe pola/kolekcje), żadnych rename/delete, dopóki v1 żyje.
2. **Frontend od zera**: Vite + TypeScript (strict) + Preact + signals, hash router, feature-folders.
   Warstwy: `domain` (czysta logika) → `services` (use-case'y w transakcjach) → `data` (repozytoria + konwertery) → `features` (UI).
3. **Strangler, nie big-bang**: v2 buduje się obok v1 pod `/v2/` na tym samym originie i na tych samych danych.
   Przełączenie (cutover) dopiero, gdy każdy moduł przejdzie testy parytetu. v1 zostaje jako fallback pod `/v1/`.
4. **Ex-us**: lokalny silnik komend (parser + registry + handlery) wykonuje wszystko lokalnie.
   AI dostaje **jedno** wywołanie na wiadomość (dziś są trzy: classify → chat → ping) i zwraca
   ustrukturyzowane `actions[]` w tym samym formacie, co sparsowana komenda `/...`. Obie ścieżki zbiegają się
   w jednym pipeline → zero duplikacji logiki. Siri-ous usunięty.
5. **UI bez ikon**: typografia, karty, spacing, design tokens. Desktop: stały sidebar. Telefon: wysuwany
   drawer z lewej (zachowanie jak ChatGPT: top bar + przycisk Menu, edge-swipe, scrim, back zamyka).
6. **Najważniejsze znalezione problemy** (szczegóły w 2.3): zapisy wielodokumentowe bez transakcji (dryf salda
   i punktów), mieszanie dat UTC i lokalnych, Service Worker cache-first dla modułów JS (stare JS po deployu,
   martwy start offline), zadania z Ex-us zapisywane do `plannerTasks`, którego nic nie wyświetla,
   **push i raport tygodniowy nie działają od 25.07** (nieważny klucz konta serwisowego), a od 19.08 nie ma też
   workflowów GitHub Actions ani CI,
   **brak kodu Cloud Functions w repo** (decyzja: odtwarzamy tylko nowy backend v2, stare funkcje działają dalej dla v1 — 6.12).

---

## 1. Audyt obecnej aplikacji

### 1.1 Struktura repozytorium

| Plik | Linie | Rola |
|---|---:|---|
| `app.html` | 2649 | Cała SPA: ~1350 linii inline CSS + markup wszystkich stron i modali |
| `core.js` | 697 | Bootstrap Firebase, auth gate, `MODULE_REGISTRY`, nawigacja `showPage`, i18n, helpery, mutowalne singletony `currentUser`/`userProfile` |
| `dashboard.js` | 517 | Dashboard, cele (goals), poziom, streak + freeze, osiągnięcia, lista ostatnich aktywności, `revertActivityPoints` |
| `activities.js` | 492 | Log aktywności, log grania, sklep (martwy), generator „Co teraz?” |
| `history-stats.js` | 277 | Wykres tygodnia, TOP aktywności, ciekawostki, historia z paginacją, statystyki, reset dnia |
| `chores.js` | 323 | Obowiązki: definicje (seed), wpisy, kalendarz, „dziś/wczoraj”, rozliczenie → Money |
| `money.js` | 655 | Money: saldo, transakcje, kategorie, pożyczki, limit miesięczny, licznik wpływów |
| `notes.js` | 723 | Notatnik: notatki (Markdown, archiwum) + zadania (todos) + mechanika „budowy PC” |
| `assistants.js` | 762 | Siri-ous (żart, localStorage) + Ex-us (Gemini przez Cloud Functions) |
| `settings.js` | 760 | Tryb konta, onboarding modułów, akordeon, profil, ekonomia, definicje, motywy, fonty, email rodzica, push, godziny powiadomień |
| `bug-reports.js` | 446 | Zgłoszenia błędów (1/dzień, bonus, filtr spamu), panel admina, wątki |
| `updates.js` | 387 | „Co nowego?”, historia aktualizacji (CHANGELOG), broadcasty (baner na żywo) |
| `offline.js` | 207 | Kolejka szkiców offline w localStorage + przegląd i zatwierdzanie |
| `i18n-resources.js` | 814 | Słownik EN/PL (i18next) |
| `games.js` | 2621 | Mini-gry offline (Coins, Snake, 2048, Redstone), IIFE, zero Firestore |
| `fps.html` | 3147 | Samodzielny prototyp FPS (Three.js z unpkg), link powrotny do `app.html` |
| `index.html` | 265 | Logowanie/rejestracja (email+hasło, Google) |
| `verify.html` | 200 | Weryfikacja emaila kodem (EmailJS, kod w pamięci przeglądarki) |
| `parent.html` | 376 | Panel rodzica (read-only), własna kopia logiki formatowania |
| `sw.js` | 110 | Service Worker: FCM background + app-shell cache |
| `style.css` | 506 | Zmienne motywów (LifeXP/Apple/Gold), przyciski, modale, toast, animacje |
| `firestore.rules` | 125 | Reguły: owner full, rodzic read-only (bez prywatnych danych Money), admin bugów po emailu |
| `scripts/*.js` | 236 | Push co godzinę + raport tygodniowy (Admin SDK, uruchamiane przez GitHub Actions) |
| `tests/` | ~2800 | Playwright: Redstone, FPS, offline SW, Ex-us (na **kopii** kodu w harnessie) |
| `firebase.json` | 16 | Konfiguracja `functions/` — **katalog nie istnieje** |

Hosting: GitHub Pages (`szymonrogalski098-collab.github.io/lifexp-app/`), brak build stepu, Firebase SDK 10.12.0
ładowane jako moduły ES z `gstatic.com`, i18next/EmailJS/Tabler Icons/marked/DOMPurify z jsDelivr.

### 1.2 Boot i autoryzacja

Sekwencja w `core.js:350-427` (`onAuthStateChanged`):

1. Brak usera → `index.html`.
2. `loadProfile()` — czyta `users/{uid}`; jeśli brak dokumentu, tworzy go (self-heal po logowaniu Google).
3. `syncLangWithProfile()` — język z profilu wygrywa z localStorage.
4. Brama weryfikacji: `userProfile.emailVerified` (pole w Firestore, zapisywalne przez ownera) → `verify.html`.
5. Brama trybu konta (`accountMode` solo/supervised) → modal.
6. Brama onboardingu (`enabledModules` undefined) → modal wyboru modułów.
7. `renderModuleNav()`, `loadActivityDefs()` (seed przy pierwszym użyciu), `loadDashboard()`.
8. Po starcie: „Co nowego?”, nasłuch broadcastów, baner offline, przegląd szkiców offline.

Auth: Firebase Auth (email+hasło, Google popup). Weryfikacja emaila to **własny mechanizm** (EmailJS + kod
w pamięci `verify.html`), a nie `sendEmailVerification` Firebase. Flaga `emailVerified` w Firestore jest
zapisywalna przez użytkownika, więc brama jest kosmetyczna. Admin = twardo zakodowany email
(`bug-reports.js:21`, `firestore.rules:34`). Rodzic = konto, którego email równa się `parentEmail` dziecka.

### 1.3 Routing i nawigacja

- Brak routera i URL-i. `window.showPage(id)` (`core.js:528-570`) przełącza klasę `.active` na `div.page`
  i odpala `load*()` danego ekranu. Brak historii przeglądarki: przycisk wstecz na Androidzie zamyka apkę.
- Nawigacja budowana z `MODULE_REGISTRY` (`core.js:45-76`): sidebar (desktop) + dolny pasek (<700 px).
  Poniżej 700 px sidebar jest całkowicie ukryty (`app.html:702-707`), więc każda strona musi mieć wpis
  w dolnym pasku — dokładnie to spowodowało bug „moduł nie widoczny na telefonie” (`core.js:69-73`).
- Na telefonie dolny pasek ma do 8 pozycji po 10 px tekstu (Home, Obowiązki, Money, Gry, Historia,
  Notatnik, Asystenci, Ustawienia).
- Strony poza nawigacją: `log-activity`, `log-gaming`, `generator` (przyciski na dashboardzie),
  `report-bug`, `broadcasts`, `update-history` (hub), `shop` (**nieosiągalna** — martwy kod).

### 1.4 Moduły funkcjonalne

| Obszar | Gdzie | Co robi | Dane |
|---|---|---|---|
| Dashboard / XP | `dashboard.js`, `activities.js`, `history-stats.js` | Saldo punktów + PLN, poziom (500 XP/poziom), streak z „zamrożeniem” raz na 7 dni, dzienny limit punktów, wykres 7 dni, TOP 5, ciekawostki, 14 osiągnięć, log aktywności (pkt/h × czas, cap dzienny), log grania, generator | `users/{uid}.points`, `activities`, `dailyLog`, `gamingSessions`, `activityDefs` |
| Chores | `chores.js` | Definicje (seed 8 szt., jednorazowe znikają po użyciu), dodawanie z bottom-sheetu, pytanie „dziś/wczoraj”, kalendarz miesiąca, „do wypłaty”, rozliczenie → przychód w Money | `choreDefs`, `chores`, `chorePayouts`, `moneyTransactions`, `money/balance` |
| Money | `money.js` | Saldo PLN (nie może zejść < 0), transakcje income/expense (expense zdejmuje też punkty), kategorie (seed), pożyczki lent/borrowed ze spłatami, limit miesięczny, archiwum miesięcy | `money/settings`, `money/balance`, `moneyTransactions`, `moneyCategories`, `moneyLoans`, `users.moneyIncomeAllTime` |
| Goals | `dashboard.js:49-250` | Do 3 celów (punktowe albo pieniężne); pieniężne mają `saved` — wpłata zdejmuje saldo Money, usunięcie celu zwraca | `users/{uid}.goals[]` |
| Tasks / To Do | `notes.js:561-683` | Max 30 zadań, termin (wymagany, nie w przeszłości), rozmiar S/M/L = 1/2/3 „kawałki” budowy PC; zrobione w terminie dodaje kawałki, przeterminowane zabiera jeden | `todos`, `users.pcBuild` |
| Notes | `notes.js:370-559` | Max 30 aktywnych, Markdown (marked + DOMPurify), archiwum, ikona/kolor, long-press menu | `notes` |
| Bugs | `bug-reports.js` | 1 zgłoszenie/dzień + bonus za zaakceptowane, filtr spamu słowami kluczowymi, wątek wiadomości, panel admina (4 zakładki), auto-kasowanie spamu po 12 h (leniwie) | `bugReports`, `bugReportsConfig/keywords`, `users.lastBugReportAt` |
| Reports | `parent.html`, `scripts/send-weekly-report.js`, `settings.js` | Panel rodzica read-only; raport tygodniowy email (EmailJS REST); push reminders | `users` (query po `parentEmail`), `autoReport`, `notifHours`, `fcmTokens` |
| Updates / broadcasty | `updates.js` | Modal „Co nowego?” raz na wersję, pełny changelog, broadcasty admina jako baner (live `onSnapshot`) | `broadcasts` |
| Settings | `settings.js` | Moduły, motyw (3), font (4), język, tryb konta, profil, email rodzica z kodem, raport, powiadomienia + godziny, limit dzienny, ekonomia (dwa kursy pkt→zł), definicje obowiązków/aktywności, gry | `users/{uid}` + definicje |
| Assistants | `assistants.js` | Siri-ous (losowe żarty, localStorage) + Ex-us (Gemini) — patrz 1.9 | localStorage + backend |
| Games | `games.js`, `fps.html` | 4 gry canvas + FPS; rekordy w localStorage; zero Firestore | localStorage |
| Offline | `offline.js` | Wpisy offline (aktywność, granie, obowiązek, transakcja) jako szkice; zatwierdzane ręcznie po powrocie online ze świeżym stanem serwera (celowy design) | `localStorage['lifexp-offline-queue']` |

### 1.5 Model danych (stan faktyczny)

`users/{uid}` — dokument profilu (wszystko w jednym dokumencie):

| Pole | Typ | Uwagi |
|---|---|---|
| `name`, `email`, `createdAt` | string | `createdAt` jako ISO string |
| `points.{total, earnedAllTime, spentAllTime}` | number | Zdenormalizowane liczniki, aktualizowane z ~8 miejsc |
| `dailyLimit` | number | Domyślnie 150 |
| `pointsRateGeneralZl/Pts`, `pointsRateChoresZl/Pts` | number | Kursy pkt → zł (domyślnie 1 zł/10 pkt i 0,45 zł/1 pkt) |
| `goals[]` | `{id, name, type:'points'\|'money', amount, celebrated, saved}` | Max 3; legacy pola `goalName/goalType/goalAmount/...` migrowane leniwie |
| `achievements[]` | string[] | Id osiągnięć |
| `streakFreezeLastUsed` | `YYYY-MM-DD` | Data UTC |
| `moneyIncomeAllTime` | number | Backfill leniwy z transakcji |
| `pcBuild` | `{componentOrder[6], progress{}, currentComponentIndex}` | |
| `enabledModules[]`, `onboardingDone`, `accountMode`, `lang` | | |
| `parentEmail`, `parentEmailVerifiedAt`, `pendingParentEmail`, `parentEmailCode`, `parentEmailCodeExpiry` | | Kod weryfikacyjny leży w dokumencie czytelnym dla usera |
| `autoReport`, `lastReportSent`, `notifHours[]`, `games[]`, `lastBugReportAt`, `emailVerified` | | |
| `aiSettings` | `{lastResetDate, tokensUsedToday}` | Zapisywalne tylko przez Cloud Function |

Podkolekcje `users/{uid}/…`:

| Kolekcja | Kształt dokumentu | Klucz / uwagi |
|---|---|---|
| `activities` | `{type, typeName?, duration, points, desc, timestamp: Timestamp}` | `type` = id z `activityDefs` albo `__generated__` |
| `activityDefs/{id}` | `{name, points (pkt/h), color, icon ('ti-*'), order}` | Seed z id `learning`, `project`… |
| `dailyLog/{YYYY-MM-DD}` | `{pointsEarned, gamingMinutes}` | **Klucz liczony w UTC** |
| `gamingSessions` | `{game, duration, date, timestamp}` | |
| `purchases` | `{description, amount, pointsCost, timestamp}` | Legacy „sklep”; UI martwe, czytane przez `parent.html` i raport |
| `chores` | `{choreId, choreName, choreEmoji, points, dateISO, monthKey, createdAt}` | `dateISO` **lokalne**; kasowane przy rozliczeniu |
| `choreDefs/{id}` | `{name, desc, emoji, points, oneTime, order}` | |
| `chorePayouts` | `{points, amountPln, fromISO, toISO, createdAt}` | Trwała historia wypłat |
| `money/settings`, `money/balance` | `{monthlyLimit, currency}`, `{current}` | Saldo zdenormalizowane; w części kont legacy `pendingPoints` (usunięte „Wypłać punkty”) |
| `moneyTransactions` | `{type, amount, category (NAZWA), note, date, source, pointsCost, createdAt}` | `source`: `manual`\|`chore_payout` |
| `moneyCategories` | `{name, color, icon}` | Transakcje wskazują kategorię **po nazwie** |
| `moneyLoans` | `{person, amount, repaidAmount, direction, note, date, createdAt, completedAt}` | Ruszają saldo **bez** wpisu w transakcjach |
| `notes` | `{title, content, icon, color, createdAt (ISO), archived}` | |
| `todos` | `{text, size, dueDate, done, createdAt (ISO), penaltyApplied}` | |
| `fcmTokens/{token}` | `{token, createdAt, ua}` | |
| `plannerTasks` | `{title, time, durationMin, type, points, dateISO, done, activityId: null, createdAt}` | **Osierocone**: UI usunięte 24.08, ale `aiConfirmTask` nadal tu pisze |
| `aiConversations` | `{messages[{role, text}], updatedAt}` | Historia czatu Ex-us zapisywana przez backend (klient v1 jej nie czyta); rodzic ma do niej odczyt przez regułę `{col}/{docId}` |
| `moneyGoals` | legacy | Czytane tylko przez skrypt raportu |

Top-level: `bugReports`, `bugReportsConfig/keywords`, `broadcasts`, `aiTestAccess/{uid}`, `aiUsageGlobal/{date}` (`{totalTokens}`).
Do 2026-09-29 była też `aiTestAccces/{uid}` (literówka, 1 dokument). Jej uid był też w `aiTestAccess`, więc
właściciel ją usunął; nic jej nie czytało. Stan faktyczny policzony
na produkcji: `INVENTORY.md`.

### 1.6 Operacje CRUD

| Encja | Create | Read | Update | Delete | Efekty uboczne (zapisy w innych miejscach) |
|---|---|---|---|---|---|
| Aktywność | `logActivity`, szkic offline | ostatnie 5, 50 (TOP), **wszystkie** (historia) | — | `deleteActivity` | `dailyLog.pointsEarned`, `users.points.*` |
| Sesja grania | `logGaming`, szkic | ostatnie 30 | — | tak | `dailyLog.gamingMinutes` |
| Zakup (legacy) | martwe UI | parent, raport | martwe UI | martwe UI | `users.points.*` |
| Def. aktywności | Ustawienia, seed | wszystkie | — | tak (historia traci nazwę) | — |
| Wpis obowiązku | sheet, szkic | wszystkie nierozliczone | — | tak | jednorazowa def. kasowana |
| Def. obowiązku | Ustawienia, seed | wszystkie | — | tak | — |
| Rozliczenie | `settleChores` | wszystkie | — | — | payout + kasowanie N wpisów + transakcja + saldo + `moneyIncomeAllTime` |
| Transakcja | `saveMoneyTx`, szkic, rozliczenie | **wszystkie** | — | tak | saldo, `points.*`, `moneyIncomeAllTime`, osiągnięcia |
| Kategoria | Ustawienia, „nowa” w formularzu, seed | wszystkie | — | tak | — |
| Pożyczka | tak | wszystkie | spłata | tak | saldo |
| Cel | formularz, `aiConfirmGoal` (backend) | z profilu | edycja, wpłata | tak | saldo Money (wpłata/zwrot) |
| Zadanie (todo) | formularz | wszystkie | edycja, done | **brak w UI** | `users.pcBuild`, kara przy wejściu w zakładkę |
| Notatka | edytor | wszystkie | edycja, archiwum | tak | — |
| Zgłoszenie błędu | formularz | własne / wszystkie (admin) | wiadomości, status | admin | `users.lastBugReportAt`, bonus |
| Broadcast | admin | live 10 ostatnich | — | admin | — |
| Profil/ustawienia | self-heal, rejestracja | `loadProfile` po każdym zapisie | wiele | — | — |

### 1.7 Dane lokalne (localStorage)

| Klucz | Zawartość | Uwagi dla v2 |
|---|---|---|
| `lifexp-offline-queue` | Szkice offline | **Musi być czytany przez v2** (niezatwierdzone wpisy użytkownika) |
| `lifexp-theme`, `lifexp-font`, `lifexp-lang` | Preferencje | Migrować wartości przy pierwszym starcie v2 |
| `lifexp-exus-history`, `lifexp-exus-conversation-id` | Historia Ex-us | **Nie per-user** — inne konto na tym samym urządzeniu widzi cudzą historię |
| `lifexp-aichat-chats`, `lifexp-aichat-history`, `lifexp-aichat-active` | Siri-ous | Do usunięcia przy cutover |
| `lifexp-bug-read`, `lifexp-seen-broadcasts`, `lifexp-seen-version`, `lifexp-settings-collapsed` | Stan UI | Przenieść `seen-broadcasts` (żeby banery nie wróciły) |
| `lifexp-game-highscore-*`, `lifexp-redstone-world` | Gry | Zachować bez zmian (gry zostają) |

Dodatkowo: Firestore `persistentLocalCache` (IndexedDB, single-tab), cache Service Workera `lifexp-shell-v54`.

### 1.8 Zależności między modułami

```
core ──imports──▶ activities, assistants, bug-reports, chores, dashboard, history-stats,
                  money, notes, offline, settings, updates
każdy moduł ──imports──▶ core            (cykl: core ↔ wszystko)
dashboard ↔ money                         (cykl: cele ↔ saldo)
dashboard ↔ history-stats                 (cykl)
chores → money, offline → money + dashboard, assistants → dashboard, settings → chores
```

- Wspólny, mutowalny stan: `userProfile` jest modyfikowany z 8 plików (goals, pcBuild, achievements,
  `moneyIncomeAllTime`, `accountMode`, `notifHours`…). Nie ma jednego właściciela.
- ~133 funkcje na `window.*` wołane z `onclick="..."` w stringach HTML. `core.js` woła `loadMoney`,
  `updateGameSelect`, `loadGamingHistory` bez importu, jako globale.
- Odświeżanie widoków jest ręczne: po zapisie woła się `loadProfile()` + `loadDashboard()` + `load*()`.
  `refreshDynamicI18n()` (`core.js:194-220`) to ręczna lista „co przerysować po zmianie języka”.

### 1.9 Assistants: Siri-ous i Ex-us

- **Siri-ous** (`assistants.js:5-351`, CSS `app.html:913-1078`): ~100 losowych żartobliwych odpowiedzi,
  słowa-klucze, wiele czatów, wszystko w localStorage. Do usunięcia.
- **Ex-us** (`assistants.js:353-761`): Gemini przez Cloud Functions (`httpsCallable`):

```
wiadomość usera
  ├─▶ aiClassifyIntent({message})           — wywołanie 1 (zawsze)
  │     ├─ intent:"task" + proposal  → karta → aiConfirmTask(...)   → zapis do plannerTasks (niewidoczne!)
  │     ├─ intent:"goal" + proposal  → karta → aiConfirmGoal(...)   → zapis do users.goals (backend)
  │     └─ intent:"chat" [+ note]
  ├─▶ aiAssistantChat({message, conversationId})   — wywołanie 2 (dla "chat")
  └─▶ aiAssistantPing()                            — wywołanie 3 (zawsze, tylko pasek limitu tokenów)
```

  Czyli 2-3 wywołania backendu na wiadomość, z czego co najmniej dwa idą do Gemini. Zapis celów/zadań
  robi backend (Admin SDK), więc logika celów istnieje w **dwóch** miejscach (klient + funkcja).
  Historia czatu w localStorage bez klucza uid. Markdown przez marked + DOMPurify (poprawnie sanityzowany).

### 1.10 Responsywność i mobilny layout

- Jeden breakpoint 700 px: sidebar 220 px ↔ dolny pasek. Brak stanu pośredniego (tablet).
- `meta viewport ... maximum-scale=1, user-scalable=no` (`app.html:9`) — zablokowany zoom (dostępność),
  wprowadzony jako obejście auto-zoomu iOS na polach < 16 px.
- `100vh` zamiast `100dvh` w oknach czatu (`app.html:951`, `1134`) — na telefonie pasek adresu/klawiatura
  zasłania pole wpisywania.
- FAB-y `position:fixed` zasłaniają treść; łatane `padding-bottom: 96px` per strona (`app.html:462-467`, `519`).
- `overflow-x: hidden` na `html, body` maskuje przepełnienia zamiast im zapobiegać; historia commitów pokazuje
  serię poprawek „coś wystaje poza prawą krawędź” (Siri-ous, Redstone, strona zgłoszeń).
- `#toast { white-space: nowrap }` (`style.css:429`) — długi komunikat wychodzi poza ekran telefonu.
- Dużo stylów inline w HTML i w szablonach JS — brak jednego źródła wymiarów/odstępów.
- Google Fonts: 5 rodzin ładowanych blokująco przez `@import` (Inter, JetBrains Mono, Manrope, Plus Jakarta, Poppins).

### 1.11 Backend i infrastruktura poza kodem aplikacji

- **Cloud Functions nie ma w repo.** `firebase.json` wskazuje `functions/`, katalog nie istnieje; historia gita
  go nigdy nie zawierała. Wdrożone funkcje: `aiClassifyIntent`, `aiAssistantChat`, `aiAssistantPing`,
  `aiConfirmTask`, `aiConfirmGoal` (+ prawdopodobnie zarządzanie `aiTestAccess`/`aiSettings`).
- **Klucz konta serwisowego w sekrecie `FIREBASE_SERVICE_ACCOUNT` był nieważny od 2026-07-25**: od tego dnia
  każde uruchomienie `notify.yml` (push reminders) kończyło się błędem uwierzytelnienia (`16 UNAUTHENTICATED`),
  a `weekly-report.yml` używał tego samego sekretu. Klucz odnowiony 2026-09-27.
- **`.github/workflows` usunięte** w commicie `d841f58` (2026-08-19, seria „Delete … / Add files via upload”).
  Z wysokim prawdopodobieństwem przypadkowo (upload przez przeglądarkę pomija katalogi zaczynające się od
  kropki). Skutek: od 19.08 nie uruchamiają się ani push i raport (i tak już zepsute kluczem), ani CI (`test.yml`).
- Skrypt raportu jest i tak nieaktualny: czyta legacy `moneyGoals` i `purchases`, liczy PLN jako `/10`
  na sztywno (`scripts/send-weekly-report.js:54,132,146`).
- EmailJS: publiczny klucz w kliencie, szablony `template_f2b4jeo` (kod), `template_jztwowz` (raport).

### 1.12 Testy

- 50 testów Playwright: Redstone (gry), FPS (7 failuje lokalnie — timeouty WebGL), SW offline (3),
  Ex-us (5) — ale Ex-us jest testowany na **ręcznie skopiowanym** kodzie w `tests/fixtures/exus-harness.html`,
  bo prawdziwe moduły importują Firebase z `gstatic.com`. Harness już się rozjechał z produkcją
  (test nadal mówi o „planner refresh”).
- Zero testów domeny: punkty, limity, streak, Money, pożyczki, rozliczenia, cele, budowa PC.

---

## 2. Analiza architektury

### 2.1 Co jest dobre (i przechodzi do v2 jako idea)

- **Model danych per-user w podkolekcjach** + reguły owner/parent — prosty, bezpieczny, skalowalny dla tej apki.
- **Rejestr modułów** (`MODULE_REGISTRY`) jako jedno źródło dla nawigacji, onboardingu i ustawień —
  dobry pomysł, w v2 rozszerzony o routing, komendy Ex-us i kontekst AI.
- **Denormalizacja nazw** (`choreName`, `typeName`) — historia przeżywa usunięcie definicji.
- **Celowy design offline** (szkice zatwierdzane online ze świeżym stanem) — poprawny dla operacji
  z limitami (dzienny limit, saldo ≥ 0). v2 zachowuje semantykę.
- **Mechanika budowy PC** w `notes.js:33-99` — już napisana jako czyste funkcje (stan in → stan out).
  Wzorzec, który v2 rozciąga na całą domenę.
- **Sanityzacja Markdown** (marked → DOMPurify, fallback na escape) — poprawna.
- **i18n przez i18next** z kompletnym słownikiem EN/PL — treść do przeniesienia 1:1.
- **Brama boot + ekran ładowania bez FOUC**, **reduced-motion** respektowane.
- Gry: kompletne, przetestowane, izolowane od danych — zostają jako moduł ładowany leniwie.

### 2.2 Problemy strukturalne (dlaczego obecna architektura blokuje rozwój)

1. **Brak warstw.** Każda funkcja robi naraz: odczyt DOM → walidację → logikę domeny → zapisy Firestore →
   odświeżenie widoków → toast. Nie da się przetestować logiki bez przeglądarki i Firebase, więc testów domeny nie ma.
2. **Stan globalny i mutowalny** (`userProfile`, zmienne modułów) + ręczne przerysowywanie → klasa bugów
   „widok pokazuje stare dane” i konieczność pamiętania, co odświeżyć po każdej operacji.
3. **HTML w stringach + `innerHTML` + `onclick="fn('${id}')"`**: escapowanie ręczne (łatwo pominąć — np.
   `activities.js:253`), brak typów, kolizje nazw na `window`, niemożliwy tree-shaking.
4. **Operacje wielodokumentowe bez transakcji.** Jedna akcja użytkownika = 3-6 osobnych zapisów; błąd
   w połowie zostawia niespójność, której nic nie wykrywa ani nie naprawia.
5. **Logika zduplikowana** w 4 miejscach: `app` (klient), `parent.html` (własne kursy i lista aktywności),
   skrypt raportu (własne kursy i legacy kolekcje), Cloud Functions (cele). Każda kopia już się rozjechała.
6. **Importy z CDN po URL** uniemożliwiają testy jednostkowe prawdziwego kodu (dowód: harness z kopią Ex-us)
   i przypinanie wersji w lockfile.
7. **Layout łatany punktowo** (inline style, `position:fixed`, magiczne `padding-bottom`, `overflow-x:hidden`,
   blokada zoomu) zamiast systemu (tokeny, jeden shell, reguły przepełnień).
8. **Dla AI**: pliki po 500-2600 linii, niejawne zależności przez `window`, brak kontraktów. Model musi
   wczytać ogromny kontekst, żeby bezpiecznie zmienić jedną rzecz — i nadal nie ma kompilatora, który złapie
   literówkę w nazwie pola `'points.total'`.

### 2.3 Rejestr problemów technicznych i źródeł bugów

| # | Problem | Gdzie | Skutek | Jak v2 to rozwiązuje |
|---|---|---|---|---|
| B1 | SW: moduły JS nie są w precache, a strategia dla nich to cache-first | `sw.js:37`, `100-108` | Po deployu bez podbicia `CACHE` telefon trzyma stary JS z nowym HTML (niespójne wersje). Po podbiciu cache i starcie offline: HTML jest, `core.js` nie → wieczny ekran ładowania | Workbox precache z hashowanymi nazwami plików, atomowa aktualizacja wersji |
| B2 | Klucze dni w UTC (`todayStr` = `toISOString`) vs lokalne (`dateISOLocal`) | `core.js:581`, `dashboard.js:269`, `history-stats.js:13` vs `chores.js`, `notes.js` | W PL między 00:00 a 01:00/02:00 aktywność liczy się do limitu i wykresu **poprzedniego** dnia; streak liczony w innym kalendarzu niż obowiązki i zadania | Jedna funkcja `dayKey()` w `lib/dates.ts`, przełączenie na czas lokalny przy cutover (5.4, M4) |
| B3 | Zapisy wielodokumentowe bez transakcji/batcha | `activities.js:70-87`, `chores.js:135-172` (błędy kasowania połykane w 150-152), `money.js:266-281`, `dashboard.js:208-224` | Częściowy zapis = dryf punktów/salda; przy rozliczeniu obowiązków możliwa podwójna wypłata albo utrata wpisów | Każdy use-case w `runTransaction`/`writeBatch` |
| B4 | Saldo Money i cofanie punktów jako read-modify-write | `money.js:53-58`, `dashboard.js:476-495` | Dwa urządzenia/karty jednocześnie → utracona aktualizacja; clamp do 0 powoduje, że liczniki przestają zgadzać się z historią | Transakcje Firestore; clamp zostaje, ale jawnie w domenie i przetestowany |
| B5 | Zadania z Ex-us trafiają do `plannerTasks` | `assistants.js:689-691` | Użytkownik widzi „Dodano zadanie”, ale zadanie nigdzie się nie pojawia | `/create-task` pisze lokalnie do `todos` |
| B6 | Ex-us: 2-3 wywołania backendu na wiadomość | `assistants.js:607-666` | Koszt tokenów, opóźnienie, limit dzienny zjadany przez klasyfikację | Jedno wywołanie z function calling + usage w odpowiedzi |
| B7 | Historia Ex-us/Siri-ous w localStorage bez uid | `assistants.js:195`, `363-364` | Po zmianie konta na tym samym urządzeniu widać cudzą rozmowę i `conversationId` | Magazyn per-uid, czyszczony przy wylogowaniu |
| B8 | `Notification.permission` bez sprawdzenia istnienia API | `settings.js:712` (wołane z `core.js:567`) | iOS Safari bez instalacji PWA: `ReferenceError` przy wejściu w Ustawienia, reszta inicjalizacji (akordeon) się nie wykonuje | Capability checks w jednym module `platform.ts` |
| B9 | Moduły jako lista „włączonych” | `core.js:83-86` | Konta z onboardingiem sprzed 24.08 mają `planner` zamiast `notes` → **Notatnik ukryty**, dopóki user sam go nie włączy | Lista „wyłączonych” + migracja M3 |
| B10 | `parent.html` z twardymi kursami i listą aktywności | `parent.html:137-138`, `234` | Rodzic widzi złe kwoty PLN przy zmienionych kursach; cele pieniężne pokazują saldo zamiast `saved` | Widok rodzica jako route v2 korzystający z tej samej domeny |
| B11 | Raport tygodniowy na legacy danych + workflowy usunięte | `scripts/send-weekly-report.js`, brak `.github/workflows` | Raport nie wychodzi; gdyby wychodził, pokazywałby błędne dane | Przepisany skrypt na wspólnej domenie + przywrócone workflowy |
| B12 | Kod weryfikacji emaila rodzica w dokumencie usera | `settings.js:465-469` | Dziecko może odczytać kod albo wpisać `parentEmail` bezpośrednio — weryfikacja jest kosmetyczna | Kod generowany i sprawdzany w Cloud Function (etap 6) |
| B13 | Wątek zgłoszenia jako read-modify-write tablicy | `bug-reports.js:169-172` | Równoczesna odpowiedź admina i usera → jedna ginie | `arrayUnion` |
| B14 | Strona `shop` nieosiągalna | `activities.js:282-441`, `app.html:1583-1608` | Martwy kod, ale `purchases` nadal czytane (rodzic, raport, `spentAllTime`) | Niepotrzebne w v2; kolekcja zostaje (read-only) |
| B15 | Zapisy w trakcie renderu | `dashboard.js:80-85` (cel „osiągnięty”), `305-308` (zużycie freeze) | Samo otwarcie dashboardu pisze do Firestore; wielokrotny render = wielokrotne zapisy | Efekty tylko w serwisach, wywoływane jawnie |
| B16 | Odczyty całych kolekcji | `dashboard.js:272-277` (cały `dailyLog`), `history-stats.js:171-176` (wszystkie aktywności), `money.js:108-113` (wszystkie transakcje), `history-stats.js:245-249` (7 sekwencyjnych `getDoc`) | Koszt i czas ładowania rosną liniowo z historią | Zapytania z zakresem dat, paginacja kursorem, subskrypcje |
| B17 | Usunięcie definicji aktywności | `core.js:282` | Historia pokazuje surowe id zamiast nazwy | Soft-delete (`archived: true`) zamiast kasowania |
| B18 | Kategoria transakcji po nazwie | `money.js:268` | Nie da się zmienić nazwy kategorii bez „osierocenia” transakcji | Zostaje (kompatybilność); zmiana nazwy jako jawna migracja wsadowa |
| B19 | Testy Ex-us na kopii kodu | `tests/fixtures/exus-harness.html` | Fałszywe poczucie pokrycia | Vitest importuje prawdziwe moduły; Firebase za interfejsem |
| B20 | Blokada zoomu + 100vh + nowrap toast | `app.html:9`, `951`, `1134`, `style.css:429` | Dostępność, zasłonięte pole czatu, ucięte komunikaty | Pola ≥ 16 px, `dvh`, toast wielowierszowy |
| B21 | i18n niepełne | `assistants.js` (PL na sztywno), `parent/index/verify.html` (tylko PL), `toLocaleDateString('pl-PL')` w kilku miejscach | EN użytkownik widzi mieszankę języków | Wszystkie teksty przez i18n, `Intl` z aktywnym locale |
| B22 | Rodzic może czytać `notes` i `todos` | `firestore.rules:57-67` | Prywatne notatki technicznie dostępne dla rodzica (UI ich nie pokazuje) | Wykluczenie w regułach (etap 8) — do decyzji |
| B23 | Firebase SDK z innego originu | `core.js:1-9` | SW go nie cache'uje; start offline zależy od cache HTTP przeglądarki | SDK w bundlu, precache |

### 2.4 Kod: zachować / przenieść logikę / przepisać / usunąć

**Zachować bez zmian (na początek):**
`firestore.rules`, dane konfiguracyjne Firebase (`firebase-config.js`), `games.js` (cały silnik; w v2 owinięty
w lazy moduł), `fps.html` (samodzielna strona), testy Redstone/FPS, `email-templates/weekly-report.html`,
ikony i logo, `manifest.json` (aktualizacja pól przy cutover).

**Przenieść logikę 1:1 (przepisać w TS, zachować semantykę — z testami „golden”):**

| Logika | Źródło | Uwagi |
|---|---|---|
| Punkty za aktywność i cap dzienny | `activities.js:113-125` | `round(min/60 × pkt/h)`, `min(earned, max(0, limit − today))`, min. 5 min |
| Poziom | `dashboard.js:253-266` | 500 XP/poziom, tytuły z i18n |
| Streak + freeze | `dashboard.js:268-359` | Freeze raz na 7 dni, przeskakuje jedną lukę; start od wczoraj, jeśli dziś 0 |
| Osiągnięcia | `dashboard.js:362-418` | 14 progów, dopisywanie bez odbierania |
| Obowiązki: „dziś/wczoraj”, jednorazowe, rozliczenie | `chores.js:266-309`, `135-172` | Rozliczenie po **bieżącym** kursie |
| Money: saldo ≥ 0, koszt w punktach, pożyczki, limit miesięczny | `money.js` | Pożyczki bez wpisu w transakcjach (patrz 5.4 M6) |
| Cele: max 3, wpłata z salda, zwrot przy usunięciu/zmianie typu | `dashboard.js:176-250` | |
| Budowa PC (kawałki, kara) | `notes.js:33-137` | Już czyste funkcje — port prawie dosłowny |
| Szkice offline (payloady) | `offline.js` | Te same kształty i ten sam klucz localStorage |
| Zgłoszenia: 1/dzień, bonus, spam, TTL 12 h | `bug-reports.js` | |
| Kolejka broadcastów, „Co nowego?” | `updates.js` | CHANGELOG jako dane |
| Brama boot (kolejność kroków) | `core.js:350-427` | |
| Seedy (aktywności, obowiązki, kategorie) | `core.js:288-294`, `chores.js:19-28`, `money.js:92` | Te same id, żeby historia się nie zgubiła |

**Przepisać od zera:** cały HTML/CSS, nawigacja, globalne `window.*`, SW, klient Ex-us, `parent.html`,
formularze, modale, toasty, integracja i18n (sam słownik zostaje), `index.html`/`verify.html`.

**Usunąć:** Siri-ous (kod, CSS, klucze localStorage), Tabler Icons, strona `shop`, przełącznik asystentów,
dolny pasek nawigacji, pozostałości Plannera, fonty ładowane „na zapas”.

---

## 3. Plan migracji

### 3.1 Strategia: strangler fig na tym samym originie

Intuicja: zamiast wyłączyć stary dom i budować nowy, stawiamy nowy obok, na tych samych fundamentach (dane),
i przeprowadzamy się pokój po pokoju. Stary dom stoi, dopóki nowy nie jest w pełni zamieszkany.

Mechanika:

1. v2 jest budowane przez Vite i wdrażane przez GitHub Actions na **ten sam** GitHub Pages pod ścieżką
   `/lifexp-app/v2/`. v1 zostaje w katalogu głównym bez zmian.
2. v1 i v2 korzystają z tego samego projektu Firebase, tych samych kont i tych samych kolekcji.
3. Moduł w v2 jest „gotowy”, gdy przejdzie testy parytetu (sekcja 8.3): ten sam scenariusz w v1 i v2 daje
   identyczny stan Firestore.
4. Cutover: v2 przejmuje katalog główny (w tym `sw.js`, `app.html` jako przekierowanie), v1 ląduje pod
   `/v1/` jako fallback na 2-4 tygodnie.

### 3.2 Zasady obowiązujące przez cały okres równoległy

| Zasada | Dlaczego |
|---|---|
| Schemat tylko addytywny: nowe pola/kolekcje OK, rename/delete/zmiana typu NIE | v1 musi dalej czytać wszystko, co zapisze v2 |
| v2 zapisuje dokumenty w kształcie, który v1 rozumie (te same nazwy pól, typy, `source`) | Pożyczki, cele, transakcje są czytane przez v1, rodzica i raport |
| Firebase SDK w v2 przypięty do **10.12.x** (npm), domyślna nazwa app, te same ustawienia cache | Ta sama wersja schematu IndexedDB → brak konfliktu cache i wspólna sesja logowania. Upgrade SDK po wyłączeniu v1 |
| Push (FCM) tylko w v1 do cutover | Dwa Service Workery = dwie subskrypcje push = podwójne powiadomienia |
| SW v2 ze scope `/lifexp-app/v2/` | Dłuższy scope wygrywa — v2 kontroluje swoje strony, v1 swoje |
| Migracje danych uruchamiane jawnie, idempotentne, z markerem w profilu | Brak „napraw przy odczycie” (v1 robi to w renderze — B15) |
| Nie używać v1 i v2 jednocześnie na dwóch urządzeniach do operacji na saldzie | v1 nie ma transakcji (B3/B4) — wyścig nadal możliwy po stronie v1 |

### 3.3 Co zachować, co przepisać — kolejność

Kolejność wynika z ryzyka i sprzężeń: najpierw rzeczy tylko do odczytu, potem moduły izolowane, na końcu
moduły, które piszą do salda i punktów (sprzężenia Money ↔ Chores ↔ Goals ↔ Activities). Szczegóły
i Definition of Done — sekcja 9.

```
0 Siatka bezpieczeństwa ─▶ 1 Fundament ─▶ 2 Dane + domena (read-only) ─▶ 3 Moduły z zapisem
   (backup, CI, emulator,     (shell, auth,     (repozytoria, konwertery,        3a Tasks+Notes
    inwentaryzacja danych,     drawer, tokens,   domena z golden testami,        3b Chores
    functions/ w repo)         router, i18n)     dashboard read-only)            3c Money
                                                                                  3d Goals
                                                                                  3e XP/aktywności
                                                                                  3f Offline
 ─▶ 4 Settings + Reports/Bugs ─▶ 5 Ex-us (5a lokalne komendy, 5b AI 1-call) ─▶ 6 Rodzic, raport, push
 ─▶ 7 Cutover ─▶ 8 Sprzątanie + reguły
```

---

## 4. Architektura LifeXP v2

### 4.1 Stack

| Warstwa | Wybór | Dlaczego (i analogia C#) |
|---|---|---|
| Język | TypeScript `strict` | Kompilator łapie literówki w polach i nieobsłużone `null` — główne źródło bugów tego kodu. ≈ C# z nullable reference types |
| UI | Preact 10 + `@preact/signals` | ~4 KB, API zgodne z React (największa baza wiedzy modeli AI), deklaratywny render ze stanu. Signals ≈ `INotifyPropertyChanged`/`ObservableProperty` — tylko zależne fragmenty się przerysowują |
| Build | Vite | Szybki dev server, bundling, hashowane assety. ≈ MSBuild + `dotnet watch` |
| Routing | hash router (`wouter` z hash location albo ~60 linii własnego) | GitHub Pages nie ma SPA fallback; hash działa offline i z SW bez sztuczek |
| Walidacja | `zod` (v4) | Jeden schemat → walidacja argumentów komend, parsowanie dokumentów, JSON Schema dla Gemini. ≈ FluentValidation + kontrakt `System.Text.Json` |
| Dane | Firebase JS SDK 10.12.x z npm (modular) | Ta sama wersja co v1 w okresie równoległym; wersja w lockfile |
| i18n | i18next + typowane klucze | Słownik przenoszony 1:1 z `i18n-resources.js` |
| Markdown | marked + DOMPurify, dynamic import | Bez zmian semantyki, ale z bundla zamiast CDN |
| PWA | `vite-plugin-pwa` (strategia `injectManifest`) | Własny SW (FCM + precache Workbox) |
| Testy | Vitest, Playwright, Firebase Emulator Suite | ≈ xUnit + Playwright .NET + testowa baza |
| Lint | ESLint + reguły architektury (zakaz importów w złą stronę, zakaz inline style, zakaz `innerHTML`) | Egzekwuje warstwy automatycznie, nie „na słowo” |

Plan B (jeśli build step jest nie do przyjęcia): ES modules bez bundlera + import maps + JSDoc + `tsc --checkJs`.
Działa, ale traci model komponentów, lockfile SDK i precache hashowanych plików. Rekomendacja: plan A.

### 4.2 Warstwy i reguła zależności

Opis: każda warstwa może importować tylko warstwy **pod sobą**. Logika domeny nie wie, że istnieje Firebase
ani DOM, więc testuje się ją w milisekundach, bez przeglądarki.

```
features/*   (widoki + stan ekranu)          ≈ Blazor pages/components
   │ używa
services/*   (use-case'y, transakcje)         ≈ MediatR handlers / application services + UnitOfWork
   │ używa                     │ używa
domain/*  (czyste funkcje)   data/* (repozytoria, konwertery, Firebase) ≈ EF Core DbContext + value converters
   │
lib/*  (daty, pieniądze, tekst — czyste)
ui/*   (design system — bez wiedzy o domenie)
```

Zakazy egzekwowane lintem: `domain` nie importuje `data`/`features`/`ui`; `ui` nie importuje `domain`/`data`;
`features` nie importuje `data` bezpośrednio (tylko przez `services`/`stores`).

### 4.3 Struktura katalogów

```
/                         # w okresie równoległym: pliki v1 bez zmian
├─ v2/                    # nowa aplikacja (root Vite)
│  ├─ index.html
│  ├─ vite.config.ts
│  ├─ tsconfig.json
│  ├─ public/             # manifest, ikony, self-hosted font (subset latin-ext)
│  └─ src/
│     ├─ main.tsx
│     ├─ app/             # AppShell, Drawer, TopBar, router, boot gates, registry.ts
│     ├─ ui/              # tokens.css, base.css, components/*
│     ├─ lib/             # dates.ts, money.ts, format.ts, text.ts, markdown.ts, platform.ts
│     ├─ i18n/            # init.ts, pl.json, en.json, types.d.ts
│     ├─ data/            # firebase.ts, paths.ts, converters/*, repos/*
│     ├─ domain/          # points, level, streak, achievements, chores, money, loans, goals, tasks(pcBuild), notes, bugs
│     ├─ services/        # activity, gaming, chores, money, loans, goals, tasks, notes, bugs, profile, migrations
│     ├─ stores/          # session, profile, today, … (signals + subskrypcje)
│     ├─ offline/         # kolejka szkiców kompatybilna z v1
│     └─ features/
│        ├─ today/        # dashboard
│        ├─ tasks/  goals/  chores/  money/  notes/
│        ├─ stats/        # historia, statystyki, osiągnięcia, generator, granie
│        ├─ reports/      # zgłoszenia, historia aktualizacji, broadcasty (admin)
│        ├─ settings/  parent/  games/
│        └─ exus/         # engine: parser/, pipeline.ts, registry.ts, undo.ts, context.ts, api.ts, ui/
├─ functions/             # Cloud Functions odtworzone od nowa, osobny codebase — exusTurn, weryfikacja rodzica (6.12)
├─ tests/                 # e2e v2 + istniejące testy gier
├─ docs/v2/               # ten plan + decyzje (ADR)
└─ .github/workflows/     # test.yml, deploy.yml, notify.yml, weekly-report.yml
```

### 4.4 Kontrakt modułu (feature)

Każdy moduł rejestruje się jednym obiektem. Nawigacja, onboarding, lista modułów w Ustawieniach, komendy Ex-us
i kontekst AI są **generowane** z rejestru — dodanie modułu = jeden katalog + jedna linia w `registry.ts`.
(≈ `services.AddFeature<T>()` w DI.)

```ts
// app/registry.ts
export interface FeatureDef {
  id: ModuleId;                          // 'tasks'
  labelKey: I18nKey;                     // etykieta w nawigacji
  routes: RouteDef[];                    // { path: '/tasks', view: lazy(() => import('./TasksPage')) }
  nav?: { group: 'main' | 'secondary'; order: number; meta?: () => string | null }; // np. "3 po terminie"
  toggleable: boolean;                   // czy można wyłączyć w Ustawieniach
  commands?: CommandDef<any>[];          // komendy Ex-us tego modułu
  exusContext?: (s: Stores) => unknown;  // wkład modułu do snapshotu kontekstu AI
}
```

### 4.5 Stan i przepływ danych

- `stores/session` — user z Auth, bramy boot.
- `stores/profile` — `onSnapshot(users/{uid})` przez cały czas życia sesji (1 dokument).
- Stores modułów subskrybują swoje kolekcje **tylko gdy moduł jest otwarty** (subscribe on enter,
  unsubscribe on leave) albo gdy potrzebuje ich Ex-us (lazy fetch).
- Po zapisie nie ma ręcznego „przeładuj wszystko”: Firestore z `onSnapshot` daje natychmiastową kompensację
  opóźnienia (lokalny zapis widać od razu), a widoki są funkcją stanu.
- Jeden kierunek: widok → `service.x()` → Firestore → snapshot → store → widok.

### 4.6 Serwisy i transakcje

Każda akcja użytkownika to jedna funkcja serwisu, która liczy plan w domenie i zapisuje go atomowo:

```ts
// services/activity.ts
export async function logActivity(input: LogActivityInput): Promise<LogActivityResult> {
  const uid = session.uid();
  return runTransaction(db, async (tx) => {
    const dayRef = paths.dailyLog(uid, dayKey(new Date()));
    const day = dailyLogConverter.fromSnap(await tx.get(dayRef));
    const profile = profileStore.value;                        // limit i kursy
    const plan = planActivity(input, { todayEarned: day.pointsEarned, dailyLimit: profile.dailyLimit }); // domena, czysta
    if (plan.points === 0) throw new DomainError('dailyLimitHit');
    tx.set(paths.newActivity(uid), plan.activityDoc);
    tx.set(dayRef, { pointsEarned: increment(plan.points) }, { merge: true });
    tx.update(paths.user(uid), { 'points.total': increment(plan.points), 'points.earnedAllTime': increment(plan.points) });
    return plan;
  });
}
```

Transakcje wymagają sieci — to zgodne z obecnym designem offline: gdy offline, serwis zwraca
`{ status: 'queued' }` i zapisuje szkic (ten sam format co v1), zamiast próbować zapisu.

Dla Money zostaje dokładna semantyka zaokrągleń v1 (`round2(current + delta)` w transakcji, nie `increment`
na floatach), a domena liczy w groszach (liczby całkowite) i konwertuje na granicy zapisu.

### 4.7 Routing

`#/today`, `#/tasks`, `#/goals`, `#/chores`, `#/money`, `#/money/loans`, `#/notes`, `#/notes/:id`, `#/stats`,
`#/stats/history`, `#/reports`, `#/settings/:section?`, `#/exus`, `#/games`, `#/parent`, `#/login`, `#/verify`.
Każdy widok ładowany leniwie. Wyłączony moduł → route niedostępny (przekierowanie na `#/today`, jak dziś).
Otwarcie drawera/sheetu dokłada wpis do historii, więc systemowe „wstecz” na Androidzie je zamyka.

### 4.8 Offline i Service Worker

- Precache: wszystkie hashowane assety + `index.html` (manifest Workbox) → aktualizacja atomowa, koniec B1.
- Nawigacje: network-first z fallbackiem na precache `index.html`.
- Firebase SDK w bundlu → start offline nie zależy od cache HTTP (B23).
- Dane offline: `persistentLocalCache` jak dziś (odczyt z cache).
- Zapisy offline: kolejka szkiców (`offline/queue.ts`) czyta i pisze **ten sam** klucz `lifexp-offline-queue`
  i te same payloady co v1. Zatwierdzanie szkicu wywołuje ten sam serwis co formularz.
- Aktualizacja: baner „Nowa wersja — odśwież” zamiast `skipWaiting` w ciemno (nie przerywa wpisywania).
  **Zmiana w 1f (2026-09-30):** skoro nawigacje są network-first, start online zawsze dostaje najnowszy build,
  a baner mylił (strona często już była nowa). Nowy SW instaluje się w tle i przejmuje kontrolę bez
  przeładowania; otwarta strona przeładowuje się raz tylko wtedy, gdy prosi o chunk usunięty deployem
  (`vite:preloadError`, `app/pwa.ts`). Wpisywanie nie jest przerywane.
- v1 `sw.js` przy aktywacji kasował wszystkie cache poza własnym, czyli też precache v2 — od 1f kasuje tylko
  `lifexp-shell-*`; cache v2 mają prefiks `lifexp-v2`.

### 4.9 i18n i motywy

- Słownik z `i18n-resources.js` przeniesiony do `pl.json`/`en.json`, klucze typowane (błąd kompilacji przy
  literówce w kluczu). Daty i liczby wyłącznie przez `Intl` z aktywnym locale.
- Motywy jako zestawy tokenów, bez selektorów per-komponent (dziś `body.theme-apple .btn-primary` itd.).
  Motyw = rodzina × tryb: `[data-theme="lifexp|ios|gold"][data-mode="light|dark"]`. Tryb do wyboru:
  jasny, ciemny albo jak system (`prefers-color-scheme`). Decyzja D4:

  | Rodzina | Tryby | Domyślny tryb | Charakter |
  |---|---|---|---|
  | **LifeXP** (domyślna) | ciemny = obecny wygląd v1, jasny = nowy | ciemny | Fiolet `#6c63ff` + zieleń `#4ecca3`, Manrope |
  | **iOS** (nowa, zastępuje „Apple”) | jasny i ciemny | jak system | Kolory systemowe iOS: tło grupowane `#F2F2F7`/`#000`, komórki `#FFF`/`#1C1C1E`, akcent systemBlue `#007AFF`/`#0A84FF`, zieleń `#34C759`/`#30D158`, czerwień `#FF3B30`/`#FF453A`; font systemowy (`-apple-system`); listy „inset grouped” z cienkimi separatorami zamiast kart z obramowaniem; rozmycie tylko w top barze (U5) |
  | **Gold** | ciemny | ciemny | Zestaw tokenów z v1 bez zmian |

  Obecny motyw „Apple” (jasne szkło z zielonym akcentem na kartach) nie przechodzi do v2: nie wygląda jak iOS,
  a rozmycie na kartach obniża płynność. Migracja `lifexp-theme` z v1: `lifexp` → LifeXP ciemny,
  `apple` → iOS, `gold` → Gold. Wybór fontu zostaje (leniwe ładowanie).

### 4.10 Konwencje dla rozwoju z AI

Plik `CLAUDE.md` w katalogu głównym (treść do przygotowania w etapie 1):

- Mapa warstw i reguła zależności (4.2), gdzie co leży (4.3), kontrakt `FeatureDef`.
- „Każda zmiana danych przez serwis; serwis = domena + transakcja; domena ma testy.”
- „Nowe pole w Firestore: dodaj do konwertera z wartością domyślną; nigdy nie zmieniaj istniejącego.”
- „Zero inline style, zero `innerHTML` poza komponentem Markdown, zero `window.*`.”
- „Każdy tekst przez i18n; każda kwota przez `formatMoney`; każda data przez `lib/dates`.”
- Komendy walidacyjne przed PR: `npm run typecheck && npm run lint && npm test`.
- Małe PR-y: jeden moduł lub jeden serwis na PR.

---

## 5. Model danych

### 5.1 Zasady

1. **Nic nie jest kasowane ani przemianowywane** w okresie równoległym. Legacy kolekcje (`purchases`,
   `moneyGoals`, `plannerTasks`) zostają nietknięte; decyzje o nich zapadają w etapie 8.
2. **Każdy dokument przechodzi przez konwerter** (`data/converters/*`) z wartościami domyślnymi dla
   brakujących pól i tolerancją legacy kształtów. Konwerter tylko czyta — nigdy nie zapisuje „poprawionej”
   wersji przy odczycie.
3. **Migracje są jawne**: funkcja w `services/migrations`, idempotentna, zapisuje marker
   `users/{uid}.migrations.{id} = timestamp` w tym samym batchu co zmiana.
4. **Zapisy v2 muszą być czytelne dla v1** (kontraktowe testy w emulatorze, 8.3).

### 5.2 Decyzje per kolekcja

| Kolekcja / pole | Decyzja | Uwagi |
|---|---|---|
| `users/{uid}` (profil) | Zachować | Nowe pola: `schemaVersion`, `migrations{}`, `disabledModules[]`, `dayKeyMode` |
| `users.goals[]` | Zachować (tablica, max 3) | Zapis przez transakcję (koniec lost update). Przeniesienie do podkolekcji — tylko po wyłączeniu v1 i przepisaniu backendu, o ile w ogóle potrzebne |
| `users.points.*` | Zachować | Aktualizacja wyłącznie w transakcjach z dokumentem źródłowym |
| `activities`, `activityDefs` | Zachować | `activityDefs.archived: true` zamiast kasowania (B17); v1 zignoruje pole |
| `dailyLog/{key}` | Zachować | Zmiana semantyki klucza UTC → lokalny przy cutover (M4) |
| `gamingSessions` | Zachować | |
| `purchases` | Read-only | Tylko dla historii i `spentAllTime`; brak zapisu w v2 |
| `chores`, `choreDefs`, `chorePayouts` | Zachować | Nowe opcjonalne pole wpisu: `rate` (kurs w chwili dodania) — tylko informacyjnie, rozliczenie liczone jak w v1 |
| `money/settings`, `money/balance` | Zachować | |
| `moneyTransactions` | Zachować | Nowe wartości `source` dopiero po wyłączeniu v1 (M6) |
| `moneyCategories` | Zachować | Referencja po nazwie zostaje |
| `moneyLoans` | Zachować | |
| `notes`, `todos` | Zachować | `todos` = moduł Tasks. Nowe opcjonalne: `doneAt` |
| `users.pcBuild` | Zachować | |
| `plannerTasks` | Nie ruszać | Opcjonalny import niezrobionych do `todos` (M5, decyzja usera) |
| `moneyGoals` | Nie ruszać | W produkcji brak dokumentów; skrypt raportu przestaje ją czytać (etap 6) |
| `aiConversations` | Nie ruszać, v2 nie czyta | Historia backendu v1. Nie importujemy do lokalnej historii v2; dostęp rodzica — D7 |
| ~~`aiTestAccces`~~ (literówka) | Usunięta 2026-09-29 | Duplikat wpisu z `aiTestAccess` |
| `fcmTokens` | Zachować | Po cutover nowe tokeny z SW v2; martwe czyści skrypt push |
| `bugReports`, `bugReportsConfig`, `broadcasts` | Zachować | Wiadomości przez `arrayUnion` |
| `aiTestAccess`, `aiUsageGlobal`, `aiSettings` | Zachować | Obsługiwane przez backend |
| Ex-us: historia czatu | Nowe, lokalnie (IndexedDB per uid) | Jedyne źródło historii; backend `exusTurn` jest bezstanowy (6.9) |
| Ex-us: zużycie tokenów | Nowe: `aiUsage/{uid}_{data}`, `aiUsageGlobalV2/{data}` | Top-level, zapis tylko z funkcji (6.12) |

### 5.3 Legacy kształty, które konwertery muszą obsłużyć

Zweryfikowane na produkcji 2026-09-27 (`INVENTORY.md`: 6 kont, sam schemat bez wartości). Kolumna „Produkcja”
mówi, ile dokumentów ma dany wariant; wariant nieobecny dziś zostaje obsłużony, jeśli kosztuje jedną linię
wartości domyślnej, bo v1 wciąż zapisuje dane w okresie równoległym.

| Encja | Wariant | Produkcja | Obsługa |
|---|---|---|---|
| Profil | brak `enabledModules`/`accountMode`/`onboardingDone` | 1/6 kont | Domyślne jak w v1 (`core.js:450-453`, `83-86`), także dla `points` (dziś 6/6) |
| Profil | brak `lang`, `dailyLimit`, kursów `pointsRate*` | 3-4/6 kont | Domyślne jak w v1 (150, 1 zł/10 pkt, 0,45 zł/1 pkt) |
| Profil | `parentEmail: ''` | 5/6 kont | Pusty string = brak |
| Profil | legacy `goalName/goalType/goalAmount/goalCelebrated` | 0/6 | Brak konwersji; M1 skreślona (v1 już tych pól nie zapisuje) |
| Cel | brak `saved` | 1/3 celów | `0` |
| Aktywność | `type: '__generated__'` + `typeName` | 3/37 | Nazwa z `typeName` |
| Aktywność | `type` spoza seedów (własna albo skasowana definicja) | 20/37 | Nazwa z `activityDefs`; gdy definicji brak, etykieta zastępcza z i18n zamiast surowego id |
| Aktywność | `timestamp` jako string | 0/37 (Timestamp 37/37) | Tolerancja zostaje (jedna gałąź w konwerterze) |
| Aktywność | `desc: ''` | 33/37 | Pusty string = brak opisu |
| Obowiązek | `choreId` wskazujący nieistniejącą definicję | 2/14 (wszystkie 36 definicji to seedy) | Nazwa i emoji ze zdenormalizowanych `choreName`/`choreEmoji` (14/14) |
| Obowiązek | brak `monthKey` | 0/14 | Wyliczenie z `dateISO` zostaje jako fallback |
| Wypłata / zakup | `amountPln` / `amount` raz int, raz float | float: 4/6 wypłat, 1/2 zakupów | Zwykła liczba; zaokrąglanie jak w v1 (`round2`) |
| Money | legacy `pendingPoints` w `money/*` | 2/12 | Ignorowane, nie wyświetlane, nie kasowane |
| Transakcja | brak `pointsCost`, brak `source` | 0/5 | `0`, `'manual'` |
| Transakcja | wypłata obowiązków bez transakcji `chore_payout` | 6 wypłat, 0 takich transakcji | Saldo nie jest odtwarzalne z historii transakcji — „Sprawdź spójność” (5.5) pokazuje różnicę, nie poprawia |
| Notatka / zadanie | `createdAt` jako ISO string | 8/8, 7/7 | Normalizacja do `Date` w pamięci, zapis w tym samym formacie co v1 |
| Zgłoszenie | `createdAt` Timestamp, `messages[].at` ISO string | 4/4 | Oba formaty w jednym dokumencie |
| Pożyczka | brak `repaidAmount`/`completedAt` | brak pożyczek w produkcji | `0`, `null` |

### 5.4 Migracje

| Id | Kiedy | Co robi | Odwracalność |
|---|---|---|---|
| ~~M1~~ | — | ~~Legacy pola celu → `goals[]`~~ Skreślona: inwentaryzacja pokazała 0/6 kont z legacy polami | — |
| M2 | Etap 3c | Backfill `moneyIncomeAllTime` (identycznie jak `money.js:73-83`). Dziś pole ma 6/6 kont, więc M2 dotyczy tylko kont, które nigdy nie otworzyły Money | Idempotentna |
| M3 | Etap 4 | `disabledModules` = moduły istniejące w dniu zapisu `enabledModules` minus `enabledModules`. `notes` włączone, jeśli `planner` był włączony. `enabledModules` dalej zapisywane dla v1 | Tylko nowe pole |
| M4 | Cutover | `dayKeyMode: 'local'` — nowe wpisy do `dailyLog` pod lokalną datą. Historia bez zmian (różnica dotyczy wyłącznie okna 0:00-2:00) | Flaga |
| M5 | Opcjonalnie | Import niezrobionych `plannerTasks` jako `todos` (termin = `dateISO`) | Źródło nietknięte |
| M6 | Po wyłączeniu v1 | Ledger Money: wpłaty na cele i pożyczki zaczynają tworzyć wpisy z nowymi `source` (`goal_deposit`, `goal_refund`, `loan_*`) + wpis „saldo otwarcia”. Dzięki temu saldo da się przeliczyć z historii i zweryfikować | Nowe dokumenty, filtrowane w UI |

### 5.5 Ochrona przed utratą danych

1. **Backup przed każdym etapem z zapisami**: eksport Firestore (`gcloud firestore export` do bucketu GCS;
   projekt ma już Cloud Functions, więc jest na planie Blaze).
2. **Dry-run migracji** na kopii: eksport → import do emulatora → migracja → diff dokumentów.
3. **Kontrakt v1↔v2**: scenariusze zapisów wykonane w v2 muszą dać dokumenty, które v1 czyta bez błędów
   (test e2e v1 na emulatorze po zapisie v2).
4. **Reconcile (tylko odczyt)**: narzędzie w Ustawieniach → „Sprawdź spójność”: suma punktów z `activities`
   i `purchases`/transakcji vs `points.*`, suma `dailyLog` vs aktywności, saldo vs transakcje (dokładne po M6).
   Pokazuje różnice, nic nie poprawia automatycznie.
5. **Szkice offline** z v1 odczytywane przez v2 — test na kolejce z wpisami każdego typu.
6. **Fallback**: v1 dostępne pod `/v1/` po cutover.

---

## 6. Architektura Ex-us

### 6.1 Cel i zasada

Ex-us jest jedynym asystentem. Zasada: **AI rozpoznaje intencję, aplikacja wykonuje lokalnie**.

- Komenda `/...` → **0 wywołań AI**. Parser, walidacja, wykonanie — wszystko lokalnie.
- Wiadomość w języku naturalnym → **dokładnie 1 wywołanie** backendu, które zwraca odpowiedź tekstową
  **i** listę akcji w formacie identycznym z sparsowaną komendą. Potwierdzenie, wykonanie, cofnięcie,
  odświeżenie licznika tokenów — lokalnie, bez kolejnych wywołań.

### 6.2 Przepływ

```
                    ┌──────────── "/create-goal Rower 1500 zł" ────────────┐
input ──▶ router ──▶│ parser (tokenize → slot filling → entity resolve)     │──┐
                    └───────────────────────────────────────────────────────┘  │  ParsedCommand
                    ┌──────────── "odłóż 50 zł na rower" ──────────────────┐  │  { command, args }
                    │ exusTurn(message, context)  ── 1 wywołanie ──▶ Gemini │──┤
                    │ ◀── { reply, actions: ParsedCommand[], usage }        │  │
                    └───────────────────────────────────────────────────────┘  ▼
                                                        pipeline (wspólny):
                                                        validate (zod) → resolve refs → preview (karta)
                                                        → [potwierdzenie wg ryzyka] → execute (serwis)
                                                        → wynik w czacie + toast → stos undo
```

(≈ MediatR: `ParsedCommand` to `IRequest`, handler komendy to `IRequestHandler`, walidacja/potwierdzenie to
pipeline behaviors.)

### 6.3 Parser komend

**Intuicja.** Użytkownik pisze tak, jak myśli: `/zadanie Kupić mleko jutro M`. Nie pamięta kolejności
argumentów. Parser powinien rozpoznać, że „jutro” to data, „M” to rozmiar, a reszta to treść — niezależnie
od kolejności.

**Opis słowny (slot filling).** Każda komenda deklaruje sloty z typami. Każdy typ ma rozpoznawacz
(recognizer), który mówi, czy token do niego pasuje. Parser:

1. Dzieli tekst na tokeny, szanując cudzysłowy (`"..."`, `„...”`).
2. Zdejmuje argumenty nazwane (`kwota=1500`, `--jednorazowy`).
3. Sortuje pozostałe sloty od najbardziej do najmniej specyficznego typu:
   `enum` → `date` → `duration` → `money` → `number` → `entity` → `text`.
4. Dla każdego slotu bierze pierwszy niezwiązany token, który pasuje do rozpoznawacza, i go „zjada”.
5. Wszystkie tokeny, które zostały, sklejone w kolejności tworzą jedyny slot typu `text` (np. treść zadania).
6. Brakujące wymagane sloty **nie są błędem** — karta podglądu jest edytowalnym formularzem z uzupełnionymi
   polami i zaznaczonym brakiem. Parser nie musi być perfekcyjny, bo zawsze jest krok korekty.
7. Encje (`<zadanie>`, `<cel>`, `<obowiązek>`, `<pożyczka>`): najpierw dokładny ref (`t3`, `g1`), potem
   dopasowanie rozmyte po znormalizowanej nazwie (małe litery, bez polskich znaków, odległość Levenshteina
   ≤ 2 albo pokrycie tokenów). Kilku kandydatów → karta z wyborem.

**Formalnie.** Dla tokenów `T = (t₁…tₙ)` i slotów posortowanych po specyficzności `S = (s₁…sₖ)`:
`bind(sᵢ) = min{ j : tⱼ ∉ Used ∧ recognizeᵢ(tⱼ) ≠ ⊥ }`; slot tekstowy dostaje `T \ Used`.
Złożoność O(n·k) — przy n, k < 20 pomijalna. Rozpoznawanie jest deterministyczne, więc łatwe do testów
tabelarycznych.

**Rozpoznawacze:**

| Typ | Przykłady wejścia | Wynik |
|---|---|---|
| `money` | `12,50` `12.5zł` `12 zł` `1 500 PLN` | grosze (int) + sygnał jednostki (`zł`) |
| `points` | `500pkt` `500 pkt` | int + sygnał jednostki (`pkt`) |
| `duration` | `90` `90m` `1h` `1h30` `1,5h` | minuty |
| `date` | `dziś` `jutro` `pojutrze` `pt` `12.10` `2026-10-12` `+3d` | `YYYY-MM-DD` lokalnie |
| `enum` | `S/M/L`, `dziś/wczoraj`, `punkty/pieniądze` | wartość enuma |
| `entity` | `t3`, `rower`, `"nowy rower"` | id dokumentu |

Jednostka wnioskuje typ: `/cel Rower 1500 zł` → cel pieniężny, `/cel Rower 5000 pkt` → punktowy.

**Kod (potwierdzenie mechanizmu):**

```ts
type Recognizer<T> = (token: string, ctx: ParseCtx) => T | undefined;

interface SlotDef<T> { name: string; type: SlotType; required: boolean; recognize: Recognizer<T> }

export function fillSlots(tokens: string[], slots: SlotDef<unknown>[], ctx: ParseCtx) {
  const used = new Set<number>();
  const out: Record<string, unknown> = {};
  for (const slot of [...slots].sort(bySpecificity)) {
    if (slot.type === 'text') continue;
    const j = tokens.findIndex((t, i) => !used.has(i) && slot.recognize(t, ctx) !== undefined);
    if (j >= 0) { used.add(j); out[slot.name] = slot.recognize(tokens[j], ctx); }
  }
  const text = slots.find((s) => s.type === 'text');
  if (text) out[text.name] = tokens.filter((_, i) => !used.has(i)).join(' ') || undefined;
  return out; // walidacja wymaganych slotów dopiero w pipeline (zod)
}
```

UI parsera: wpisanie `/` otwiera paletę komend (lista tekstowa, filtrowana na bieżąco, ↑↓/Enter, na telefonie
tap). Rozpoznane fragmenty są podświetlane w polu na żywo, jak w Todoist Quick Add (U9): data, kwota, rozmiar
dostają kolor semantyczny, a karta podglądu pokazuje, co z nich wynika.

Reguły palety (U11, wzorce Linear/Raycast): pusta paleta pokazuje ostatnie i najczęstsze komendy; wyniki
w grupach „Komendy / Ekrany / Ostatnie”; dokładny prefiks nazwy albo aliasu zawsze przed dopasowaniem
rozmytym; każdy wiersz = nazwa + moduł + składnia; brak wyników nigdy nie kończy się ślepą uliczką —
ostatnia pozycja to „Zapytaj Ex-us: <wpisany tekst>”. Placeholder pola: „Napisz do Ex-us albo wpisz /”. Po wyborze komendy — podpowiedź składni pod polem (`/create-task <treść> <termin> [S|M|L]`).
Ta sama paleta działa globalnie (Ctrl/Cmd+K na desktopie).

### 6.4 Command registry

```ts
export interface CommandDef<A> {
  id: string;                     // 'create-goal' — kanoniczne, angielskie (jak w przykładach)
  module: ModuleId;               // 'goals' — komenda znika, gdy moduł wyłączony
  aliases: string[];              // ['cel'] — polskie skróty do wpisywania
  summaryKey: I18nKey;            // opis w palecie i /help
  slots: SlotDef<unknown>[];      // do parsowania tekstu
  schema: z.ZodType<A>;           // walidacja + JSON Schema dla Gemini (z.toJSONSchema)
  risk: 'read' | 'write' | 'destructive';
  aiExposed: boolean;             // czy model może ją proponować
  preview(args: A, s: Stores): PreviewModel;               // treść karty + effects: skutki, np. 'Saldo: 312,50 → 262,50 zł' (U8)
  execute(args: A, svc: Services): Promise<CommandResult>; // wywołuje TEN SAM serwis co formularz w UI
  undo?(result: CommandResult, svc: Services): Promise<void>;
}
```

Rejestr = suma `commands` ze wszystkich włączonych `FeatureDef`. Z tego samego źródła powstają: paleta,
`/help`, walidacja, deklaracje funkcji dla Gemini, testy tabelaryczne.

### 6.5 Kompletny zestaw komend

Ryzyko: `read` — wykonanie od razu; `write` — karta z przyciskiem „Wykonaj”; `destructive` — dialog
z jawnym opisem skutku. Wszystkie `write`/`destructive` przechodzą przez serwisy (limity, saldo ≥ 0,
max 3 cele, max 30 zadań itd. egzekwowane w jednym miejscu).

| Komenda | Alias | Argumenty | Ryzyko | AI | Serwis |
|---|---|---|---|---|---|
| **Ogólne** | | | | | |
| `/help` | `/pomoc` | `[komenda]` | read | — | lokalnie |
| `/today` | `/dzis` | — | read | tak | podsumowanie: punkty/limit, saldo, zadania na dziś, do wypłaty |
| `/go` | `/idz` | `<ekran>` | read | tak | router |
| `/undo` | `/cofnij` | — | write | — | stos undo |
| `/new-chat` | `/nowy` | — | read | — | czat |
| `edit-pending` | — | `<ref karty> <zmienione args>` | read | tak (tylko AI) | aktualizuje niezatwierdzoną kartę (U10) |
| **XP / aktywności** | | | | | |
| `/log-activity` | `/aktywnosc` | `<typ> <czas> [opis]` | write | tak | `activity.log` |
| `/log-gaming` | `/granie` | `<gra> <czas> [data]` | write | tak | `gaming.log` |
| `/delete-activity` | `/usun-aktywnosc` | `[ostatnia\|ref]` | destructive | tak | `activity.delete` |
| `/what-now` | `/co-teraz` | `<czas>` | read | tak | generator |
| `/streak` | `/seria` | — | read | tak | domena streak |
| `/stats` | `/statystyki` | `[7d\|30d]` | read | tak | domena stats |
| **Zadania** | | | | | |
| `/create-task` | `/zadanie` | `<treść> <termin> [S\|M\|L]` | write | tak | `tasks.create` |
| `/complete-task` | `/zrobione` | `<zadanie>` | write | tak | `tasks.complete` (kawałki PC) |
| `/edit-task` | `/edytuj-zadanie` | `<zadanie> [treść=] [termin=] [rozmiar=]` | write | tak | `tasks.update` |
| `/delete-task` | `/usun-zadanie` | `<zadanie>` | destructive | tak | `tasks.delete` (nowość — v1 nie ma usuwania) |
| `/tasks` | `/zadania` | `[dzis\|zalegle\|wszystkie]` | read | tak | store |
| **Cele** | | | | | |
| `/create-goal` | `/cel` | `<nazwa> <kwota zł\|pkt>` | write | tak | `goals.create` |
| `/deposit-goal` | `/wplac` | `<cel> <kwota>` | write | tak | `goals.deposit` (zdejmuje saldo) |
| `/edit-goal` | `/edytuj-cel` | `<cel> [nazwa=] [kwota=]` | write | tak | `goals.update` |
| `/delete-goal` | `/usun-cel` | `<cel>` | destructive | tak | `goals.delete` (zwrot na saldo) |
| `/goals` | `/cele` | — | read | tak | store |
| **Obowiązki** | | | | | |
| `/complete-chore` | `/obowiazek` | `<obowiązek> [dzis\|wczoraj]` | write | tak | `chores.addEntry` |
| `/create-chore` | `/nowy-obowiazek` | `<nazwa> <pkt> [--jednorazowy]` | write | tak | `chores.createDef` |
| `/delete-chore-entry` | `/usun-wpis` | `[ostatni\|ref]` | destructive | tak | `chores.deleteEntry` |
| `/delete-chore` | `/usun-obowiazek` | `<obowiązek>` | destructive | tak | `chores.deleteDef` |
| `/settle-chores` | `/rozlicz` | — | destructive | tak | `chores.settle` (atomowo → Money) |
| `/chores` | `/obowiazki` | — | read | tak | do wypłaty + miesiąc |
| **Money** | | | | | |
| `/add-money` | `/wplyw` | `<kwota> [kategoria] [notatka] [data]` | write | tak | `money.addIncome` |
| `/remove-money` | `/wydatek` | `<kwota> [kategoria] [notatka] [data]` | write | tak | `money.addExpense` (+ koszt w pkt) |
| `/delete-transaction` | `/usun-transakcje` | `[ostatnia\|ref]` | destructive | tak | `money.deleteTx` |
| `/balance` | `/saldo` | — | read | tak | store |
| `/create-category` | `/kategoria` | `<nazwa>` | write | tak | `money.createCategory` |
| `/lend` | `/pozyczam` | `<osoba> <kwota> [notatka]` | write | tak | `loans.create(lent)` |
| `/borrow` | `/pozyczam-od` | `<osoba> <kwota> [notatka]` | write | tak | `loans.create(borrowed)` |
| `/repay` | `/splata` | `<pożyczka\|osoba> <kwota>` | write | tak | `loans.repay` |
| `/loans` | `/pozyczki` | — | read | tak | store |
| `/money-limit` | `/limit-wydatkow` | `<kwota>` | write | tak | `money.setLimit` |
| **Notatki** | | | | | |
| `/create-note` | `/notatka` | `<tytuł> [treść]` | write | tak | `notes.create` |
| `/archive-note` | `/archiwizuj` | `<notatka>` | write | tak | `notes.archive` |
| `/find-note` | `/szukaj` | `<fraza>` | read | tak | lokalne wyszukiwanie |
| **Zgłoszenia** | | | | | |
| `/report-bug` | `/blad` | `<tytuł> \| <obszar> \| <opis>` | write | tak | `bugs.submit` (limit 1/dzień) |
| **Ustawienia** | | | | | |
| `/daily-limit` | `/limit` | `<pkt>` | write | tak | `profile.setDailyLimit` |
| `/theme` | `/motyw` | `<nazwa>` | write | — | lokalnie |
| `/lang` | `/jezyk` | `<pl\|en>` | write | — | `profile.setLang` |
| `/module` | `/modul` | `<id> <on\|off>` | write | — | `profile.toggleModule` |

Komendy admina (broadcast, moderacja zgłoszeń) celowo **nie** są wystawione do AI.

### 6.6 Wykonanie, potwierdzenia, undo

- Pipeline jest jeden dla slash-komend i akcji z AI; różni się tylko źródłem `ParsedCommand`.
- Polityka potwierdzeń zależy od ryzyka **i źródła** (U7):

  | Źródło | `read` | `write` | `destructive` |
  |---|---|---|---|
  | Komenda wpisana ręcznie (`/...`), wszystkie wymagane sloty rozpoznane | wykonaj | wykonaj + toast „Cofnij” | dialog ze skutkami |
  | Komenda z brakującymi/niepewnymi slotami | wykonaj | karta-formularz | dialog ze skutkami |
  | Akcja zaproponowana przez AI | wykonaj | karta „Wykonaj / Pomiń” | dialog ze skutkami |

  Jawnie wpisana komenda to już intencja użytkownika — drugie pytanie byłoby zmęczeniem potwierdzeniami.
  Propozycja AI to domysł modelu, więc zawsze przechodzi przez kartę.
- Akcje z AI: max 3 na turę; każda jako osobna karta ze skutkami (`effects`).
- `undo`: stos ostatnich 10 wykonanych komend w sesji; handler deklaruje odwrotność (np. `create-task` →
  usuń utworzony dokument; `add-money` → usuń transakcję z cofnięciem salda). Komendy bez sensownej
  odwrotności (`settle-chores`) mają `risk: 'destructive'` i nie trafiają na stos.
- Offline: komendy, które v1 obsługuje szkicami (aktywność, granie, obowiązek, transakcja) → szkic;
  pozostałe → komunikat „wymaga internetu”. Wiadomości w języku naturalnym offline są zablokowane
  z jasnym komunikatem (bez kolejkowania do AI).
- Wynik wykonania wraca do czatu jako krótki tekst i jest dołączany do kontekstu następnej tury
  (`recentActions`), bo backend nie wie, czy użytkownik potwierdził akcję.

### 6.7 Kontekst LifeXP (snapshot dla AI)

Budowany lokalnie z danych, które i tak są w stores — bez dodatkowych odczytów, tylko dla włączonych modułów.
Encje dostają krótkie refy (`g1`, `t3`, `c2`) zamiast id Firestore: mniej tokenów, a model nie ma czego
„wymyślać” — jeśli ref nie istnieje w mapie, walidacja odrzuca akcję.

```json
{
  "now": "2026-10-03T18:40", "tz": "Europe/Warsaw", "lang": "pl",
  "points": { "total": 1240, "today": 90, "dailyLimit": 150, "level": 3 },
  "money":  { "balance": 312.5, "monthSpent": 140, "monthlyLimit": 200 },
  "goals":  [{ "ref": "g1", "name": "Rower", "type": "money", "saved": 120, "amount": 1500 }],
  "tasks":  [{ "ref": "t1", "text": "Wypracowanie", "due": "2026-10-04", "size": "M" }],
  "chores": { "defs": [{ "ref": "c1", "name": "Zmywarka", "points": 15 }], "unsettledPts": 85 },
  "activityTypes": [{ "ref": "a1", "name": "Nauka", "ptsPerHour": 40 }],
  "categories": ["jedzenie", "gry", "szkoła"],
  "recentActions": [{ "command": "create-task", "status": "executed" }],
  "pendingActions": [{ "ref": "p1", "command": "create-task", "args": { "text": "Mleko", "due": "2026-10-04" } }]
}
```

Budżet: ~1-2 tys. tokenów (limity z v1: max 3 cele, 30 zadań; treści ucinane do 80 znaków).

`pendingActions` (U10, wzorzec Todoist Ramble): niezatwierdzone karty z poprzedniej tury. Wiadomość typu
„zmień termin na piątek” zwraca akcję `edit-pending` z refem karty — klient aktualizuje istniejącą kartę
zamiast dokładać nową.
Każdy moduł dokłada swój fragment przez `FeatureDef.exusContext`.

### 6.8 System prompt

Przechowywany **po stronie backendu** (wersjonowany plik w `functions/src/exus/prompt.ts`) — gdyby leżał
w kliencie, dało się go podmienić i używać Gemini na koszt właściciela do dowolnych celów. Struktura:

1. **Rola**: „Jesteś Ex-us, asystent LifeXP. Odpowiadasz krótko, w języku użytkownika (`lang`).”
2. **Słownik domeny**: punkty LifeXP ≠ pieniądze Money (PLN); dzienny limit punktów; obowiązki mają
   osobny kurs i są rozliczane do Money; cele: max 3, punktowe albo pieniężne; zadania mają termin i rozmiar
   S/M/L (kawałki budowy PC); saldo Money nie może spaść poniżej zera.
3. **Zasady akcji**: proponuj akcję tylko przy wyraźnej prośbie o zmianę danych; używaj wyłącznie refów
   z kontekstu; gdy brakuje danych albo dopasowanie jest niejednoznaczne — dopytaj zamiast zgadywać;
   max 3 akcje; nigdy nie twierdź, że coś zostało wykonane (wykonuje aplikacja po potwierdzeniu).
4. **Kontekst**: blok JSON z 6.7 oznaczony jako **dane, nie instrukcje** (treści notatek i zadań to tekst
   użytkownika — higiena prompt injection).
5. **Format wyjścia**: wymuszony schemat (Gemini `responseSchema` / function calling):
   `{ reply: string, actions: { command: enum, args: object }[] }`. Enum komend i schematy argumentów
   generowane z rejestru (`aiExposed: true`) w czasie builda i dołączane do deploya funkcji.

### 6.9 Backend: `exusTurn`

Funkcja jest **bezstanowa**: nie przechowuje rozmów. Klient wysyła ostatnie tury z własnej historii
(już ją ma lokalnie), więc znika `conversationId` i cała kolekcja rozmów po stronie serwera.

```
exusTurn({ message, history: [{role, text}] (ostatnie ≤ 8 tur, ucięte), context, lang, clientVersion })
  → auth wymagany
  → dostęp: aiTestAccess/{uid} istnieje (ten sam allowlist co dziś)
  → limit: dzienny budżet tokenów usera + globalny bezpiecznik (transakcja na liczniku)
  → system prompt + kontekst + history + message
  → JEDNO wywołanie Gemini z wymuszonym schematem odpowiedzi
  → walidacja odpowiedzi po stronie serwera (enum komend, kształt args)
  → zapis zużycia tokenów
  ← { reply, actions[], usage: { tokensUsedToday, tokensLimitDaily, remainingPercent } }
```

- `usage` w odpowiedzi → pasek limitu bez osobnego `aiAssistantPing`.
- Backend **nie zapisuje** danych LifeXP (koniec duplikacji logiki celów/zadań po stronie funkcji).
- Stare callable (`aiClassifyIntent`, `aiAssistantChat`, `aiConfirmTask`, `aiConfirmGoal`, `aiAssistantPing`)
  **nie są odtwarzane** — wdrożone wersje działają dalej bez kodu źródłowego i obsługują v1 do cutover;
  kasowane w etapie 8. Szczegóły odtworzenia backendu: 6.12.

### 6.10 UI Ex-us

- Route `#/exus` (pełny ekran czatu) + pole „Napisz do Ex-us albo wpisz /” na ekranie „Dziś” + paleta
  Ctrl/Cmd+K. Wszystkie trzy korzystają z tego samego silnika.
- Dymki: użytkownik (tekst), Ex-us (Markdown sanityzowany), karta akcji (tytuł komendy, pola argumentów
  jako edytowalny formularz, „Wykonaj” / „Pomiń”), wynik (tekst + „Cofnij”).
- Pole wpisywania przyklejone do dołu z `100dvh` i `env(safe-area-inset-bottom)`; na iOS reakcja na
  `visualViewport` (klawiatura nie zasłania pola).
- Historia: IndexedDB per uid, czyszczona przy wylogowaniu; „Nowa rozmowa” czyści lokalną historię
  (backend jest bezstanowy, więc nic więcej nie trzeba resetować).

### 6.11 Usunięcie Siri-ous

v2 po prostu go nie zawiera. Przy cutover migracja lokalna usuwa klucze `lifexp-aichat-*`. Moduł `aichat`
w `enabledModules` mapowany na `exus`.

### 6.12 Odtworzenie backendu (Cloud Functions)

Decyzja: kod funkcji jest nieodnaleziony → **odtwarzamy**, ale tylko to, czego potrzebuje v2.

**Dlaczego nie trzeba odtwarzać pięciu starych funkcji.** Wdrożona funkcja żyje w Google Cloud niezależnie
od tego, czy jej kod gdzieś leży. v1 dalej woła `aiClassifyIntent`/`aiAssistantChat`/… i będą one działać aż
do cutover. v2 ich nie używa. Odtwarzamy więc wyłącznie nowe rzeczy:

| Funkcja | Etap | Zakres |
|---|---|---|
| `exusTurn` | 5b | 6.9 — jedno wywołanie Gemini, limit, allowlist |
| `sendParentEmailCode`, `verifyParentEmailCode` | 6 | Kod generowany i sprawdzany na serwerze (koniec B12) |
| (opcjonalnie) wysyłka raportu i push jako funkcje harmonogramowane | 6 | Zamiast GitHub Actions — do decyzji, skrypty w `scripts/` też wystarczą |

**Co wiemy o starych funkcjach (kontrakt odczytany z klienta i reguł):**

| Element | Znany kształt | Źródło |
|---|---|---|
| `aiClassifyIntent` | `{message}` → `{intent: 'task'\|'goal'\|'chat', proposal?, note?}` | `assistants.js:607-622` |
| `aiAssistantChat` | `{message, conversationId?}` → `{reply, conversationId}` | `assistants.js:585-596` |
| `aiAssistantPing` | `()` → `{tokensUsedToday, tokensLimitDaily, remainingPercent}` | `assistants.js:514-528`, `630-636` |
| `aiConfirmTask` | `{title, time, durationMin, type}` → zapis do `plannerTasks` | `assistants.js:678-680` |
| `aiConfirmGoal` | `{name, type, amount}` → zapis do `users.goals` | `assistants.js:726-728` |
| Allowlist | `aiTestAccess/{uid}` — dokument istnieje = dostęp | `firestore.rules:114-117` |
| Ustawienia per user | `users/{uid}.aiSettings` (np. `advancedEnabled`), zapis tylko z serwera | `firestore.rules:39-46` |
| Globalny licznik | `aiUsageGlobal/{date}`, klient bez dostępu | `firestore.rules:121-123` |

**Czego nie wiemy (zginęło razem z kodem):** treść obecnego system promptu, nazwa modelu Gemini,
wartości limitów tokenów, format dokumentów `aiUsageGlobal`, miejsce przechowywania rozmów, nazwa sekretu
z kluczem API. Nowy backend definiuje te rzeczy od nowa i jawnie — nie próbuje zgadywać starego formatu.

**Opcjonalny skrót przed odtwarzaniem (5 minut, bez ryzyka):** Google przechowuje źródła wdrożonych funkcji.
Konsola Google Cloud → projekt `faiobaj4` → Cloud Functions (albo Cloud Run functions) → np.
`aiAssistantChat` → zakładka „Źródło” → „Pobierz ZIP”. Jeśli archiwum jest dostępne, służy wyłącznie jako
materiał referencyjny (prompt, limity, model) — nowy kod i tak powstaje według 6.9.

**Struktura `functions/`:**

```
functions/
├─ package.json            # firebase-functions v2 (onCall), firebase-admin, @google/genai, zod
├─ tsconfig.json
└─ src/
   ├─ index.ts             # eksport: exusTurn (+ później funkcje rodzica)
   ├─ exus/
   │  ├─ turn.ts           # handler: auth → allowlist → limit → Gemini → walidacja → usage
   │  ├─ prompt.ts         # system prompt (wersjonowany, 6.8)
   │  ├─ schema.gen.json   # enum komend + JSON Schema args — GENEROWANE z rejestru v2 przy buildzie
   │  └─ quota.ts          # liczniki w transakcji
   └─ shared/admin.ts
```

**Dane backendu (nowe, bez kolizji ze starymi):**

| Ścieżka | Zawartość | Reguły |
|---|---|---|
| `aiUsage/{uid}_{YYYY-MM-DD}` | `{tokens, calls}` | `read, write: if false` — top-level, bo reguła wildcard w `users/{uid}/{col}` daje ownerowi zapis każdej podkolekcji i user mógłby wyzerować sobie licznik |
| `aiUsageGlobalV2/{YYYY-MM-DD}` | `{tokens, calls}` | `if false` |
| `users/{uid}.aiSettings.exusDailyTokens` | opcjonalny limit per user | pole już chronione regułami |

**Sekrety i konfiguracja:** nowy klucz Gemini z Google AI Studio zapisany jako sekret
(`firebase functions:secrets:set GEMINI_API_KEY`, w kodzie `defineSecret`). Model i limity jako parametry
(`defineInt`/`defineString`), nie w kodzie. Region: taki sam jak lokalizacja bazy Firestore (do odczytania
w konsoli) — klient v2 podaje go jawnie w `getFunctions(app, region)`.

**Bezpieczny deploy — najważniejsza pułapka.** `firebase deploy --only functions` porównuje lokalny kod
z wdrożonymi funkcjami i proponuje **usunięcie** tych, których lokalnie nie ma. Gdyby nowy `functions/`
wdrożyć w tym samym codebase co stare funkcje, deploy zaproponowałby skasowanie pięciu funkcji, na których
stoi Ex-us w v1. Zabezpieczenia:

1. Osobny codebase w `firebase.json` (np. `"codebase": "lifexp-v2"`) — CLI zarządza wtedy tylko funkcjami
   z tego codebase i nie dotyka starych.
2. Deploy wyłącznie celowany: `firebase deploy --only functions:lifexp-v2` (skrypt npm, nigdy ręcznie
   „wszystko”).
3. Stare funkcje usuwane jawnie w etapie 8: `firebase functions:delete aiClassifyIntent …`.

**Testy backendu:** Vitest + emulator Functions/Firestore; Gemini podmieniony fałszywym klientem
(stała odpowiedź zgodna ze schematem). Testy: brak auth → błąd, brak na allowliście → błąd, przekroczony
limit → błąd z czytelnym komunikatem, niepoprawna odpowiedź modelu (zła komenda/args) → odfiltrowana akcja
zamiast awarii, licznik rośnie o zużycie z odpowiedzi modelu.

---

## 7. Architektura UI

### 7.1 Zasady

> **Zmiana 2026-09-29 (D9, D10):** właściciel wybrał styl referencyjny — jasne tło, białe karty z miękkim
> cieniem, niebieski akcent z ikony LifeXP, ikony **z podpisem**, dolny pasek z „+”. Ikony są dozwolone
> obok tekstu (`lucide-preact`); pierwsza reguła poniżej obowiązuje w części „nigdy sama ikona”.

- **Bez ikon jako nośnika znaczenia.** Nawigacja i akcje to tekst. Znaczenie niesie hierarchia
  typograficzna, położenie i kolor semantyczny. Jedyne znaki graficzne: kształt przycisku Menu (dwie kreski
  rysowane CSS), zamknięcie (×), chevron w listach (›), znacznik wykonania (✓) — jako znaki/CSS, nie font ikon.
- **Dane użytkownika zostają**: pola `icon` (np. `ti-book`) w `activityDefs` i `notes` nie są kasowane.
  Notatki (decyzja właściciela 2026-09-30, D11): v2 pokazuje i pozwala wybrać ikonę; zapisuje tę samą klasę
  Tabler co v1, a rysuje jej odpowiednik z `lucide-preact`. Ikony `activityDefs` — do decyzji przy etapie 3e.
  Emoji obowiązków (dane usera) mogą zostać wyświetlane jako treść.
- Nowoczesny, nie „formularzowy”: duże liczby jako bohaterowie ekranu, dużo powietrza, karty z jedną
  intencją, ruch 150-250 ms, subtelne tła i cienie.

### 7.2 Design tokens

| Grupa | Wartości |
|---|---|
| Typografia | Jeden variable font self-hosted (Inter albo Manrope, subset latin-ext). Skala 1.25: 12 / 14 / 16 / 20 / 24 / 32 / 40. Wagi 400/500/600/700. `tabular-nums` dla wszystkich kwot i punktów. Overline: 12 px, uppercase, `letter-spacing .06em` |
| Spacing | Siatka 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 56 |
| Kolor | Skala neutralna (10 stopni), jeden akcent jako rampa, semantyczne: `positive`, `negative`, `warning`. Motywy: LifeXP ciemny (domyślny) i jasny, iOS (jasny/ciemny jak system), Gold — 4.9 |
| Kształt | Promienie 8 / 12 / 16 / 999 |
| Elewacja | 0 (płaskie karty z 1 px obramowaniem), 1 (sheet, drawer), 2 (dialog). Rozmycie tła (`backdrop-filter`) wyłącznie w top barze — jedna warstwa nawigacji nad treścią, jak zaleca Apple HIG; nigdy na kartach (v1: spadki FPS) (U5) |
| Z-index | `topbar 100 < drawer 200 < sheet 300 < dialog 400 < toast 500` — jedyne dozwolone warstwy |
| Ruch | 150 / 200 / 250 ms, `cubic-bezier(.2,.8,.2,1)`, `prefers-reduced-motion` → 0 |

### 7.3 App shell i breakpointy

| Klasa szerokości | Zakres | Nawigacja | Treść |
|---|---|---|---|
| compact | < 600 px | Drawer wysuwany z lewej + top bar | 1 kolumna, marginesy 16 px |
| medium | 600-839 px | Drawer (jak compact) | 1-2 kolumny kart, max 720 px |
| expanded | ≥ 840 px | Stały sidebar 264 px (zwijany do wąskiego paska z inicjałami sekcji) | 2-3 kolumny, max 1100 px |

Progi 600/840 to klasy szerokości Material 3 (U4). Dolny pasek mieści 3-5 celów, LifeXP ma ich 8+ (v1 miał
8 pozycji w dolnym pasku, co łamało tę regułę). Dlatego od D10 (2026-09-29) pasek < 840 px ma tylko pięć
pozycji: Dziś, Obowiązki, „+”, Pieniądze i „Menu”, które otwiera drawer z pełną listą. Pasek jest
przyklejony do dołu karty treści (sticky), więc przesuwa się razem z nią przy otwieraniu drawera.

Shell to CSS grid: `grid-template-columns: [nav] auto [main] 1fr`. Tylko shell zna `position: fixed`
i safe-area; strony nigdy (koniec FAB-ów i łatek `padding-bottom`).

### 7.4 Sidebar mobilny — specyfikacja zachowania (jak ChatGPT)

> Od D10 przycisk „Menu” jest w dolnym pasku, nie w top barze; top bar ma tytuł wyrównany do lewej.
> Zachowanie drawera poniżej bez zmian.

**Top bar** (56 px + `safe-area-inset-top`): po lewej przycisk z napisem **„Menu”** (U1; min. 44×44 — tekst
zamiast ikony hamburgera, bo goła ikona jest słabiej odkrywalna wg NN/g, a UI i tak jest bez ikon), na środku
tytuł ekranu, po prawej jedna akcja kontekstowa tekstem („Dodaj”, „Nowa”, „Rozlicz”). Top bar przyklejony,
półprzezroczysty z rozmyciem tła, przy scrollu w dół lekko się kompaktuje.

**Kompensata ukrytej nawigacji** (NN/g: ukryte menu obniża odkrywalność mniej więcej o połowę): ekran Dziś
zawiera bezpośrednie wejścia do modułów (7.6), pole Ex-us/komend daje dostęp do wszystkiego z każdego ekranu,
a metadane w drawerze („2 po terminie”) dają powód, żeby go otwierać. Plan awaryjny, gdyby testy
z użytkownikiem wykazały problem: hybryda jak w Monarch (3-4 najczęstsze moduły w dolnym pasku + drawer).

**Otwieranie:**
- tap w Menu;
- przeciągnięcie od lewej krawędzi (strefa 0-24 px) — tylko w trybie standalone PWA; w Safari w przeglądarce
  lewa krawędź należy do systemowego „wstecz”, więc tam gest jest wyłączony;
- karta treści podąża za palcem 1:1 (`pointermove`, bez animacji w trakcie); po puszczeniu decyduje pęd:
  krótkie, szybkie machnięcie otwiera/zamyka, wolne przeciągnięcie osiada po stronie progu 50%; przerwany gest
  (`pointercancel`) wraca do najbliższego stanu (U3).

**Wygląd w ruchu (model ChatGPT, U2):** to **karta treści** jest obiektem, który się przesuwa — odjeżdża
w prawo o ok. 82% szerokości ekranu (bez skalowania), dostaje zaokrągloną lewą krawędź (28 px) i cień.
Menu leży pod spodem: startuje z `translateX(-10%)` i krycia 0,55 i dojeżdża do pozycji docelowej, więc
wygląda, jakby „było tam cały czas”. Brak przyciemniającego scrimu na całym ekranie — odsłonięty pasek
karty sam jest celem zamknięcia. Czas ~300-450 ms z miękkim wygaszeniem; `prefers-reduced-motion` →
natychmiastowe przełączenie. Animowane tylko `transform`, `opacity`, `border-radius` (kompozytor GPU).

**Zamykanie:** tap w odsłoniętą kartę, przeciągnięcie karty w lewo, wybór pozycji, `Esc`, systemowe „wstecz”
(otwarcie dokłada wpis historii).

**Dostępność:** otwarty drawer = `role="dialog" aria-modal="true"`, treść pod spodem `inert`, fokus na pierwszej
pozycji, po zamknięciu powrót fokusu na Menu, `aria-expanded` na przycisku. Blokada scrolla treści
(`overflow: hidden` na `html`) + `overscroll-behavior: contain` w drawerze.

**Zawartość drawera:**

```
LifeXP                                   ← wordmark
Szymon · Poziom 3                        ← konto (tekst, drobny)

[ Zapytaj Ex-us ]                        ← główna akcja, wyróżniony przycisk

Dziś                                     ← aktywna pozycja: tło-pigułka + waga 600
Zadania                       2 po terminie
Cele                                1 / 3
Obowiązki                   12,40 zł do wypłaty
Pieniądze                        312,50 zł
Notatki
Statystyki
Gry

Zgłoszenia i aktualizacje
Ustawienia
──────────────────────────
Wyloguj
```

Metadane po prawej (tekst, `text-secondary`, `tabular-nums`) zastępują ikony i badge — nawigacja staje się
jednocześnie mini-dashboardem. Pozycje generowane z rejestru modułów (wyłączony moduł = brak pozycji).

### 7.5 Komponenty (`ui/components`)

`AppShell`, `Drawer`, `TopBar`, `Page` (nagłówek + treść), `Section`, `Card`, `Metric` (duża liczba + etykieta +
opcjonalny trend), `ListRow` (tekst główny / meta / wartość po prawej), `Button` (primary / secondary / quiet /
danger), `TextField`, `NumberField` i `MoneyField` (polski przecinek, grosze), `DateField`, `Select` (natywny),
`SegmentedControl`, `FilterChip`, `ProgressBar` (4-6 px), `Sheet` (bottom sheet < 600 px, dialog ≥ 600 px —
jeden komponent), `ConfirmDialog`, `Toast` (kolejka, `aria-live`, wielowierszowy), `EmptyState` (tekst + jedna
akcja), `Skeleton`, `Markdown` (lazy, sanityzowany), `CommandInput` (z paletą `/`).

Reguły komponentów z benchmarku:
- `Sheet` (U12): zawsze tekstowy przycisk „Zamknij” w nagłówku (uchwyt tylko jako dodatek), jeden arkusz
  na akcję — nigdy arkusz otwierany z arkusza; przy fokusie pola z klawiaturą arkusz rośnie do pełnej
  wysokości (`visualViewport`); zamknięcie gestem z pędem, wolne przeciągnięcie wraca.
- `MoneyField` (U13): `inputmode="decimal"` (klawiatura z przecinkiem, bez spinnerów `type="number"`),
  kwota prezentowana dużą cyfrą, pod polem podgląd skutku („Saldo po operacji: 262,50 zł”).

### 7.6 Wzorce ekranów

- **Dziś** (U6, tryb skupienia jak Today w Things 3): kolejność według listy priorytetów z `RESEARCH.md` §3 —
  zadania na dziś i zaległe (odhaczanie w miejscu) → pole Ex-us/komend → stan dnia (punkty dziś / limit,
  seria z informacją, czy dzisiejszy dzień już się liczy) → szybkie akcje (obowiązek, aktywność, transakcja)
  → cele (ile brakuje) → saldo i do wypłaty → wejścia do pozostałych modułów. Poziom, osiągnięcia, TOP,
  ciekawostki i wykresy → ekran Statystyki (przestroga Habitica: grywalizacja nie może zagracać głównego
  przepływu).
- **Pieniądze** (U14, wzorce Copilot i Revolut Vaults): saldo jako bohater z podziałem „Dostępne / W celach”;
  „Ten miesiąc vs poprzedni do tego samego dnia” (wydatki i wpływy); alert limitu tekstem; transakcje
  grupowane po dniach; pożyczki jako podsekcja `#/money/loans`.
- **Seria** (U15, Duolingo i Finch): jasna reguła dnia („dzień liczy się, gdy zdobędziesz co najmniej 1 pkt”);
  po przerwanej serii komunikat zachęcający do powrotu, bez tonu straty; użyte zamrożenie opisane wprost.
- **Obowiązki**: do wypłaty + „Rozlicz”; kalendarz miesiąca (siatka liczb, dni z wpisami podświetlone
  akcentem); lista wpisów dnia; dodawanie przez Sheet z listą definicji.
- **Formularze**: zawsze w `Sheet`, jedna kolumna, primary na dole w strefie kciuka, walidacja inline.

### 7.7 Odporność layoutu (reguły egzekwowane automatycznie)

| Reguła | Egzekwowanie |
|---|---|
| Zero inline `style` (wyjątek: zmienne CSS dla wartości dynamicznych, np. `--progress`) | ESLint |
| Zero stałych wysokości treści; `100dvh` tylko w shellu | Stylelint (zakaz `100vh`) |
| Dzieci flex/grid z tekstem mają `min-width: 0` (w `base.css` dla prymitywów layoutu) | Test przepełnień |
| Tekst użytkownika: `overflow-wrap: anywhere`, obcinanie tylko przez utility `clamp-1/2/3` | Review + test długich stringów |
| `position: fixed` tylko w shellu i warstwach (drawer, sheet, dialog, toast) | Lint (zakaz w `features/`) |
| Pola formularzy ≥ 16 px → brak auto-zoomu iOS → zoom użytkownika z powrotem włączony | Stylelint |
| Cele dotyku ≥ 44×44 px | Test e2e |
| Brak poziomego scrolla na każdym route | Test e2e: `scrollWidth ≤ innerWidth` dla 360/390/768/839/840/1280 px |

---

## 8. Strategia testowania

### 8.1 Piramida

| Poziom | Narzędzie | Co | Kiedy |
|---|---|---|---|
| Domena | Vitest | Wszystkie czyste funkcje: punkty/cap, poziom, streak+freeze, osiągnięcia, obowiązki (dziś/wczoraj, rozliczenie), Money (saldo ≥ 0, koszt w pkt, pożyczki), cele (wpłata/zwrot/zmiana typu), budowa PC, daty, kwoty | Każdy commit |
| Parser / komendy | Vitest | Tabele wejście → `ParsedCommand`; rozpoznawacze; rozmyte dopasowanie encji; pipeline z fałszywymi serwisami | Każdy commit |
| Konwertery / repozytoria | Vitest + Firestore Emulator | Legacy kształty (5.3), round-trip, transakcje, reguły bezpieczeństwa | Każdy PR |
| E2E | Playwright + Emulator (Auth + Firestore) | Krytyczne ścieżki każdego modułu na profilach iPhone 13 i Pixel 7 + desktop; budżety tapnięć z `RESEARCH.md` §2 jako asercje | Każdy PR |
| Wizualne | Playwright screenshots | Każdy route × 360/390/768/1280 × dark/light × drawer otwarty/zamknięty | Każdy PR (diff do akceptacji) |
| Layout | Playwright | Brak poziomego overflow, cele dotyku, fokus w drawerze | Każdy PR |
| Parytet v1↔v2 | Playwright + Emulator | 8.3 | Przed oznaczeniem modułu jako gotowy |

### 8.2 Testy charakteryzacyjne (golden) przed przepisaniem

Zanim powstanie domena v2, dla każdej reguły z 2.4 powstaje tabela przypadków opisująca **obecne** zachowanie
(wraz z dziwactwami: clamp do zera przy cofaniu, nadmiar kawałków PC przepada, rozliczenie po bieżącym kursie).
Domena v2 musi przejść te tabele. Świadoma zmiana zachowania = zmiana tabeli w osobnym commicie z uzasadnieniem.

### 8.3 Testy parytetu v1 ↔ v2 (najważniejsze dla bezpieczeństwa danych)

Mechanizm:

1. Minimalna zmiana w v1: parametr `?emulator=1` w `firebase-config.js`/`core.js` podłącza Auth i Firestore
   do emulatora (tylko w testach; produkcja bez zmian).
2. Scenariusz (np. „zaloguj 60 min nauki, dodaj obowiązek wczoraj, rozlicz, wpłać 20 zł na cel”) wykonany
   w v1 na czystym emulatorze → eksport stanu.
3. Ten sam scenariusz w v2 na czystym emulatorze → eksport stanu.
4. Diff po normalizacji (bez id dokumentów i znaczników czasu). Musi być pusty albo zawierać wyłącznie
   udokumentowane, addytywne pola v2.
5. Kontrakt odwrotny: po zapisach v2 otwarcie v1 na tym samym emulatorze nie daje błędów w konsoli,
   a liczby na dashboardzie v1 zgadzają się z v2.

W CI (GitHub Actions) `gstatic.com` jest osiągalny, więc v1 w testach działa z prawdziwym SDK.

### 8.4 Dane produkcyjne

- Inwentaryzacja kształtów (5.3): zrobiona na produkcji read-only (`INVENTORY.md`); powtarzana workflowem
  „Data inventory” przed etapem 2 i przed cutover.
- Dry-run każdej migracji na tej kopii + diff.
- Narzędzie „Sprawdź spójność” (5.5) uruchamiane na koncie produkcyjnym po każdym etapie z zapisami.

### 8.5 Ręczna checklista na telefonie (po każdym etapie)

Instalacja PWA, logowanie, drawer (tap, gest, back), każdy formularz z klawiaturą ekranową, tryb samolotowy
(start offline, szkic, zatwierdzenie online), obrót ekranu, duża czcionka systemowa, motyw jasny/ciemny.

---

## 9. Kolejność implementacji

Każdy etap kończy się działającą aplikacją (v1 nietknięte, v2 pod `/v2/`) i ma Definition of Done.
Rozmiar: S ≈ 1-2 PR, M ≈ 3-5 PR, L ≈ 6+ PR.

| Etap | Zakres | Definition of Done | Rozmiar |
|---|---|---|---|
| **0. Siatka bezpieczeństwa** | Przywrócenie `.github/workflows` (test + decyzja o notify/weekly), szkielet `functions/` jako osobny codebase (TS, emulator, bez wdrażania) + opcjonalne pobranie starych źródeł z konsoli jako referencji, eksport/backup Firestore, konfiguracja emulatorów, skrypt inwentaryzacji kształtów, tabele golden (8.2), przełącznik `?emulator=1` w v1 | CI zielone na v1 (poza znanymi FPS), backup istnieje, raport inwentaryzacji w `docs/v2/` | M |
| **1. Fundament** | Scaffold Vite+TS+Preact w `v2/`, deploy Actions na Pages (`/` = v1, `/v2/` = v2), tokens + base CSS, AppShell z sidebarem i drawerem, router, i18n (port słownika), Toast/Dialog/Sheet, logowanie/rejestracja/Google/weryfikacja/wylogowanie, bramy boot, SW v2 (scope `/v2/`), `CLAUDE.md` | Logowanie prawdziwym kontem na telefonie; drawer spełnia 7.4; testy layoutu zielone; Lighthouse PWA/perf ≥ 90 na mobile | L |
| **2. Dane + domena (read-only)** | Konwertery wszystkich kolekcji, repozytoria, stores, domena z golden testami, ekran „Dziś” tylko do odczytu, Statystyki/Historia read-only | Liczby na „Dziś” v2 = v1 na prawdziwym koncie; zero zapisów z v2 | M |
| **3a. Zadania + Notatki** | CRUD, budowa PC, kary, Markdown, archiwum, usuwanie zadań | Parytet 8.3; e2e na telefonie | M |
| **3b. Obowiązki** | Definicje, wpisy, dziś/wczoraj, kalendarz, rozliczenie w jednym batchu → Money | Parytet; test „rozliczenie przerwane w połowie” nie zostawia niespójności | M |
| **3c. Money** | Transakcje, kategorie, pożyczki, limit, archiwum, M2 | Parytet; saldo zgodne po serii operacji z dwóch kart | M |
| **3d. Cele** | Cele punktowe/pieniężne, wpłaty, zwroty, osobny ekran `#/goals` | Parytet | S |
| **3e. XP / aktywności** | Log aktywności/grania, cap, historia z paginacją kursorem, statystyki, generator, osiągnięcia, streak (freeze zapisywany w serwisie, nie w renderze) | Parytet; historia ładuje się w stałym czasie niezależnie od liczby wpisów | M |
| **3f. Offline** | Kolejka szkiców kompatybilna z v1, przegląd, zatwierdzanie przez serwisy | Szkice utworzone w v1 zatwierdzane w v2 | S |
| **4. Ustawienia + Zgłoszenia** | Wszystkie sekcje ustawień, M3 (moduły), tryb konta, email rodzica (na razie jak v1), zgłoszenia + admin + broadcasty + historia aktualizacji, „Sprawdź spójność” | Parytet; Notatnik widoczny dla kont sprzed 24.08 | L |
| **5a. Ex-us lokalnie** | Parser, rejestr, pipeline, karty, undo, paleta `/`, `/help`, `/today`, wszystkie komendy z 6.5 | Każda komenda ma testy tabelaryczne; zero wywołań backendu dla `/...` | L |
| **5b. Ex-us AI** | `exusTurn` od zera (6.9, 6.12): bezstanowy, 1 wywołanie Gemini ze schematem, limity, allowlist, sekret; generowanie schematu komend z rejestru; celowany deploy osobnego codebase | Pomiar: dokładnie 1 wywołanie na wiadomość; akcje z AI przechodzą ten sam pipeline; stare funkcje nadal wdrożone i v1 działa | M |
| **6. Rodzic, raport, push** | Route `#/parent` na wspólnej domenie, poprawiony skrypt raportu (cele z profilu, kursy z profilu, transakcje), weryfikacja emaila rodzica w Cloud Function, przygotowanie push w SW v2 | Raport testowy wysłany na własny adres z poprawnymi liczbami | M |
| **7. Cutover** | v2 w katalogu głównym, `sw.js` = SW v2 (przejmuje zainstalowane PWA, czyści `lifexp-shell-v*`), `app.html`/`verify.html`/`parent.html` jako przekierowania na route'y, v1 pod `/v1/`, push w v2, M4 (lokalne klucze dni), sprzątanie localStorage Siri-ous, gry jako lazy moduł | Zainstalowana PWA na telefonie sama przechodzi na v2; link z powiadomienia i powrót z FPS działają | M |
| **8. Sprzątanie** | Usunięcie v1 po okresie próbnym, upgrade Firebase SDK, reguły Firestore (walidacja pól, notatki bez dostępu rodzica — do decyzji) + testy reguł, usunięcie starych callable, decyzje o `plannerTasks`/`purchases`/`moneyGoals`, opcjonalnie M6 | Repo bez v1; testy reguł zielone | M |

Kolejność 3a → 3e jest celowa: od modułów izolowanych do tych, które piszą do punktów i salda. Moduł, który
nie przeszedł parytetu, nie blokuje kolejnych — ale nie wchodzi do cutover.

### 9.1 Stan realizacji

**Etap 0 (2026-09-27)** — zrobione w repo:

| Element | Wynik |
|---|---|
| Testy deterministyczne | 5 porażek starego CI (Ex-us ×4, menu FPS) wynikało z zależności od sieci; fixture `tests/support/hermetic.js` blokuje ruch zewnętrzny. Test FPS naprawiony po dodaniu ekranu ładowania. `fps-gameplay` w osobnym projekcie z 1 workerem. Lokalnie 50/50 |
| CI | `.github/workflows/test.yml` przywrócony: jobs „App”, „FPS gameplay” (osobno: renderowanie WebGL w software, limit 120 s na test), „Cloud Functions build”, „v1 against Firebase emulators” |
| Emulatory | `firebase.emulators.json` (projekt `demo-lifexp`, osobno od `firebase.json`), `npm run test:emulator` |
| Przełącznik `?emulator=1` w v1 | Tylko localhost; `typeof`-guard na stary config z cache SW; cache SW podbity do v55 |
| Prawdziwe v1 w testach | CDN (Firebase 10.12.0, i18next, EmailJS) serwowane z `node_modules` — koniec zależności od kopii kodu w harnessach (B19) |
| Charakteryzacja | `tests/emulator/v1-characterization.spec.js` — 4 przypadki e2e; pełne tabele w `GOLDEN.md` |
| `functions/` | Pusty codebase `lifexp-v2` (TS, kompiluje się, emulator go wczytuje); deploy tylko `functions:lifexp-v2` |
| Inwentaryzacja | `scripts/inventory.js` + workflow „Data inventory” (tylko schemat; test na emulatorze sprawdza brak wycieku wartości). Uruchomiona na produkcji 2026-09-27 → `INVENTORY.md`, wnioski w 5.3. Błędy klucza są opisywane bez cytowania sekretu |
| Sekret `FIREBASE_SERVICE_ACCOUNT` | Nieważny od 25.07; odnowiony 2026-09-27 |
| Backup | Instrukcja w `BACKUP.md` |

**Do zrobienia przez właściciela** (wymaga dostępu do Google Cloud / ustawień GitHub):
1. ~~Scalić zmiany do `main`~~ (PR #12).
2. ~~Backup wg `BACKUP.md`~~ (2026-09-29: PITR, codzienny backup, eksport `2026-09-29-0850/`).
3. ~~Uruchomić „Data inventory”~~ (2026-09-27, `INVENTORY.md`).
4. ~~Usunąć stary klucz konta serwisowego~~ (2026-09-29; „Data inventory” zielone po usunięciu).
5. ~~Sprawdzić `aiTestAccces`~~ (duplikat `aiTestAccess`, usunięta 2026-09-29).
6. ~~Decyzje D3 i D4~~ (2026-09-29). Etap 0 zamknięty; etap 1 startuje po akceptacji właściciela.

**Etap 1 (start 2026-09-29, zaakceptowany przez właściciela)** — podział na PR-y:

| PR | Zakres | Stan |
|---|---|---|
| 1a | Szkielet `v2/` (Vite 8, TypeScript 5.9 strict, Preact), lint architektury z testami (warstwy 4.2, zakazy 7.7), `scripts/build-site.js` (v1 bez zmian + v2 pod `/v2/`, kontrola plików v1), workflow „Deploy”, job CI „v2 checks and site build”, `CLAUDE.md` | scalone (#14) |
| 1b | Tokeny i motywy (LifeXP ciemny/jasny, iOS, Gold; migracja `lifexp-theme` z v1; skrypt przed pierwszym renderem), `base.css`, AppShell z sidebarem i drawerem (7.4), hash router, rejestr modułów z ekranami „W budowie”, i18n (typowane klucze pl/en), testy przeglądarkowe powłoki | scalone (#15); płynniejsze otwieranie drawera po teście na telefonie (#16) |
| 1c | Komponenty `ui/`: Page, Section, Card, Stack, Metric, List/ListRow, ProgressBar, EmptyState, Skeleton, Button, pola (tekst, liczba, kwota w groszach, data, select), SegmentedControl, FilterChip; `lib/money` (grosze); moduły ładowane leniwie; galeria `#/ui` z przełącznikiem motywu | scalone (#17) |
| 1d | Warstwy na natywnym `<dialog>`: Sheet (bottom sheet < 600 px / dialog ≥ 600 px, przeciąganie w dół, nad klawiaturą), ConfirmDialog, Toast (kolejka, akcja „Cofnij”, dwa regiony live); wspólne: „wstecz” zamyka, animacja wyjścia, blokada przewijania | scalone (#18) |
| 1e | Firebase 10.12.0 z npm (ta sama sesja co v1), logowanie e-mailem i Google, wylogowanie, bramy startu w kolejności v1, język z profilu; rejestracja, weryfikacja e-maila i pierwsza konfiguracja odsyłają do v1 (niżej); testy przeglądarkowe v2 na emulatorach z logowaniem | scalone (#19) |
| 1g | Styl referencyjny właściciela (D9, D10): jasny motyw LifeXP pod referencję (białe karty z cieniem, akcent z ikony LifeXP, kontrast ≥ 4.5:1), ikony z podpisem (`lucide-preact`), dolny pasek z „+” i „Menu”, `IconTile`, arkusz „Dodaj” (do etapu 3 odsyła do v1) | scalone (#20) |
| 2a | Ekran „Dziś” tylko do odczytu: punkty (≈ zł), poziom (G2), seria z tygodniem Pn–Nd i zamrożeniem (G3, liczone bez zapisu), punkty dziś względem limitu i granie (G1), saldo, skróty wg `enabledModules`, ostatnie 5 aktywności; `lib/dates` (dzień UTC i lokalny), konwertery i repozytoria `dailyLog`/`activities`/`activityDefs`/`money/balance`; e2e: te same liczby co dashboard v1 i zero zapisów | scalone (#21) |
| 1f | Service Worker v2 (`vite-plugin-pwa` + Workbox: precache całego buildu, nawigacje network-first 3 s, scope `/v2/`), manifest „LifeXP v2” z ikonami, meta iOS; v1 `sw.js` nie kasuje cache v2; Auth bez gapi przy starcie; akcent LifeXP ciemny rozdzielony na wypełnienie i tekst (4.5:1). Lighthouse (telefon, gzip jak Pages): wydajność 95, dostępność 100, dobre praktyki 100 | scalone (#23) |
| 2b | Obowiązki na „Dziś” (tylko odczyt): definicje v1 w kolejności `order` ze znacznikiem i liczbą wpisów z dnia lokalnego (G8, G13), wpisy dzisiejsze bez definicji (jednorazowe) zostają na liście, „Do wypłaty” = wszystkie nierozliczone wpisy × bieżący kurs obowiązków (G8.5–G8.7); e2e: te same kwoty co v1, zero zapisów | scalone (#24) |
| 2c | Statystyki `#/stats` i historia `#/stats/history` (tylko odczyt, G14): sumy z profilu, punkty i granie z 7 dni jako dwa osobne wykresy słupkowe (`ui/BarChart`: jedna oś od zera, etykiety tylko na najwyższym i dzisiejszym słupku, tooltip na najechanie/fokus/dotyk, wartości w tekście dla czytników), TOP 5 z ostatnich 50 wpisów, ciekawostki jak w v1; historia stronami po 15 z kursorem i licznikiem `count()`; ekran modułu dostaje ścieżkę z routera; e2e: te same liczby co v1, zero zapisów | scalone (#25) |
| 3a-1 | Notatki `#/notes`, `#/notes/:id` (pierwsze zapisy, G15): lista aktywne/archiwum z kolorem jako znakiem notatki, edytor (tytuł, kolor, Markdown z paskiem formatowania, Edytuj/Podgląd), archiwizacja z „Cofnij”, usuwanie z potwierdzeniem; dokumenty w kształcie v1 (ikona v1 zostaje nietknięta); `ui/Markdown` (marked + DOMPurify z npm, ładowane leniwie, jedyne miejsce z HTML); zapis nie czeka na serwer (offline kolejkuje Firestore); „+” → Notatka; e2e: parytet 8.3 (v1 i v2 zapisują ten sam dokument, v1 pokazuje notatkę z v2), sanityzacja XSS | scalone (#26) |
| 3a-1b | Ikony notatek (D11): wybór jednej z 12 ikon v1 w edytorze, ikona na kafelku w kolorze notatki na liście i w nagłówku; zapis `icon` przy edycji jak w v1; e2e: parytet v1↔v2 z ikoną | scalone (#27) |
| 1h | Płynny ruch (prośba właściciela 2026-09-30): wjazd każdego ekranu (Web Animations, bez przeładowania widoku), przesuwany wskaźnik w przełącznikach segmentowych i `ViewSwitch`, toast znika animacją, karty z danymi pojawiają się miękko, słupki i paski postępu rosną od zera, reakcja wierszy, drawera i dolnego paska na dotyk (bez skoku grubości tekstu); tokeny `--duration-enter/exit`, `--ease-out/in`; tylko `transform`/`opacity`; „ogranicz ruch” = 0 ms; e2e `motion.spec.js` | scalone (#27) |
| 3a-2 | Zadania `#/tasks` i budowa PC (G9): grupy „Po terminie” / „Do zrobienia” / „Zrobione”, arkusz dodawania i edycji (reguły v1: tekst, termin nie w przeszłości, rozmiar S/M/L, limit 30 łącznie ze zrobionymi), odhaczenie w transakcji (zadanie + `pcBuild`, kawałki tylko w terminie), kary za zaległe przy wejściu na ekran w transakcji odpornej na dwie karty, usuwanie z „Cofnij” (D8), karta budowy PC; `pcBuild` w profilu; „+” → Zadanie otwiera formularz; e2e: parytet 8.3 (pierwsze zadanie i kara dają ten sam stan w v1 i v2), v1 pokazuje zadanie z v2 | scalone (#28) |
| 3b-1 | Obowiązki `#/chores`: bieżący/poprzedni miesiąc z zarobkiem po bieżącym kursie, kalendarz (pn–nd, dni z wpisami i punktami, dziś), wpisy wybranego dnia z usuwaniem i „Cofnij”, „Do wypłaty” ze wszystkich miesięcy; dodawanie z arkusza z listą definicji i pytaniem „Dzisiaj / Wczoraj” w tym samym arkuszu (G8.2, G8.3), jednorazowe znikają w tym samym batchu (G8.4); „+” → Obowiązek; e2e: parytet 8.3 i v1 pokazuje wpis z v2. Rozliczenie w 3b-2 | scalone (#30) |
| 3b-2 | Rozliczenie „Do wypłaty” → Pieniądze w jednej transakcji (payout, skasowanie wpisów, saldo, transakcja przychodu z kategorią z i18n, `moneyIncomeAllTime`; wpisy czytane w transakcji, więc nic nie zostanie wypłacone dwa razy), potwierdzenie z kwotą, historia wypłat (najnowsze pierwsze, okres wpisów); e2e: parytet G8.5 (v1 i v2 dają ten sam stan), rozliczenie przerwane offline nie zmienia niczego i przechodzi po powrocie sieci, historia | scalone (#31) |
| 3b-3 | Lista obowiązków `#/chores/defs` (drugi widok modułu obok „Przeglądu”): definicje w kolejności v1, nowa w arkuszu (nazwa, opis, punkty, jedno z 12 emoji v1 albo brak, powtarzalny/jednorazowy; reguły v1), usuwanie z „Cofnij”; seed 8 definicji v1 dla konta bez żadnej (tylko po potwierdzeniu z serwera); e2e: parytet dodania i seeda z v1, v1 pokazuje definicję z v2, „Cofnij” przywraca ten sam dokument | scalone (#32) |
| 3c-1 | Pieniądze `#/money`: saldo z „W celach”, ten miesiąc wobec poprzedniego do tego samego dnia (wydatki i wpływy), alert limitu, transakcje po dniach (ostatnie 30 dni albo miesiąc z archiwum), dodawanie w arkuszu (wydatek/wpływ, kwota z saldem po operacji i kosztem w punktach, kategoria albo nowa, data UTC jak v1, notatka) i usuwanie z potwierdzeniem — każde jako jedna transakcja Firestore (saldo ≥ 0 sprawdzane na serwerze, punkty, `moneyIncomeAllTime`); przygotowanie konta jak `loadMoney()` (dokumenty, 5 kategorii, M2); „+” → Wydatek; e2e: parytet G5.1/G5.6 z v1, dwie karty naraz, v1 pokazuje transakcję z v2. Pożyczki w 3c-2, kategorie i limit w 3c-3 | scalone (#34) |
| 3c-2 | Pożyczki `#/money/loans` (drugi widok Pieniędzy obok „Przeglądu”): do odzyskania / do oddania, pożyczki z postępem spłaty, nowa w arkuszu (pożyczam komuś / od kogoś, osoba, kwota z saldem po operacji, data UTC jak v1, notatka), spłata w arkuszu (ograniczona do tego, co zostało, z podpowiedzią), usuwanie z potwierdzeniem — każde jako jedna transakcja Firestore z saldem (G6); e2e: parytet G6.1 i G6.3 z v1, blokady G6.4 i G6.6, v1 pokazuje pożyczkę z v2 | scalone (#35) |
| 3c-3 | Ustawienia Pieniędzy `#/money/settings` (trzeci widok obok „Przeglądu” i „Pożyczek”): miesięczny limit wydatków (puste = 200 zł, 0 = bez limitu, jak v1) i kategorie transakcji (dodawanie z kontrolą duplikatu i kolorem z kolejki v1, usuwanie z „Cofnij”); e2e: parytet z formularzem Ustawień v1, alert limitu znika po ustawieniu 0 | scalone (#36) |
| 3c-p | Poprawki po teście etapu 3c (właściciel 2026-10-01): przejście między widokami jednego modułu (Obowiązki, Pieniądze, Statystyki) przesuwa wskaźnik i treść zamiast wjazdu całego ekranu (`FeatureDef.views`, `ViewPanel`); „Do wypłaty” jako kwota i punkty w osobnych liniach (Obowiązki, Dziś); usuwanie powtórzonych kategorii Pieniędzy jednym zapisem z „Cofnij”, seed kategorii v2 pod stałymi id; otwarta karta proponuje odświeżenie, gdy wdrożono nowszy build | scalone (#37) |
| 3d-1 | Cele `#/goals` (G7): do 3 celów pieniężnych albo punktowych z postępem i „Brakuje”, nowy w arkuszu (rodzaj, nazwa, cena albo punkty), edycja nazwy i kwoty (rodzaj jak w v1 bez zmian), wpłata z salda Pieniędzy, usuwanie ze zwrotem odłożonych pieniędzy, osiągnięty cel oznaczany raz przez serwis; każda zmiana w transakcji na `users.goals` (i saldzie); „W celach” w Pieniądzach liczone z celów; e2e: parytet G7.1–G7.3 z v1, v1 pokazuje cel z v2 | scalone (#38) |
| 3d-2 | Cele na „Dziś” (PLAN 7.6): karta z każdym celem, paskiem postępu i „Brakuje”, link do `#/goals`, a bez celów zaproszenie „Ustaw cel”; osiągnięty cel oznaczany także z „Dziś” (jak dashboard v1); pusta karta obowiązków prowadzi do „Listy obowiązków” zamiast do v1; e2e: lista, przejście, pusty stan, oznaczenie z „Dziś” | scalone (#39) |
| 3e-1 | Zapis aktywności (G1): arkusz na „Dziś” (przycisk w karcie dnia, „+” → Aktywność) z rodzajem, czasem (szybki wybór 15–120 min), opisem i podglądem punktów obciętych do dziennego limitu; zapis w jednej transakcji (wpis, `dailyLog` dnia UTC, `points.total`/`earnedAllTime`), limit liczony z danych serwera, przy pełnym limicie nic nie jest zapisywane; nowy poziom ogłaszany toastem; definicje v1 seedowane pod tymi samymi id przy pierwszym otwarciu formularza (samo wejście na „Dziś” dalej niczego nie zapisuje); usuwanie z Historii z potwierdzeniem, w transakcji na danych serwera (G11, koniec B4); e2e: parytet G1.2 i G11 z v1, G1.7, G1.8, poziom, „+”, v1 pokazuje wpis z v2 | scalone (#40) |
| 3d-p | Poprawki po teście etapu 3d (właściciel 2026-10-02: „przyciski czasem nie działają do odświeżenia”): okno zamknięte przez samą przeglądarkę (Chrome na Androidzie zamyka górny `<dialog>` na „Wstecz”, czasem bez zdarzenia `cancel`) zgłasza to rodzicowi i zabiera swój wpis historii, więc przycisk, który je otwiera, znów działa; okno otwarte ponownie w trakcie animacji zamykania wraca zamiast zostać niewidoczne i modalne; zamykające się okno nie przyjmuje dotyku (tapnięcie w dół ekranu nie trafia w link „Dodaj w obecnej wersji” i nie przenosi do v1); e2e `modal.spec.js` na emulowanym telefonie | scalone (#40) |
| 3d-p2 | Obowiązki na „Dziś” (prośba właściciela 2026-10-02): dotknięcie zapisuje obowiązek na dziś, „Cofnij” w toaście zabiera wpis (i przywraca jednorazową definicję) jednym batchem; link „Zmień listę” do „Listy obowiązków”; e2e w `chores.spec.js` | scalone (#41) |
| 3d-p3 | Karta „Obowiązki dziś” (prośby właściciela 2026-10-02): każdy obowiązek na karcie zaznacza się raz dziennie (zrobiony zostaje wyłączony; w Obowiązkach nadal można zapisać kilka razy); domyślnie 3–4 obowiązki losowane na dzień bez zapisu (hash konta i dnia, ranking po id, jednorazowe nie są losowane), albo lista wybrana w edytorze „Edytuj listę” zapisana w nowym polu `users.choresCard` (`{mode, ids}`, v1 je ignoruje); nowy wygląd karty (stan z paskiem postępu, wiersz jako przycisk, płynnie wypełniany znacznik); `ui/Checkbox`; e2e: losowanie, raz dziennie, „Cofnij”, edytor z jednorazowym obowiązkiem, pusta lista nie zapisuje się | scalone (#42) |
| 3b-4 | Edycja obowiązku (prośba właściciela 2026-10-02; v1 umie tylko dodać i usunąć): dotknięcie obowiązku na „Liście obowiązków” otwiera ten sam arkusz w trybie edycji (nazwa, opis, punkty, emoji, rodzaj); id i miejsce na liście zostają, pola nieznane v2 też; „Cofnij” zapisuje stare pola; zapisane wpisy zostają z dawną nazwą i punktami; punkty pod nazwą, żeby długie nazwy miały miejsce; e2e: edycja, nieznane pole zostaje, „Cofnij” | scalone (#43) |
| 3e-2 | Seria i osiągnięcia zapisywane przez serwisy (G3, G4; koniec B15): zamrożenie zapisane raz transakcją i przykrywające tę samą lukę także później (świadoma zmiana wobec v1, GOLDEN G3.7); 14 odznak v1 sprawdzanych na „Dziś”, dopisywanych transakcją i ogłaszanych toastem; siatka odznak w Statystykach; sesje grania nie przechodzą do v2 (decyzja właściciela 2026-10-02: nikt ich nie używa) | scalone (#44) |
| 3e-3 | „Co teraz?” (generator v1): przycisk na „Dziś” obok „Zapisz aktywność” otwiera arkusz aktywności od razu z losowaniem, a „Losuj” jest też w samym arkuszu (bez arkusza z arkusza, PLAN 7.5); pula 33 aktywności v1 w języku aplikacji plus własne rodzaje, każda tak samo prawdopodobna; aktywność z puli zapisywana jak w v1 (`type: __generated__` + `typeName`); e2e: losowanie i zapis, parytet z generatorem v1 | scalone (#44) |
| 3d-p4 | Drugi powód zgłoszenia „przyciski czasem nie działają do odświeżenia” (2026-10-02): po zamknięciu arkusza następny ekran wjeżdżał ze stylem, który Chrome zapamiętał z czasu otwartego okna („inert”), i nie przyjmował dotknięć aż do odświeżenia; animacja wjazdu (`ui/motion.ts` `playEnter`) wymusza teraz pełne przeliczenie stylu ekranu; e2e w `modal.spec` (bez poprawki czerwone za każdym razem) | scalone (#45) |
| 3f-1 | Przegląd szkiców offline zgodnych z v1 (ten sam klucz `lifexp-offline-queue` i format wpisu): arkusz „Szkice zrobione offline” otwiera się sam po starcie online i po powrocie sieci, a także z przypomnienia na „Dziś”; „Dodaj” zapisuje aktywność, obowiązek albo transakcję tą samą transakcją co formularz, na obecnym stanie konta (limit dnia z dnia szkicu, saldo), z czasem utworzenia szkicu (GOLDEN G1, G8.9); szkic znika z kolejki dopiero po udanym zapisie; „Odrzuć” usuwa; szkic grania można tylko odrzucić (bez sesji grania w v2), nieznane typy zostają nietknięte dla v1; e2e: szkice z v1 zatwierdzone w v2 zostawiają ten sam stan konta co zatwierdzenie w v1 (DoD 3f) | scalone (#45) |
| 3f-2 | Szkice z v2: bez sieci pasek „Jesteś offline…” pod nagłówkiem, a zapis aktywności i transakcji trafia do kolejki w formacie v1 (v1 też go pokaże i zatwierdzi); po powrocie sieci przegląd otwiera się sam; e2e: offline → dwa szkice → online → zatwierdzenie | scalone (#45) |
| 4a | Ekran Ustawień `#/settings`: lista sekcji z tym, na co są ustawione, każda sekcja pod własnym adresem; Wygląd (motyw i tryb na urządzeniu, język w profilu `lang` i w kluczu v1 `lifexp-lang`), Konto (imię, do 30 znaków), Punkty i nagrody (dzienny limit 50–500, kurs punktów i kurs obowiązków jako „X zł za Y pkt”, pola v1 tego samego typu); skróty do ustawień w Obowiązkach i Pieniądzach; zakresy pól v1 sprawdzane z komunikatem zamiast zapisu wartości domyślnej; czcionka v1 nie przechodzi (jeden font, 7.2); e2e: zapis, walidacja, v1 pokazuje wartości z v2, ten sam zapis w v1 daje te same pola | scalone (#46) |
| 4b-1 | Moduły (M3, koniec B9): Ustawienia → Moduły z przełącznikiem przy każdym module v1 (Obowiązki, Pieniądze, Notatki, Statystyki XP, Gry, Ex-us); zmiana od razu, bez pytania, dane zostają; wyłączony moduł znika z menu, dolnego paska (jego miejsce zajmuje następny moduł z menu), „+” i „Dziś” (Statystyki XP zabierają też zapisywanie aktywności, jak w v1), a jego adres prowadzi na „Dziś”; dla modułów v1 prawdą zostaje `enabledModules` (v1 nadal je zmienia), v2 dopisuje obok `disabledModules`; konto z ankietą sprzed 24.08 (`planner`) ma Notatki; Zadania, Cele i „Dziś” są zawsze; e2e: wyłączenie i włączenie, Statystyki XP, konto z Plannerem, v1 ukrywa moduł wyłączony w v2, to samo `enabledModules` po wyłączeniu w v1 i v2 | scalone (#47) |
| 4b-2 | Tryb konta i pierwsze uruchomienie: pytania v1 przy pierwszym starcie (solo albo nadzorowane, potem moduły, wszystkie zaznaczone, dopóki ktoś ich nie odznaczy) zadaje teraz v2 i zapisuje pola v1 (`accountMode`, `enabledModules`, `onboardingDone`, obok `disabledModules`), więc v1 nie pyta drugi raz; do v1 trafia już tylko konto bez profilu; Ustawienia → Konto: tryb konta, a przejście na solo przy podpiętym rodzicu najpierw pyta, potem zrywa połączenie dokładnie jak v1 (`parentEmail` pusty, raport wyłączony, pola weryfikacji usunięte); e2e: pierwsze uruchomienie, v1 startuje bez pytań, solo z rodzicem (anuluj i potwierdź), bramki w `auth.spec` | scalone (#48) |
| 4c | Rodzaje aktywności (v1 Ustawienia → Aktywności): lista w kolejności v1 z kolorem i punktami za godzinę; nowy rodzaj w arkuszu (nazwa do 60 znaków, 1–10 000 pkt/h, ikona i kolor z presetów v1 wybierane po nazwie, bo v2 nie rysuje ikon Tablera, 7.1) zapisany jak w v1 (`name`, `points`, `icon`, `color`, `order` po ostatnim); zmiana rodzaju w tym samym arkuszu (tylko v2) i usuwanie z „Cofnij” (D8; v1 pyta); lista v1 zasiana przy wejściu, jak w Ustawieniach v1; e2e: walidacja, zapis, rodzaj od razu w arkuszu aktywności, zmiana i usunięcie z cofnięciem, v1 pokazuje rodzaj z v2, ten sam dokument z v1 | scalone (#49) |
| 4d | Zgłoszenia (strona zgłaszającego, v1 bug-reports.js): `#/reports` z kartą „Zgłoś błąd” (arkusz: tytuł do 80, miejsce z listy v1, opis do 400 z licznikiem) i listą „Moje zgłoszenia” na żywo; jedno zgłoszenie dziennie (dzień UTC jak `todayStr` v1), dodatkowe za każde przyjęte (`bonusGranted` → `bonusUsed`); filtr spamu ze słów admina (`bugReportsConfig/keywords`, bez dokumentu lista v1), spam widziany przez zgłaszającego jako „Sprawdzane”; zgłoszenie razem z `lastBugReportAt` albo zużyciem bonusu w jednym zapisie wsadowym (v1: dwa osobne); wątek w arkuszu, odpowiedź przez `arrayUnion` (koniec B13), „Nowa wiadomość” do przeczytania, znaczniki przeczytania pod kluczem v1 `lifexp-bug-read`; e2e: walidacja i zapis, limit, spam, bonus, wątek z wiadomością dopisaną w międzyczasie, v1 pokazuje zgłoszenie z v2, ten sam dokument z v1 | scalone (#50) |
| 4e-1 | Wiadomości globalne i historia aktualizacji: baner u góry dla każdego zalogowanego (ostatnie 10 `broadcasts` na żywo, najstarsze pierwsze, każda raz na urządzeniu na tyle sekund, ile ustawił admin, 1–30; „Zamknij” kończy wcześniej; widziane pod kluczem v1 `lifexp-seen-broadcasts`, więc pokazana w jednej wersji nie wraca w drugiej); admin wysyła i usuwa (po pytaniu) w widoku „Wiadomości” (`#/reports/broadcasts`); kto jest adminem, rozstrzygają reguły Firestore (v2 pyta serwer, adresu admina nie ma w kodzie ani w testach: testy wgrywają te same reguły z adresem testowym); „Aktualizacje” (`#/reports/updates`): CHANGELOG v1 jako dane, w języku aplikacji; e2e: wysyłka przez admina, baner raz na urządzeniu i na żywo, nie-admin nie widzi „Wiadomości”, historia, v1 nie pokazuje drugi raz | scalone (#51) |
| 4e-2 | Panel admina zgłoszeń (v1 bug-reports.js): w `#/reports` admin zamiast formularza widzi zakładki Nowe, Spam, Odłożone i Historia (przyjęte i odrzucone) z licznikami; wątek każdego zgłoszenia z akcjami v1 (przyjmij, odrzuć, odłóż, „To nie spam”, usuń po pytaniu); przyjęcie daje zgłaszającemu dodatkowe zgłoszenie (`bonusGranted`); spam nieuratowany przez 12 godzin znika, gdy admin otworzy panel (jak v1), z licznikiem godzin; słowa filtra spamu (`bugReportsConfig/keywords`, bez dokumentu lista v1) dodawane bez powtórzeń i usuwane z cofnięciem; e2e na regułach z adresem testowym: zakładki i sprzątanie spamu, przyjęcie z odpowiedzią, ratowanie spamu, usunięcie po pytaniu, słowa filtra | scalone (#52) |
| 4f | „Sprawdź spójność” (5.5 pkt 4) w Ustawieniach → Spójność danych: jedno dotknięcie czyta konto z serwera i zestawia liczniki z historią, niczego nie zapisując: punkty zdobyte = suma aktywności; wydane = koszty wydatków Money + zakupy v1 (`purchases`); do wydania = zdobyte − wydane; `dailyLog` każdego dnia UTC = suma jego aktywności (lista dni z różnicą); `moneyIncomeAllTime` = suma przychodów; saldo = przychody − wydatki − odłożone na cele + nieoddane pożyczki (do M6 cele i pożyczki nie mają wpisów), a wypłaty obowiązków bez transakcji `chore_payout` pokazane osobno, nie doliczone; przy każdej kontroli wartość z historii, z konta i różnica (tekst i ikona, nie sam kolor); przy okazji odstęp 24 px między sekcjami jednej strony Ustawień (wcześniej stykały się); e2e: zgodne konto bez zapisu, każda różnica z dniami i rozbiciem salda, konto po zapisie aktywności w v2 nadal spójne | scalone (#53) |
| 4-p1 | Poprawki zgłoszone przez właściciela (telefon, 2026-10-03): Ustawienia z menu i paska otwierały „Nie ma takiej sekcji” (link prowadził pod wzorzec trasy `/settings/:section?`; teraz `featurePath` bez parametrów, test rejestru dla każdego modułu); przy wyłączonych „Statystykach XP” Dziś nie pokazuje punktów, poziomu, serii ani karty dnia (v1 je zostawiało; decyzja właściciela), opis modułu to mówi; klasa `.stack` w 21 formularzach nie miała reguły CSS, więc pola i przyciski stykały się (Pieniądze → kategorie, arkusze) — teraz kolumna z odstępem 16 px; e2e: menu → Ustawienia, karty XP znikają i wracają z modułem, odstęp pole–przycisk | scalone (#53) |
| 4g-1 | E-mail rodzica i raport tygodniowy (v1 settings.js, „na razie jak v1”): w Ustawieniach → Konto, tylko w trybie nadzorowanym; cztery stany v1 (brak, kod wysłany, potwierdzony, adres sprzed weryfikacji do ponownego potwierdzenia); 6-cyfrowy kod ważny 10 min przez EmailJS (te same publiczne identyfikatory co v1), sprawdzany na kopii z serwera; v2 najpierw wysyła, potem zapisuje (v1 odwrotnie: nieudana wysyłka zostawiała „kod wysłany”); anulowanie, zmiana adresu; przełącznik `autoReport` z informacją, dokąd idzie raport; e2e z udawanym EmailJS: walidacja, żądanie jak v1, zły i dobry kod, raport, nieudana wysyłka bez zapisu, kod wygasły, adres sprzed weryfikacji, v1 pokazuje adres potwierdzony w v2. Do sprawdzenia przez właściciela: prawdziwy e-mail | scalone (#54) |
| 4g-2 | Powiadomienia push i godziny przypomnień (`fcmTokens`, `notifHours`): zgodnie z R7 zostają w v1 do cutover (dwa Service Workery = dwie subskrypcje = podwójne powiadomienia); v2 ich nie czyta i nie zapisuje. Uwaga: wysyłka push i raportu tygodniowego nie działa dziś w ogóle (workflowy `notify`/`weekly-report` usunięte 19.08, R10, D2) — przełącznik raportu z 4g-1 zapisuje `autoReport`, ale nic go jeszcze nie czyta; wysyłka wraca w etapie 6 | przeniesione do etapów 6–7 |
**Etap 4 zamknięty (2026-10-09).** DoD: parytet ustawień z v1 poza push (4g-2, R7) i wyborem czcionki (7.2); Notatnik widoczny dla kont, które przed 24.08 wybrały Planer (M3, #47, test `modules.spec.js`). Właściciel sprawdził prawdziwy e-mail z kodem (4g-1). Następny: etap 5 (Ex-us).


Kolejność od 2026-09-29: 1g → 2a (ekran „Dziś” tylko do odczytu, pierwszy ekran z danymi) → 1f. Właściciel
nie widział dotąd zmian w aplikacji, a 1f (offline, manifest) też jest niewidoczne, więc ekran z danymi idzie przed nim.

Zakres 1e (2026-09-29): v2 w etapie 1 niczego nie zapisuje. W v1 każdy krok po zalogowaniu coś zapisuje
(rejestracja tworzy profil, `verify.html` ustawia `emailVerified`, wybór trybu konta i ankieta modułów zapisują
ustawienia), więc v2 sprawdza te same bramy tylko do odczytu i przy brakach odsyła do v1: brak profilu, trybu
konta albo modułów → `app.html`, niepotwierdzony e-mail → `verify.html`, rejestracja → `index.html`. Konto jest
potwierdzone, gdy mówi to profil albo Firebase Auth (Google), jak w v1. Te ekrany przejdą do v2 przed cutoverem.

Źródło Pages przełączone na „GitHub Actions” 2026-09-29 (D3). Do czasu SW v2 (1f)
stronami `/v2/` zarządza SW v1 (scope `./`): online bez wpływu; offline `/v2/` otworzy się tylko z wcześniejszej
wizyty online, inaczej SW v1 pokaże `app.html`.

---

## 10. Ryzyka

| # | Ryzyko | Prawd. | Skutek | Mitygacja |
|---|---|---|---|---|
| R1 | Zapis v2 w kształcie nieczytelnym dla v1 / rodzica / raportu | Średnie | Awaria v1, złe dane u rodzica | Schemat addytywny, konwertery, kontrakt odwrotny w 8.3 |
| R2 | Równoległe użycie v1 i v2 na saldzie (v1 bez transakcji) | Średnie | Dryf salda/punktów | Zasada „jedna wersja naraz” w okresie próbnym, „Sprawdź spójność”, krótkie okno równoległe na moduł |
| R3 | Migracja uruchomiona dwa razy albo przerwana | Niskie | Podwójne wartości | Idempotencja + marker w tym samym batchu, dry-run na kopii |
| R4 | Utrata szkiców offline przy przejściu | Średnie | Utracone wpisy użytkownika | Ten sam klucz i format kolejki, test na szkicach z v1 |
| R5 | Konflikt Service Workerów / stary cache po cutover | Średnie | Mieszane wersje, biały ekran | Scope `/v2/` w okresie równoległym; przy cutover ten sam URL `sw.js`, czyszczenie starych cache, test na zainstalowanej PWA |
| R6 | Konflikt cache IndexedDB między wersjami SDK; v1 i v2 otwarte w dwóch kartach naraz | Niskie przy pinie | Błędy persistence; druga karta działa bez cache offline (single-tab manager) | SDK 10.12.x w v2 do etapu 8; jedna karta naraz |
| R7 | Podwójne powiadomienia push | Średnie | Irytacja | Push tylko w v1 do cutover |
| R8 | Zmiana klucza dni (UTC → lokalny) | Niskie | Wpisy z 0:00-2:00 w dniu przełączenia liczone inaczej | Tylko przy cutover, flaga w profilu, jawna notka w changelogu |
| R9 | Brak kodu Cloud Functions → odtwarzanie backendu | Pewne | Nieznany stary prompt/limity; ryzyko przypadkowego skasowania starych funkcji przy deployu | Odtwarzamy tylko `exusTurn` i funkcje rodzica; osobny codebase + celowany deploy (6.12); 5a nie zależy od backendu |
| R10 | Push/raport/CI nie działają już dziś | Pewne | Brak przypomnień i raportów od 25.07 (klucz), brak CI od 19.08 | Etap 0: `test.yml` przywrócony, klucz odnowiony; notify/weekly po poprawie danych (etap 6) |
| R11 | Zmiana sposobu deployu (Pages ze źródła „branch” na „GitHub Actions”) | Średnie | Wymaga zmiany w ustawieniach repo; upload przez przeglądarkę przestaje wystarczać | Jednorazowa zmiana w Settings → Pages; opis w `CLAUDE.md` |
| R12 | Legacy kształty danych, których nie przewidziano | Niskie | Crash albo złe liczby | Inwentaryzacja produkcji zrobiona (5.3); ponowne uruchomienie przed etapem 2 i cutover |
| R13 | Regresja UX: nawigacja drawerem wymaga dodatkowego tapnięcia | Średnie | Wolniejszy dostęp do modułów | Metadane w drawerze, szybkie akcje na „Dziś”, komendy Ex-us, gest krawędziowy |
| R14 | Niespójność kodu pisanego przez AI między sesjami | Średnie | Erozja architektury | `CLAUDE.md`, lint warstw, typy, małe PR-y, testy wymagane w DoD |
| R15 | Rozrost zakresu (nowe funkcje w trakcie rewrite) | Wysokie | Opóźnienie cutover | Parytet najpierw; nowe funkcje (np. usuwanie zadań) tylko jeśli trywialne i opisane |
| R16 | Limity/koszty Gemini po zmianie promptu i kontekstu | Niskie | Wyższy koszt tury | Budżet kontekstu, pomiar tokenów w `usage`, i tak 1 zamiast 2-3 wywołań |
| R17 | Weryfikacja emaila i reguły pozwalają userowi pisać dowolne pola (punkty, `emailVerified`, `parentEmail`) | Istnieje dziś | Nadzór rodzica do obejścia | Świadomie poza zakresem parytetu; etap 6 (kod rodzica w funkcji) i 8 (reguły) |

---

## 11. Rekomendacja i uzasadnienie

**Rekomendacja:** zachować backend Firebase i model danych, przebudować frontend jako
**Vite + TypeScript + Preact/signals, feature-folders z warstwami domain → services → data**, wdrażane
strategią strangler pod `/v2/` z testami parytetu na emulatorze; Ex-us jako **lokalny silnik komend
z jednym wywołaniem AI** zwracającym akcje w formacie komend; UI na design tokens bez ikon, z drawerem
mobilnym zamiast dolnego paska.

Uzasadnienie techniczne:

1. **Ryzyko danych jest największym ryzykiem projektu, nie UI.** Dlatego dane i reguły zostają, schemat jest
   addytywny, a każdy moduł przechodzi parytet v1↔v2 na tym samym emulatorze przed cutover. Big-bang
   rewrite nie daje żadnego punktu kontrolnego — strangler daje ich jedenaście.
2. **Większość obecnych bugów to jedna klasa: brak granic** (DOM + logika + zapisy w jednej funkcji,
   globalny mutowalny stan, zapisy bez transakcji). Warstwy z regułą zależności usuwają przyczynę, nie objawy:
   domena jest czysta i testowalna, serwis jest jedynym miejscem zapisu i zawsze atomowy.
3. **TypeScript i zod są dźwignią dla rozwoju z AI.** Model popełnia najczęściej błędy w nazwach pól,
   kształtach danych i nieobsłużonych brakach — dokładnie to łapie kompilator i schemat. Jeden schemat zod
   obsługuje walidację formularza, komendy Ex-us i kontrakt z Gemini.
4. **Preact zamiast vanilla**: deklaratywny render ze stanu eliminuje ręczne „co przerysować” (dziś ręczne
   listy w `refreshDynamicI18n` i reload po każdym zapisie). Rozmiar ~4 KB utrzymuje szybkość na telefonie,
   a zgodność z API Reacta daje modelom AI najlepiej znany wzorzec.
5. **Build step się opłaca**: przypięty SDK w lockfile, Firebase w bundlu (offline cold start), precache
   hashowanych plików (koniec B1), testy jednostkowe na prawdziwym kodzie (koniec harnessów-kopii).
6. **Ex-us „intencja przez AI, wykonanie lokalnie”** jest spełnione konstrukcyjnie: AI zwraca dane
   (`ParsedCommand`), a nie wykonuje; slash-komendy i akcje AI trafiają do tego samego pipeline i tych samych
   serwisów co formularze. Jedno wywołanie na wiadomość zamiast 2-3, a logika biznesowa przestaje żyć
   w Cloud Functions.
7. **Rejestr modułów jako jedno źródło** (nawigacja, route'y, ustawienia, komendy, kontekst AI) sprawia,
   że dodanie modułu to jeden katalog — dokładnie ta skala zmian, którą AI wykonuje najpewniej.
8. **UI na tokenach i jednym shellu** odpowiada na historię poprawek „coś wystaje / coś zasłania”: przepełnienia
   i warstwy są zasadą systemu sprawdzaną testem, a nie wyjątkiem łatanym per ekran.

---

## 12. Otwarte decyzje

| # | Decyzja | Rekomendacja | Blokuje |
|---|---|---|---|
| D1 | ~~Gdzie jest kod Cloud Functions?~~ **Rozstrzygnięte**: nieodnaleziony → odtwarzamy nowy backend (6.12) | — | — |
| D2 | ~~Czy usunięcie workflowów 19.08 było celowe?~~ **Rozstrzygnięte w etapie 0**: `test.yml` przywrócony; `notify`/`weekly-report` wracają w etapie 6 (skrypt raportu czyta nieaktualne dane) | — | — |
| D3 | ~~Build i deploy przez GitHub Actions?~~ **Rozstrzygnięte 2026-09-29: tak.** Źródło Pages przełączane dopiero w etapie 1, po scaleniu `deploy.yml` (wcześniejsze przełączenie zatrzymałoby publikację zmian) | — | — |
| D4 | ~~Które motywy zostają?~~ **Rozstrzygnięte 2026-09-29**: LifeXP ciemny (obecny) + jasny, nowy motyw iOS zamiast „Apple”, Gold bez zmian, wybór fontu zostaje (4.9) | — | — |
| D5 | Gry i FPS w v2 | Zostają jako moduł lazy (silnik bez zmian), FPS jako osobna strona | Etap 7 |
| D6 | `plannerTasks` (zadania dodane przez Ex-us, dziś niewidoczne) | Jednorazowy import niezrobionych do `todos` (M5) | Etap 3a |
| D7 | Czy rodzic ma widzieć notatki, zadania i rozmowy z Ex-us (`aiConversations`) | Notatki i rozmowy: nie (prywatne); zadania: tak | Etap 8 |
| D8 | ~~Czy dodać usuwanie zadań (v1 go nie ma)~~ **Zrobione w 3a-2**: usuwanie z „Cofnij”, budowa PC bez zmian | Tak, trywialne i oczekiwane | Etap 3a |
| D9 | ~~Ikony?~~ **Rozstrzygnięte 2026-09-29** (styl referencyjny właściciela): ikony tak, **zawsze obok tekstu** — nigdy jedynym nośnikiem znaczenia. Jeden zestaw SVG (`lucide-preact`, ISC) w bundlu, bez fontu ikon. Bez podpisu tylko znaki uniwersalne (×, ›, ✓, „+” z nazwą dostępną). Zmienia 7.1 | — | — |
| D10 | ~~Nawigacja na telefonie?~~ **Rozstrzygnięte 2026-09-29**: dolny pasek (Dziś, Obowiązki, „+”, Pieniądze, Menu) + dotychczasowy drawer z pełną listą modułów, otwierany przyciskiem „Menu” z paska. Desktop bez zmian (sidebar). Zmienia 7.3 i 7.4 | — | — |
| D11 | ~~Ikony notatek?~~ **Rozstrzygnięte 2026-09-30** (właściciel): w edytorze notatki da się wybrać ikonę, jak w v1. Dane bez zmian: 12 klas Tabler v1, rysowane odpowiednikami `lucide-preact`; ikona na kafelku w kolorze notatki, zawsze obok tytułu. Zmienia 7.1 | — | — |
