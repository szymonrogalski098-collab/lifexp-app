# LifeXP v2 — benchmark podobnych aplikacji

Cel: sprawdzić, jak rozwiązują te same problemy aplikacje, z których użytkownik LifeXP korzysta na co dzień
(prawo Jakoba: użytkownik oczekuje, że nasza aplikacja zachowa się jak te, które już zna), i przełożyć to
na konkretne decyzje w `PLAN.md`.

Metoda i ograniczenia: przegląd wytycznych platform (Material 3, Apple HIG), badań NN/g i opisów/recenzji
aplikacji referencyjnych. Polityka sieciowa środowiska blokuje pobieranie większości tych stron, więc
wnioski opierają się na streszczeniach wyników wyszukiwania i jednym źródle pobranym w całości
(opis wzorca sidebara ChatGPT). Brak zrzutów ekranu — przed etapem 1 warto przejrzeć ekrany w Mobbin
(kategorie: navigation drawer, bottom sheet, command palette, empty state) jako materiał wizualny.

---

## 1. Aplikacje i co z nich bierzemy

| Obszar LifeXP | Referencja | Co robią dobrze | Bierzemy | Unikamy |
|---|---|---|---|---|
| Nawigacja mobilna | ChatGPT (iOS) | Ekran główny odsuwa się jak karta, menu leży „pod spodem”; gest śledzi palec, puszczenie z pędem otwiera/zamyka, przerwany gest wraca do najbliższego stanu | Dokładnie ten model ruchu (sekcja 3) | Przyciemniania całego ekranu zamiast odsunięcia karty |
| Nawigacja mobilna | Monarch Money | 5 zakładek na dole + dodatkowe sekcje w sidebarze otwieranym z profilu | Tylko jako plan awaryjny, gdyby testy pokazały problem z odkrywalnością | — (decyzja: bez dolnego paska) |
| Nawigacja — zasady | Material 3 | Dolny pasek: 3-5 celów. Więcej niż 5 → navigation drawer. Modal drawer na compact i medium (< 840 dp) | Drawer jest zgodny z wytycznymi: LifeXP ma 8+ celów (v1 łamie limit — 8 pozycji w dolnym pasku) | Upychania 8 pozycji w pasek |
| Nawigacja — badania | NN/g | Ukryta nawigacja: ok. połowa odkrywalności, widoczna używana 1,5× częściej, +2,5 s na zadanie, zadania oceniane jako 15% trudniejsze. Hamburger nie jest powszechnie rozumiany | Kompensaty: tekstowy przycisk „Menu”, ekran Dziś jako hub z bezpośrednimi wejściami, globalne pole Ex-us/komend | Gołej ikony hamburgera |
| Warstwa nawigacji | Apple HIG (iOS 26, Liquid Glass) | Efekt szkła tylko dla warstwy nawigacji unoszącej się nad treścią; treść czysta i czytelna | Półprzezroczysty top bar z rozmyciem, karty pełne | Rozmycia na kartach (v1: spadki FPS w motywie Apple) |
| Dziś / skupienie | Things 3 | Widok Today jako tryb skupienia: tylko to, co na dziś. Typografia, białe przestrzenie, hierarchia zamiast ozdobników (Apple Design Award) | Ekran Dziś tylko z rzeczami do zrobienia/sprawdzenia dziś; reszta w modułach | Dashboardu „wszystko naraz” jak v1 |
| Szybkie dodawanie | Todoist Quick Add | Jedna linia: data, projekt, priorytet rozpoznawane w locie, podświetlane i usuwane z tytułu, podgląd przed Enter | Podświetlanie rozpoznanych fragmentów w polu komendy na żywo (parser 6.3) | Ukrytej składni bez podglądu |
| AI → zadania | Todoist Ramble (Gemini) | Wiele zadań z jednej wypowiedzi, tryb podglądu, poprawki słowem („właściwie chodziło mi o…”, „usuń to”) | Poprawki odnoszą się do oczekujących kart zamiast tworzyć nowe akcje | Wykonywania bez podglądu |
| Paleta komend | Linear, Raycast, Vercel | Pusta paleta = ostatnie i częste akcje; grupy wyników; dokładny prefiks wygrywa z dopasowaniem rozmytym; wiersz = tytuł + typ + detal; brak wyników nigdy nie jest ślepą uliczką; widoczna podpowiedź skrótu | Wszystko; „brak wyników” → „Zapytaj Ex-us: …” | Płaskiej listy > 10 pozycji bez grup |
| Potwierdzanie akcji AI | Wzorce human-in-the-loop | Potwierdzenie proporcjonalne do ryzyka i odwracalności; karta musi pokazać faktyczny ładunek (kwota, odbiorca, zmiana); rutynowe akcje → lekka kontrola albo „po fakcie” z cofnięciem, żeby nie męczyć | Pole `effects` w karcie (np. saldo przed/po); polityka zależna od źródła komendy (sekcja 4) | Kart „Czy na pewno?” bez konkretów |
| Budżet | Copilot Money | Najlepiej oceniany design w kategorii: hierarchia prowadzi wzrok, transakcje grupowane po dniach, „ten miesiąc vs poprzedni do tego samego dnia” | Grupowanie po dniach; porównanie miesiąc-do-dnia na ekranie Pieniądze | Wykresów dla samej dekoracji |
| Cele / skarbonki | Revolut Vaults | Nazwany cel z kwotą, środki odłożone osobno od salda | Potwierdza model v1 (cel pieniężny z `saved`, osobno od salda) — na ekranie Pieniądze wyraźny podział „Dostępne / W celach” | — |
| Obowiązki → pieniądze | BusyKid, Greenlight | Stały „dzień wypłaty” (np. piątek) z prośbą do rodzica o zatwierdzenie; tryby: stała kwota / proporcjonalnie / wszystko albo nic | Backlog: przypomnienie o wypłacie; w trybie nadzorowanym zatwierdzenie rozliczenia przez rodzica | Automatycznych wypłat bez kontroli |
| Obowiązki dzieci | NatWest Rooster Money | Tygodniowa lista albo jednorazowe zadania, gwiazdki jako waluta, „pots” (wydaję / oszczędzam / oddaję + cele) | Potwierdza obecny model (stałe + jednorazowe obowiązki, osobny kurs) | — |
| Seria (streak) | Duolingo | Seria oparta na awersji do straty; minimalny próg dnia (2 minuty wystarczą); „zamrożenie” zmniejsza porzucanie po jednym opuszczonym dniu bez osłabiania motywacji | Jasny komunikat, co liczy się jako dzień serii; freeze z v1 zostaje | Presji i powiadomień wywołujących wstyd |
| Przerwa w serii | Apple Watch (Pause Rings) | Pauza na dziś / tydzień / miesiąc / do 90 dni; dni pauzy neutralne, historia nietknięta | Backlog: tryb „Przerwa” dla serii i limitu dziennego | — |
| Poziomy i cele | Todoist Karma | Poziomy, cele dzienne i tygodniowe, serie, tryb urlopowy chroniący serię | Potwierdza poziomy z v1; tryb przerwy (jak wyżej) | — |
| Łagodna grywalizacja | Finch | Opuszczony dzień nie karze, aplikacja „czeka”; nacisk na wracanie, nie na perfekcję | Ton komunikatów po przerwanej serii: zachęta do powrotu, bez straty „życia” | — |
| Przestroga | Habitica | Krytykowana za zagracony interfejs; mechaniki gry (statystyki, ekwipunek, questy) przeszkadzają w samym śledzeniu zadań i nudzą się z czasem | Grywalizacja jako warstwa informacji, nigdy dodatkowy krok w podstawowej czynności | Rozbudowy mechanik gry w głównym przepływie |
| Arkusze (sheets) | NN/g, Mobbin, iOS | Wyraźny przycisk „Zamknij” (nie tylko uchwyt); jeden arkusz na akcję, bez arkusza z arkusza; przy klawiaturze arkusz rośnie do pełnej wysokości; gest z pędem | Wszystko — tekstowe „Zamknij” pasuje do UI bez ikon | Zagnieżdżonych arkuszy (v1: modal z modala) |
| Etykiety vs ikony | Badania użyteczności | Tekst jest jednoznaczny; ikony skracają wizualne wyszukiwanie tylko, gdy są znane | Kompensata szybkości skanowania: stałe pozycje, krótkie etykiety (1-2 słowa), kolorowa kropka z danych, wyrównane metadane | Długich, zmiennych etykiet |
| Wpisywanie kwot | Wzorce fintech | Klawiatura numeryczna, duża prezentacja kwoty, powiązana etykieta, jasne błędy | `inputmode="decimal"`, duża kwota w arkuszu, podgląd salda po operacji | `type="number"` (spinnery, problem z przecinkiem) |

