# LifeXP v1 — tabele golden (charakteryzacja zachowania)

Cel: opis tego, co v1 **faktycznie** robi dziś, łącznie z dziwactwami, jako specyfikacja dla domeny v2
(PLAN.md 8.2). Domena v2 musi przejść te przypadki. Świadoma zmiana zachowania = zmiana w tym pliku
w osobnym commicie z uzasadnieniem.

Status przypadku:
- **e2e** — potwierdzone testem na prawdziwym v1 z emulatorem (`tests/emulator/v1-characterization.spec.js`),
- **kod** — odczytane z kodu (wskazany plik i linie) i przeliczone w Node; do potwierdzenia e2e w etapie,
  w którym moduł jest przenoszony do v2.

Konwencje: kwoty w zł, `r2(x) = Math.round(x * 100) / 100`, „dzień UTC” = `todayStr()` (`toISOString`),
„dzień lokalny” = `dateISOLocal()`.

---

## G1. Punkty za aktywność i dzienny limit

`activities.js:103-153`, `persistActivity` 70-87.

- `earned = Math.round(minuty / 60 × pkt_na_godzinę)`; wymagany typ i `minuty ≥ 5` (atrybut `max=480` w HTML nie jest sprawdzany w JS).
- `przyznane = min(earned, max(0, limit − zdobyte_dziś))`, `limit = users.dailyLimit ?? 150`.
- `przyznane = 0` → komunikat „dzienny limit”, **nic nie jest zapisywane**.
- Zapis: `activities/{auto}` `{type, duration, points, desc, timestamp}`; `dailyLog/{dzień UTC}.pointsEarned += przyznane`
  (dokument tworzony z `gamingMinutes: 0`); `users.points.total` i `points.earnedAllTime` `+= przyznane`.

| # | Minuty | pkt/h | Zdobyte dziś | Limit | Wynik | Status |
|---|---:|---:|---:|---:|---|---|
| G1.1 | 60 | 40 | 0 | 150 | 40 | kod |
| G1.2 | 60 | 40 | 130 | 150 | 20; dailyLog = 150; total +20 | e2e |
| G1.3 | 45 | 35 | 0 | 150 | 26 (26,25) | kod |
| G1.4 | 30 | 35 | 0 | 150 | 18 (17,5 → w górę) | kod |
| G1.5 | 50 | 25 | 0 | 150 | 21 (20,83) | kod |
| G1.6 | 5 | 40 | 0 | 150 | 3 | kod |
| G1.7 | 4 | 40 | 0 | 150 | błąd „min. 5 minut”, brak zapisu | kod |
| G1.8 | 60 | 40 | 150 | 150 | błąd „dzienny limit”, brak zapisu | kod |

Offline: szkic z szacowaną liczbą punktów; cap liczony dopiero przy zatwierdzeniu, względem `dailyLog`
dnia z chwili utworzenia szkicu (`offline.js:121-144`), a `timestamp` = czas utworzenia szkicu.

v2 (etap 3e-1, `services/activity.ts`): te same reguły w jednej transakcji; zdobyte dziś i limit czytane
z serwera w transakcji, więc dwie karty nie przekroczą limitu razem. e2e `tests/v2/activity.spec.js`:
parytet G1.2 (v1 i v2 dają ten sam wpis, `dailyLog` i punkty), G1.7 i G1.8 w v2. Definicje aktywności v2
seeduje (te same id i pola co v1) przy pierwszym otwarciu formularza, nie przy starcie.

## G2. Poziom

`dashboard.js:253-266`. `poziom = floor(earnedAllTime / 500) + 1`, `w_poziomie = earnedAllTime mod 500`.
Tytuł: `levelTitles[min(poziom − 1, ostatni)]` z i18n.

| # | earnedAllTime | Poziom | XP w poziomie | Status |
|---|---:|---:|---|---|
| G2.1 | 0 | 1 | 0 / 500 | kod |
| G2.2 | 499 | 1 | 499 / 500 | kod |
| G2.3 | 500 | 2 | 0 / 500 | kod |
| G2.4 | 620 | 2 | 120 / 500 | e2e |
| G2.5 | 5000 | 11 | 0 / 500 | kod |

## G3. Seria (streak) i zamrożenie

`dashboard.js:268-359`.