---

## 2. Zadania użytkownika (job stories) i budżety tapnięć

Budżet = maksymalna liczba tapnięć od ekranu Dziś do zapisanej akcji (bez wpisywania tekstu).
Test e2e mierzy go dla każdej pozycji.

| Moduł | Job story | Budżet |
|---|---|---|
| Obowiązki | Kiedy skończę obowiązek, chcę go odnotować w kilka sekund, żeby nie zapomnieć, zanim zostanie rozliczony | 2 (Dodaj obowiązek → wybór) |
| XP | Kiedy skończę sesję nauki albo pracy, chcę zapisać, co zrobiłem, żeby zobaczyć postęp i zdobyć punkty | 3 + czas |
| Money | Kiedy coś kupię albo dostanę pieniądze, chcę to zapisać od razu, żeby saldo zgadzało się z rzeczywistością | 3 + kwota |
| Zadania | Kiedy przypomnę sobie o czymś do zrobienia, chcę to zapisać jednym zdaniem, żeby wyrzucić to z głowy | 1 + tekst (pole Ex-us/komend) |
| Zadania | Kiedy zrobię zadanie, chcę je odhaczyć tam, gdzie je widzę, żeby dostać kawałki PC | 1 (na ekranie Dziś) |
| Cele | Kiedy odkładam pieniądze, chcę widzieć, ile brakuje do celu, żeby wiedzieć, czy stać mnie na wydatek | 0 (widoczne na Dziś) |
| Ex-us | Kiedy nie chcę klikać przez formularze, chcę powiedzieć, co zrobiłem, żeby aplikacja zapisała to za mnie | 1 + tekst + 1 (Wykonaj) |

---

## 3. Ekran Dziś — lista priorytetów treści

Treść przed layoutem: od najważniejszej dla zadań z sekcji 2. To jest kolejność, nie siatka.

1. Rzeczy do zrobienia dziś: zadania z terminem dziś i zaległe (odhaczane w miejscu).
2. Pole „Napisz do Ex-us albo wpisz /” (jedno wejście do wszystkich akcji).
3. Stan dnia: punkty dziś / limit, seria (z informacją, czy dzisiejszy dzień już się liczy).
4. Szybkie akcje: Dodaj obowiązek, Zaloguj aktywność, Dodaj transakcję.
5. Cele (≤ 3): ile brakuje.
6. Saldo Money i kwota obowiązków do wypłaty.
7. Wejścia do modułów, których nie ma wyżej — kompensata ukrytej nawigacji (NN/g).

Poza ekranem Dziś (w Statystykach): poziom i XP, osiągnięcia, TOP aktywności, ciekawostki, wykresy.

---

## 4. Decyzje wynikające z benchmarku

| # | Decyzja | Uzasadnienie | Zmiana w PLAN.md |
|---|---|---|---|
| U1 | Przycisk nawigacji to tekst „Menu” (bez ikony) | Zgodne z zasadą „bez ikon” i z NN/g (goła ikona hamburgera jest słabiej odkrywalna) | 7.4 |
| U2 | Model ruchu jak ChatGPT: karta treści odsuwa się ok. 82% szerokości, zaokrąglona krawędź i cień, menu pod spodem przesuwa się z −10% i krycia 0,55 do pozycji docelowej; tap w odsłoniętą kartę zamyka | Referencja pobrana w całości; znany wzorzec dla użytkownika ChatGPT | 7.4 |
| U3 | Gest: śledzenie palca bez animacji w trakcie, puszczenie z pędem decyduje, przerwany gest wraca do najbliższego stanu | Zachowanie ChatGPT i ogólna reguła arkuszy (pęd ma znaczenie) | 7.4 |
| U4 | Stały sidebar od 840 px (klasa „expanded” w M3), drawer poniżej | Wyrównanie do Material 3 zamiast arbitralnego 1024 px | 7.3 |
| U5 | Top bar jako jedyna warstwa z rozmyciem tła; karty pełne | Apple HIG: szkło tylko dla warstwy nawigacji; wydajność | 7.2, 7.3 |
| U6 | Ekran Dziś wg listy priorytetów (sekcja 3), grywalizacja przeniesiona do Statystyk | Things 3 (skupienie), Habitica (przestroga) | 7.6 |
| U7 | Polityka potwierdzeń zależna od źródła: komenda wpisana ręcznie → wykonanie od razu + „Cofnij”; akcja zaproponowana przez AI → karta; destrukcyjna → dialog | Potwierdzenie proporcjonalne do ryzyka; jawna intencja użytkownika nie wymaga drugiego pytania; unikanie zmęczenia potwierdzeniami | 6.6 |
| U8 | Karta akcji zawsze pokazuje skutki (np. „Saldo: 312,50 → 262,50 zł · punkty −5”) | „Karta bez ładunku to teatr” | 6.4 (`effects`) |
| U9 | Parser podświetla rozpoznane fragmenty w polu na żywo | Todoist Quick Add | 6.3 |
| U10 | Poprawki do oczekujących kart („zmień na piątek”) edytują kartę | Todoist Ramble | 6.7 (`pendingActions`) |
| U11 | Paleta: pusta = ostatnie + częste; grupy (Komendy / Ekrany / Ostatnie); prefiks > fuzzy; brak wyników → „Zapytaj Ex-us” | Linear/Raycast | 6.3 |
| U12 | Arkusze: tekstowe „Zamknij”, bez zagnieżdżania, pełna wysokość przy klawiaturze | NN/g, wzorce iOS | 7.5 |
| U13 | Kwoty: `inputmode="decimal"`, duża prezentacja, podgląd salda po operacji | Wzorce fintech | 7.5 |
| U14 | Pieniądze: podział „Dostępne / W celach”, transakcje po dniach, porównanie miesiąc-do-dnia | Copilot, Revolut Vaults | 7.6 |
| U15 | Komunikaty serii bez wstydu; jasny próg dnia | Duolingo, Finch | 7.6 |