- Dni aktywne = dokumenty `dailyLog` z `pointsEarned > 0` (klucze w dniach UTC).
- Start: dziś; jeśli dziś nieaktywny → wczoraj (seria nie „zrywa się” rano).
- Liczymy kolejne aktywne dni wstecz. Jedną lukę wolno przeskoczyć, jeśli zamrożenie jest dostępne
  (`streakFreezeLastUsed` brak albo starsze niż 7 dni) **i** seria > 0. Przeskoczony dzień nie wlicza się do serii.
- Użycie zamrożenia zapisuje `streakFreezeLastUsed = dziś (UTC)` — **w trakcie renderu dashboardu** (B15).

Oznaczenia: D0 = dziś, D1 = wczoraj, … ✓ aktywny, · brak.

| # | D0 | D1 | D2 | D3 | D4 | Zamrożenie | Seria | Zużyte zamrożenie | Status |
|---|---|---|---|---|---|---|---:|---|---|
| G3.1 | ✓ | ✓ | ✓ | · | · | niedostępne | 3 | nie | kod |
| G3.2 | · | ✓ | ✓ | · | · | niedostępne | 2 | nie | kod |
| G3.3 | ✓ | · | ✓ | ✓ | · | dostępne | 3 | tak | kod |
| G3.4 | ✓ | · | ✓ | ✓ | · | niedostępne | 1 | nie | kod |
| G3.5 | · | · | ✓ | ✓ | · | dostępne | 0 | nie (seria = 0 w chwili luki) | kod |
| G3.6 | ✓ | · | ✓ | · | ✓ | dostępne | 2 | tak (druga luka kończy) | kod |

## G4. Osiągnięcia

`dashboard.js:362-418`. Sprawdzane przy każdym ładowaniu dashboardu i po wpływie w Money; dopisywane, nigdy
odbierane.

| Id | Warunek |
|---|---|
| `first_activity` | earnedAllTime > 0 |
| `pts_1000`, `pts_5000` | earnedAllTime ≥ 1000 / 5000 |
| `first_purchase` | spentAllTime > 0 |
| `streak_7`, `streak_30` | seria ≥ 7 / 30 (po wpływie w Money liczona jako 0) |
| `gaming_hour` | gamingMinutes dziś ≥ 60 |
| `daily_limit` | pointsEarned dziś ≥ dailyLimit |
| `money_100` … `money_10000` | moneyIncomeAllTime ≥ 100 / 500 / 1000 / 2500 / 5000 / 10000 |

## G5. Money: transakcje

`money.js:257-351`. Kurs ogólny `r = pointsRateGeneralZl / pointsRateGeneralPts` (domyślnie 1/10).

- Wydatek: blokada, gdy `saldo − kwota < 0` (nic nie zapisuje). Koszt w punktach
  `min(ceil(kwota / r), points.total)`; `points.total −= koszt`, `spentAllTime += koszt`; `pointsCost` zapisany w transakcji.
- Wpływ: `saldo += kwota`, `moneyIncomeAllTime += kwota`, bez punktów.
- Saldo: `money/balance.current = r2(odczyt + delta)` (read-modify-write, B4).
- Usunięcie: odwrócenie salda, korekta `moneyIncomeAllTime` dla wpływu, zwrot `pointsCost` (`total +=`, `spentAllTime −=`).
- Kategoria zapisywana **po nazwie**; nowa kategoria z formularza zakładana przed zapisem transakcji.

| # | Operacja | Stan przed | Wynik | Status |
|---|---|---|---|---|
| G5.1 | wydatek 5,00 | saldo 50, total 120 | saldo 45; total 70; spent +50; pointsCost 50 | e2e |
| G5.2 | wydatek 4,99 | total 120 | koszt 50 (49,9 → w górę) | kod |
| G5.3 | wydatek 0,01 | total 120 | koszt 1 | kod |
| G5.4 | wydatek 20,00 | saldo 50, total 120 | koszt 120 (200 obcięte do total) | kod |
| G5.5 | wydatek 60,00 | saldo 50 | błąd „za mało środków”, brak zapisu | kod |
| G5.6 | wpływ 30,00 | saldo 50 | saldo 80; moneyIncomeAllTime +30; bez punktów | e2e |

Sprawdzone w Node: przy kursie domyślnym `ceil(kwota / r)` daje dokładny wynik dla wszystkich kwot
0,01-1000,00 zł (brak błędów zmiennoprzecinkowych).

v2 (etap 3c-1, `tests/v2/money.spec.js`): G5.1 i G5.6 e2e — v1 i v2 zapisują to samo konto do identycznego
stanu (saldo, punkty, `moneyIncomeAllTime`, dokument transakcji, nowa kategoria z kolorem z kolejki; bez id
i `createdAt`), G5.5 blokuje bez zapisu, usunięcie wydatku przywraca stan sprzed niego, v1 pokazuje transakcję
z v2. Koszt w punktach liczony tym samym wyrażeniem co v1 (test jednostkowy dla każdej kwoty do 1000 zł).
Każda zmiana salda to jedna transakcja Firestore, która czyta saldo i profil (koniec B4): dwie karty zapisujące
w tej samej chwili dają poprawną sumę (test e2e). Różnica: v2 nie pozwala usunąć wpływu, jeśli saldo spadłoby
poniżej zera (v1 pozwala i saldo robi się ujemne). Osiągnięcia po wpływie v1 nadrabia przy wejściu na dashboard.
Otwarcie Pieniędzy w v2 robi to co `loadMoney()` v1: dokumenty `money/settings` (200 zł) i `money/balance` (0),
5 kategorii startowych (tylko po potwierdzeniu z serwera, że nie ma żadnej), M2 dla konta bez
`moneyIncomeAllTime`.

v2 (etap 3c-3): limit i kategorie jak w Ustawieniach v1 (`money.js:568-640`), e2e: ten sam dokument
`money/settings` (`{monthlyLimit, currency: 'PLN'}`, puste pole = 200 zł, 0 = bez limitu) i ta sama nowa
kategoria (nazwa po `trim`, kolor z kolejki, `icon: ''`); duplikat nazwy bez względu na wielkość liter odrzucony.
Usunięcie kategorii z „Cofnij” (D8) zamiast potwierdzenia; transakcje zachowują nazwę.

## G6. Money: pożyczki

`money.js:353-524`. Pożyczki ruszają saldo, ale **nie tworzą transakcji** i nie zmieniają punktów.

| # | Operacja | Wpływ na saldo | Blokada |
|---|---|---|---|
| G6.1 | nowa „pożyczyłem komuś” (lent) X | −X | saldo < X |
| G6.2 | nowa „pożyczyłem od kogoś” (borrowed) X | +X | — |
| G6.3 | spłata lent Y | +min(Y, pozostało) | — |
| G6.4 | spłata borrowed Y | −min(Y, pozostało) | saldo < kwota |
| G6.5 | usunięcie lent | +pozostało | — |
| G6.6 | usunięcie borrowed | −pozostało | saldo < pozostało |

Spłata do końca ustawia `completedAt` (raz).

v2 (etap 3c-2, `tests/v2/money.spec.js`): G6.1 i G6.3 e2e — v1 i v2 zapisują ten sam dokument pożyczki i to samo
saldo (bez id i czasów; `completedAt` tylko ustawione albo nie), v1 pokazuje pożyczkę z v2. G6.4 i G6.6
blokują bez zapisu. Każda operacja to jedna transakcja Firestore: czyta pożyczkę i saldo, więc spłata liczona
jest od tego, co faktycznie zostało na serwerze, i nie może się policzyć dwa razy (v1 liczy od stanu
wczytanego wcześniej i zapisuje pożyczkę i saldo osobno, B3/B4). Usunięcie z potwierdzeniem, które mówi,
ile wróci albo zejdzie z salda.

## G7. Cele

`dashboard.js:49-250`. Tablica `users.goals` (max 3).

| # | Operacja | Wynik |
|---|---|---|
| G7.1 | nowy cel | `{id, name, type, amount, celebrated: false, saved: 0}`; czwarty → błąd |
| G7.2 | wpłata X na cel pieniężny | blokada, gdy X > saldo; saldo −X; `saved += X` |
| G7.3 | usunięcie celu pieniężnego z `saved` > 0 | saldo +saved |
| G7.4 | edycja: typ pieniężny → punktowy | saldo +saved; `saved = 0`; `celebrated = false` |
| G7.5 | postęp celu punktowego | `points.total` (bieżące saldo punktów, nie earnedAllTime) |
| G7.6 | osiągnięcie | `celebrated = true` zapisane raz, **w trakcie renderu** (B15) |
| G7.7 | legacy `goalName/goalType/goalAmount/goalCelebrated` bez `goals` | migracja do `goals[0]`, stare pola usuwane |