## 5. Backlog po parytecie (nowe funkcje z benchmarku — nie wchodzą do cutover)

| Funkcja | Inspiracja | Dane (addytywnie) |
|---|---|---|
| Tryb „Przerwa” dla serii i limitu (dziś / tydzień / do daty) | Apple Pause Rings, Todoist vacation mode | `users.streakPause: { from, to }` |
| Przypomnienie „dzień wypłaty” za obowiązki | BusyKid | `users.choresPayday: 'fri'` |
| Zatwierdzanie rozliczenia przez rodzica (tryb nadzorowany) | BusyKid, Greenlight | Nowy status rozliczenia + reguły dla rodzica |
| Wiele zadań z jednej wiadomości do Ex-us (więcej niż 3 akcje, gdy wszystkie to `create-task`) | Todoist Ramble | — |
| Podział pieniędzy na „pots” (wydaję / oszczędzam / oddaję) | Rooster Money | Do przemyślenia — cele już pełnią rolę skarbonek |

---

## Źródła

- [NN/g — Hamburger Menus and Hidden Navigation Hurt UX Metrics](https://www.nngroup.com/articles/hamburger-menus/)
- [NN/g — Beyond the Hamburger: What Makes Navigation Discoverable on Mobile](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/)
- [NN/g — Supporting Mobile Navigation in Spite of a Hamburger Menu](https://www.nngroup.com/articles/support-mobile-navigation/)
- [NN/g — Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [Material Design 3 — Navigation drawer guidelines](https://m3.material.io/components/navigation-drawer/guidelines)
- [Material Design 3 — Navigation bar guidelines](https://m3.material.io/components/navigation-bar/guidelines)
- [WWDC25 — Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/284/?time=886)
- [Create with Swift — Liquid Glass: hierarchy, harmony and consistency](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/)
- [FlowFlow #177 — ChatGPT-style iOS sidebar (card slides aside)](https://github.com/mirkobozzetto/flowflow/issues/177)
- [Litter PR #394 — ChatGPT-style navigation, gesture lifecycle](https://github.com/0xSero/litter/pull/394)
- [OpenAI Help — conversation history in the iOS app](https://help.openai.com/en/articles/8980299-how-can-i-view-my-conversation-history-in-the-ios-app)
- [Monarch — New mobile navigation](https://www.monarchmoney.com/blog/new-mobile-navigation)
- [Todoist — Use Task Quick Add](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz)
- [Todoist — Use Ramble to add tasks by voice](https://www.todoist.com/help/articles/use-ramble-to-add-tasks-by-voice-P1Raq7vVF)
- [Todoist — Introduction to Karma](https://www.todoist.com/help/articles/introduction-to-karma-OgWkWy)
- [Todoist — Vacation mode](https://www.todoist.com/help/articles/turn-on-or-off-vacation-mode-in-todoist-pAQmRp)
- [Things 3 — features](https://culturedcode.com/things/features/)
- [The Digital Project Manager — Things 3 review](https://thedigitalprojectmanager.com/tools/things-3-review/)
- [Copilot Help — Dashboard tab overview](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview)
- [The Penny Hoarder — Copilot Money review](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/)
- [Revolut — Getting started with Savings Vaults](https://help.revolut.com/en-US/help/app-features/savings-vaults/getting-started-with-instant-access-savings/)
- [BusyKid — FAQ](https://busykid.com/faq/)
- [Greenlight — Chores and allowance](https://greenlight.com/how-greenlight-makes-chores-allowance-easier)
- [NatWest Rooster Money — reward chart](https://roostermoney.com/us/feature/kids-reward-chart-app/)
- [Yu-kai Chou — Streak design behind Duolingo's daily loop](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/)
- [Just Another PM — The psychology behind Duolingo's streak](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)
- [9to5Mac — Pause rings in watchOS 11](https://9to5mac.com/2024/07/16/close-your-ringsbut-in-watchos-11-its-okay-if-you-dont/)
- [Slate — Finch review](https://slate.com/technology/2026/09/finch-app-self-care-wellness-review.html)
- [Choosing Therapy — Habitica review](https://www.choosingtherapy.com/habitica-app-review/)
- [Just Habits — Habitica review](https://just-habits.com/blog/habitica-review/)
- [uxpatterns.dev — Command palette pattern](https://uxpatterns.dev/patterns/advanced/command-palette)
- [SaaS UI — Search & command palette patterns](https://www.saasui.design/blog/saas-search-command-palette-ux-patterns)
- [AI UX Playground — Human in the loop](https://aiuxplayground.com/guides/how-to-design-human-in-the-loop/)
- [ShapeofAI — Verification pattern](https://www.shapeof.ai/patterns/verification)
- [Web Designer Depot — The case for text labels](https://webdesignerdepot.com/why-icon-only-design-is-failing-users-the-case-for-text-labels/)
- [CSS-Tricks — inputmode for numeric inputs](https://css-tricks.com/finger-friendly-numerical-inputs-with-inputmode/)
- [LogRocket — Bottom sheets UX](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/)