v2 (etap 3d-1, `tests/v2/goals.spec.js`): G7.1, G7.2 i G7.3 e2e — v1 i v2 zapisują ten sam wpis w `goals`
(bez id) i to samo saldo; v1 pokazuje cel z v2. Każda zmiana czyta i zapisuje tablicę `goals` w transakcji
(z saldem przy wpłacie i usunięciu), zmieniając wpis w miejscu, więc pola dopisane przez v1 lub backend zostają.
G7.4: w formularzu v1 typu celu nie da się zmienić (edycja przejmuje typ celu), więc ścieżka zwrotu przy zmianie
typu jest w v1 nieosiągalna z UI; v2 też nie zmienia typu. Edycja, jak w v1, ustawia `celebrated: false`.
G7.6: v2 oznacza osiągnięty cel w serwisie (transakcja sprawdza osiągnięcie na danych z serwera), nie w trakcie
renderu, i ogłasza go raz. G7.7: bez migracji (M1 skreślona).

## G8. Obowiązki

`chores.js`. Kurs `r = pointsRateChoresZl / pointsRateChoresPts` (domyślnie 0,45 zł / 1 pkt).
Daty wpisów lokalne (`dateISOLocal`), inaczej niż `dailyLog`.

| # | Sytuacja | Wynik | Status |
|---|---|---|---|
| G8.1 | dodanie obowiązku | wpis `{choreId, choreName, choreEmoji, points, dateISO (lokalnie), monthKey, createdAt}` | kod |
| G8.2 | ten sam obowiązek już dziś, wczoraj jeszcze nie, ten sam miesiąc | pytanie „dziś / wczoraj” | e2e |
| G8.3 | jak G8.2, ale wczoraj był poprzedni miesiąc | zapis na dziś bez pytania | e2e |
| G8.4 | obowiązek jednorazowy | definicja kasowana po dodaniu wpisu | e2e |
| G8.5 | rozliczenie 10 + 30 pkt | payout `{points: 40, amountPln: 18, fromISO, toISO}`; wpisy skasowane; saldo +18; transakcja income 18 `source: 'chore_payout'`; moneyIncomeAllTime +18 | e2e |
| G8.6 | rozliczenie 7 pkt | 3,15 zł | kod |
| G8.7 | zmiana kursu przed rozliczeniem | rozliczenie liczone po **bieżącym** kursie dla wszystkich wpisów | kod |
| G8.8 | kategoria transakcji z rozliczenia | tekst z i18n w języku ustawionym w chwili rozliczenia | kod |
| G8.9 | offline | szkic z datą lokalną, bez pytania „wczoraj” | kod |
| G8.10 | brak jakiejkolwiek definicji przy wejściu w Obowiązki albo Ustawienia | 8 definicji z seeda pod stałymi id (`chores.js:15-34`), sprawdzane raz na załadowanie strony; po skasowaniu wszystkich wracają przy następnym załadowaniu | e2e |
| G8.11 | nowa definicja (Ustawienia) | `{name (trim), desc (trim), emoji (jedno z 12 albo ''), points (liczba całkowita > 0), oneTime, order = max(order) + 1 albo 0}`; `settings.js:276-297` | e2e |

v2 (etap 3b-1, `tests/v2/chores.spec.js`): ten sam wpis co v1 (bez id i `createdAt`), v1 pokazuje wpis z v2;
G8.2 i G8.3 zależnie od dnia uruchomienia (1. dnia miesiąca wychodzi G8.3). Wpis i usunięcie jednorazowej
definicji idą jednym batchem — v1 zapisuje je po kolei i połyka błąd kasowania definicji. Usunięcie wpisu
z „Cofnij” przywraca ten sam dokument.

Rozliczenie obejmuje wszystkie nierozliczone wpisy ze wszystkich miesięcy. Kasowanie wpisów połyka błędy
(`chores.js:150-152`) — przy awarii w połowie możliwa niespójność (B3).

v2 (etap 3b-2, `tests/v2/chores.spec.js`): G8.5 e2e — v1 i v2 rozliczają to samo konto do identycznego stanu
(payout, wpisy, saldo, transakcja, `moneyIncomeAllTime`; bez id i `createdAt`). Rozliczenie to jedna transakcja:
czyta saldo i każdy wpis, więc wpis usunięty w innej karcie nie zostanie wypłacony, a przerwane (offline) nie
zmienia niczego — test sprawdza, że stan po nieudanej próbie jest identyczny jak przed nią, a kolejna próba
przechodzi. v2 nie sprawdza osiągnięć przy rozliczeniu; v1 robi to przy każdym wejściu na dashboard, więc
nadrabia je przy najbliższym otwarciu v1.

v2 (etap 3b-3, `tests/v2/chores.spec.js`): lista obowiązków `#/chores/defs`. Nowa definicja jak z formularza v1
(G8.11, e2e: v1 i v2 zapisują ten sam dokument, v1 pokazuje definicję z v2); v2 dodatkowo odrzuca więcej niż
10 000 pkt, na co v1 pozwala mimo `max` w polu. Usuwanie z „Cofnij” zamiast potwierdzenia (D8) przywraca ten sam
dokument pod tym samym id; wpisy zostają. Seed (G8.10) jak w v1 (e2e: ten sam zestaw dokumentów), ale tylko gdy
serwer potwierdzi, że definicji nie ma — offline pusty cache niczego nie przesądza, więc v2 wtedy nie zapisuje nic.

## G9. Zadania i budowa PC

`notes.js:33-137`, `561-683`. Kolejność: `case`, `motherboard`, potem `gpu/cpu/psu/ram` w losowej kolejności
ustalonej raz na konto. Kawałki: S = 1, M = 2, L = 3. Max 3 na komponent.

| # | Stan budowy (bieżący komponent) | Akcja | Wynik |
|---|---|---|---|
| G9.1 | case 0/3 | zrobione w terminie, L | case 3/3 → bieżący motherboard |
| G9.2 | case 2/3 | zrobione w terminie, L | case 3/3, nadmiar 2 przepada, bieżący motherboard |
| G9.3 | motherboard 1/3 | zrobione po terminie | brak kawałków |
| G9.4 | case 3/3, motherboard 3/3, bieżący gpu 1/3 | kara za przeterminowane | motherboard 2/3, bieżący dalej gpu |
| G9.5 | żaden komponent nie jest 3/3 | kara | bez zmian, ale `penaltyApplied = true` |
| G9.6 | zadanie z terminem dziś | zrobione dziś | w terminie (dzień terminu się liczy, data lokalna) |

Kary naliczane przy wejściu w Notatnik, raz na zadanie. Odhaczenie jest nieodwracalne. Brak usuwania zadań.
Limit 30 zadań liczy też zrobione. Treść max 500 znaków (Markdown), termin z kalendarza lokalnego (G13).

v2 (etap 3a-2, `tests/v2/tasks.spec.js`, e2e na v1 i v2): ten sam dokument zadania i ten sam nowy `pcBuild`
(obudowa i płyta pierwsze, reszta losowo, zera) przy pierwszym zadaniu; G9.2–G9.5 na prawdziwych dokumentach.
Różnice, wszystkie bez zmiany kształtu danych:
- kary naliczane przy wejściu w Zadania, w transakcji, która ponownie czyta zadania — dwie karty albo dwa
  urządzenia nie ukarzą tego samego zadania dwa razy (v1 czyta i zapisuje osobno);
- odhaczenie i kawałki w jednej transakcji (zadanie + `pcBuild`); offline się nie uda i zostanie ponowione;
- usuwanie zadań (D8), z „Cofnij”; budowa zostaje bez zmian;
- ostrzeżenie o karze przy dodawaniu jest tekstem przy przycisku, nie osobnym oknem.

## G10. Granie

`activities.js:194-280`. Sesja 1-1440 min; suma dnia (data z pola, domyślnie dzień UTC) ≤ 1440;
`dailyLog.gamingMinutes += minuty`. Usunięcie: `gamingMinutes = max(0, obecne − minuty)`.

## G11. Usunięcie aktywności

`dashboard.js:476-516`. Dzień = dzień UTC z `timestamp` aktywności.
`dailyLog.pointsEarned = max(0, obecne − pkt)`; `points.total = max(0, total − pkt)`;
`points.earnedAllTime = max(0, … − pkt)`. `spentAllTime` bez zmian. Read-modify-write (B4).
v2 (etap 3e-1): te same wartości, liczone w transakcji z danych serwera (koniec B4); usuwanie z Historii.
e2e `tests/v2/activity.spec.js`: v1 i v2 usuwają do tego samego stanu.

## G12. Zgłoszenia błędów

`bug-reports.js`. Limit 1 zgłoszenie na dzień UTC (`lastBugReportAt`); zaakceptowane zgłoszenie daje jeden
bonus (`bonusGranted`), zużywany (`bonusUsed`) tylko, gdy limit blokuje. Spam = opis bez żadnego słowa
z `bugReportsConfig/keywords` (lista domyślna, gdy dokumentu brak). Spam starszy niż 12 h kasowany przy
wejściu admina.

## G13. Dzień „dziś” w różnych modułach

| Moduł | Funkcja | Kalendarz |
|---|---|---|
| Aktywności, limit, `dailyLog`, streak, wykresy, freeze, raport tygodniowy | `todayStr()` / `toISOString` | UTC |
| Obowiązki, zadania (termin, kara), lista transakcji (30 dni) | `dateISOLocal()` | lokalny |
| Domyślna data transakcji, pożyczki, sesji grania | `todayStr()` | UTC |

W Polsce między 00:00 a 01:00 (zima) / 02:00 (lato) te dwa kalendarze wskazują różne dni (B2, migracja M4).

## G14. Statystyki i historia

`history-stats.js`. Okna liczone od tego samego „dziś” (dzień UTC, G13): ten tydzień = dziś − 6 … dziś,
poprzedni = dziś − 13 … dziś − 7 (to ostatnie 7 dni, nie tydzień kalendarzowy). Dzień bez `dailyLog` = 0.

| # | Sytuacja | Wynik | Status |
|---|---|---|---|
| G14.1 | „Łącznie zarobione / wydane” | `points.earnedAllTime` / `points.spentAllTime` z profilu; „Czas grania łącznie” to suma **7 dni**, mimo etykiety (v2: „Granie w 7 dni”) | e2e |
| G14.2 | TOP aktywności | 50 najnowszych wpisów pogrupowanych po `type` (wpis bez typu pominięty), malejąco po liczbie wpisów, remis w kolejności pierwszego wystąpienia (kod); nazwa z definicji, bez niej surowe id (nie `typeName`); pokazane 5 | e2e |
| G14.3 | Ciekawostki | w kolejności: ulubiona aktywność (pierwsza z TOP); porównanie punktów tydzień do tygodnia (więcej / mniej / tyle samo, gdy > 0); wartość tygodnia × kurs ogólny; porównanie grania (tylko gdy różne); najlepszy dzień = pierwszy dzień z maksimum licząc od najstarszego, gdy > 0. Brak zdań → karta ukryta | e2e |
| G14.4 | Historia | wszystkie aktywności malejąco po `timestamp`, strony po 15, licznik „Strona x / y · n aktywności” | e2e |

e2e = `tests/v2/stats.spec.js` sprawdza v1 i v2 na tym samym koncie w emulatorze.
v2: historia czyta stronę kursorem (`limit(16)` + `startAfter`) zamiast całej kolekcji (B16), licznik z
`count()` na serwerze; usuwanie wpisu z historii od etapu 3e-1 (G11).

## G15. Notatki

`notes.js:370-559`. Dokument `{title, content, icon, color, createdAt (ISO string), archived}`; lista
`orderBy('createdAt', 'desc')`.

| # | Sytuacja | Wynik | Status |
|---|---|---|---|
| G15.1 | tytuł pusty albo same spacje | brak zapisu, „Nadaj notatce tytuł.”; tytuł zapisywany po `trim()`, treść bez zmian | e2e |
| G15.2 | treść > 1000 linii | brak zapisu, komunikat z liczbą linii | kod |
| G15.3 | 30 aktywnych notatek | nowa notatka zablokowana; zarchiwizowane się nie liczą; przywrócenie z archiwum limitu nie sprawdza (kod) | e2e |
| G15.4 | nowa notatka | `icon` = klasa Tabler z 12 presetów (`ti-notebook` … `ti-music`) albo `""` (bez wyboru: v1 pokazuje notatnik), `color` = preset albo `""`, `archived: false`, `createdAt` = ISO | e2e |
| G15.5 | edycja | `updateDoc({title, content, icon, color})`; nietknięta ikona zostaje taka, jaka była | e2e |
| G15.6 | archiwizacja / przywrócenie | jedno pole `archived` | e2e |
| G15.7 | usunięcie | `deleteDoc` po potwierdzeniu; w archiwum „Usuń trwale” | e2e |
| G15.8 | treść | Markdown (`breaks: true`) przez marked + DOMPurify; bez bibliotek — zwykły tekst | e2e |

e2e = `tests/v2/notes.spec.js`: ten sam scenariusz w v1 i v2 daje ten sam dokument (bez id i `createdAt`),
a v1 pokazuje notatkę zapisaną przez v2.
