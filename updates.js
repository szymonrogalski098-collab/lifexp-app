import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { BUG_ADMIN_EMAIL } from "./bug-reports.js";
import { confirmDialog, currentUser, db, escapeHtml, toast } from "./core.js";

// ── „Co nowego?" / „What's new?" ──────────────────────
// Pokazuje się RAZ po wejściu na nową wersję (guard w localStorage). Przy każdym
// update'u: podbij APP_VERSION i dopisz NOWĄ grupę na GÓRZE CHANGELOG (dwujęzyczne pl/en).
// Popup "Co nowego?" pokazuje TYLKO grupę o version === APP_VERSION (CHANGELOG[0]) —
// pełny log wszystkich wersji jest dostępny na stronie "Historia aktualizacji".
const APP_VERSION = '2026.08.20';
const CHANGELOG = [
  { version: '2026.08.20', items: [
    { pl: '🔴 Fix: telefon czasem wchodził w przypadkowy zoom w Asystentach (i nie dało się go zmniejszyć/przesunąć, żeby dobrać się do nowego czatu) — wyłączony zoom przeglądarki w całej apce i podniesiona wielkość czcionki pól tekstowych czatu, żeby telefon nigdy nie próbował sam powiększać ekranu', en: "🔴 Fix: the phone would sometimes zoom into the Assistants screen out of nowhere (with no way to zoom back out or pan to reach the new-chat button) — browser zoom is now disabled app-wide, and the chat text inputs' font size was bumped so the phone never tries to auto-zoom into them" },
  ]},
  { version: '2026.08.19', items: [
    { pl: '🔴 Fix: kafelek "FPS Prototype" w Grach był praktycznie niewidoczny — jako ostatni na liście miał tylko ~38px odstępu nad dolnym paskiem nawigacji; teraz strona Gry ma taki sam bezpieczny odstęp na dole jak Obowiązki/Planer', en: '🔴 Fix: the "FPS Prototype" tile in Games was practically invisible — as the last item in the list it had only ~38px of clearance above the fixed bottom nav bar; the Games page now gets the same safety padding at the bottom as Chores/Planner' },
  ]},
  { version: '2026.08.18', items: [
    { pl: '🔫 Nowość: kafelek "FPS Prototype" w zakładce Gry — eksperymentalna, samodzielna gra 3D (Three.js) otwierana jako osobna strona z linkiem powrotu do LifeXP', en: '🔫 New: an "FPS Prototype" tile in the Games tab — an experimental, standalone 3D game (Three.js) that opens as a separate page with a link back to LifeXP' },
  ]},
  { version: '2026.08.17', items: [
    { pl: '🤖 Odpowiedzi Ex-us renderują teraz prawdziwe formatowanie (pogrubienia, listy, kod) zamiast surowych gwiazdek Markdown — Twoje własne wiadomości zawsze zostają zwykłym tekstem', en: '🤖 Ex-us replies now render real formatting (bold, lists, code) instead of raw Markdown asterisks — your own messages always stay plain text' },
  ]},
  { version: '2026.08.16', items: [
    { pl: '🎯 Ex-us potrafi teraz proponować też cele oszczędnościowe/punktowe na dashboardzie, nie tylko zadania — jedna rozmowa rozpoznaje, o co chodzi, i pokazuje odpowiednią kartę do zatwierdzenia albo odrzucenia. Zatwierdzenie od razu dodaje cel i odświeża dashboard, jeśli jest akurat otwarty', en: '🎯 Ex-us can now propose savings/points goals for the dashboard too, not just tasks — one conversation figures out what you mean and shows the matching card to approve or dismiss. Approving adds the goal immediately and refreshes the dashboard if it happens to be open' },
  ]},
  { version: '2026.08.15', items: [
    { pl: '🤖 Ex-us potrafi teraz proponować zadania do Planera dnia wprost z rozmowy — jeśli wiadomość brzmi jak prośba o zaplanowanie czegoś, zamiast zwykłej odpowiedzi dostajesz kartę z tytułem/godziną/czasem trwania/typem do zatwierdzenia albo odrzucenia jednym kliknięciem. Zatwierdzenie od razu dodaje zadanie i odświeża widok Planera, jeśli jest akurat otwarty', en: '🤖 Ex-us can now propose tasks for the Day Planner right from the conversation — if a message sounds like a scheduling request, instead of a normal reply you get a card with the title/time/duration/type to approve or dismiss with one tap. Approving adds the task immediately and refreshes the Planner view if it happens to be open' },
  ]},
  { version: '2026.08.14', items: [
    { pl: '🤖 Ex-us: podłączony prawdziwy czat (Cloud Function aiAssistantChat) — Gemini teraz naprawdę odpowiada i pamięta poprzednie wiadomości w tej samej rozmowie. Pasek limitu tokenów odświeża się po każdej odpowiedzi, doszedł przycisk "Nowa rozmowa", a błędy z backendu (np. wyczerpany dzienny limit) pokazują się czytelnie w czacie zamiast cichego niepowodzenia', en: '🤖 Ex-us: wired up the real chat (aiAssistantChat Cloud Function) — Gemini now actually replies and remembers earlier messages in the same conversation. The token-limit bar refreshes after every reply, a "New conversation" button was added, and backend errors (e.g. daily limit exhausted) now show up clearly in the chat instead of failing silently' },
  ]},
  { version: '2026.08.13', items: [
    { pl: '🤖 Ex-us: poprawiony przełącznik Siri-ous/Ex-us — obie "kropki" są teraz zrośnięte w jedną pigułkę (stykają się bez odstępu) i siedzą bezpośrednio na górnej krawędzi okna czatu jako jego nagłówek. Zakładka nawigacyjna nazywa się teraz "Asystenci AI" zamiast "Siri-ous AI", żeby odzwierciedlać oba asystenty', en: '🤖 Ex-us: fixed the Siri-ous/Ex-us toggle — the two "dots" are now fused into one capsule (touching, no gap) and sit directly on the chat window\'s top edge as its header. The nav tab is now called "AI Assistants" instead of "Siri-ous AI" to reflect both assistants' },
  ]},
  { version: '2026.08.12', items: [
    { pl: '🤖 Nowość: Ex-us — prawdziwy asystent AI dołączył do zakładki Siri-ous AI. Przełącznik "kropek" u góry pozwala skakać między nimi; Ex-us ma pasek dziennego limitu tokenów i kolorystykę dopasowaną do wybranego motywu apki (złoty/Apple/LifeXP). Na razie łączy się z backendem tylko po dane limitu — prawdziwe odpowiedzi AI dochodzą w kolejnym kroku', en: '🤖 New: Ex-us — a real AI assistant joined the Siri-ous AI tab. A pill toggle at the top switches between them; Ex-us has a daily token-limit bar and colors that follow your chosen app theme (gold/Apple/LifeXP). For now it only talks to the backend for limit data — real AI replies land in a follow-up step' },
  ]},
  { version: '2026.08.11', items: [
    { pl: '🔴 Fix: Siri-ous AI dalej ucinał kawałek karty czatu w niektórych sytuacjach — brakowało tego samego zabezpieczenia (min-width/min-height) w dymkach wiadomości, tytule czatu na liście i polu tekstowym; teraz wszystkie cztery miejsca poprawnie się przewijają zamiast rozpychać kartę', en: '🔴 Fix: Siri-ous AI still cut off part of the chat card in some situations — the same safeguard (min-width/min-height) was missing from message bubbles, the chat-list title, and the text input; all four spots now scroll correctly instead of stretching the card' },
  ]},
  { version: '2026.08.10', items: [
    { pl: '🔴 Fix: karta czatu Siri-ous AI wystawała poza prawą krawędź ekranu na telefonie, chowając część rozmowy — wiersz chipsów z podpowiedziami rozciągał całą kartę do szerokości wszystkich chipsów naraz zamiast przewijać się we własnym zakresie', en: "🔴 Fix: the Siri-ous AI chat card overflowed past the right edge of the screen on phones, hiding part of the conversation — the suggestion-chip row was stretching the whole card to fit every chip at once instead of scrolling within its own row" },
  ]},
  { version: '2026.08.09', items: [
    { pl: '🤖 Siri-ous AI: dodano chipsy z podpowiedziami (widoczne na starcie każdego pustego czatu) i 7 nowych kategorii odpowiedzi wyzwalanych słowem-kluczem — kod, jedzenie, muzyka, sport, miłość, matematyka i "kim jestem"', en: '🤖 Siri-ous AI: added suggestion chips (shown at the start of every empty chat) and 7 new keyword-triggered response categories — code, food, music, sports, love, math, and "who am I"' },
  ]},
  { version: '2026.08.08', items: [
    { pl: '🤖 Siri-ous AI: dodano ~14 nowych żartobliwych odpowiedzi, opcję tworzenia i usuwania osobnych czatów (przycisk + w nagłówku, lista czatów po tapnięciu nazwy), miękkie kolorowe tło za oknem czatu, a etykieta w dolnym pasku jest teraz krótsza ("Siri-ous")', en: '🤖 Siri-ous AI: added ~14 new joke responses, the ability to create and delete separate chats (+ button in the header, tap the chat name for a chat list), a soft colorful glow behind the chat window, and a shorter bottom-nav label ("Siri-ous")' },
  ]},
  { version: '2026.08.07', items: [
    { pl: '🔴 Fix: moduł Siri-ous AI po włączeniu w Ustawieniach nie pojawiał się na telefonie — miał wpis tylko w bocznej kolumnie, która jest całkowicie ukryta na małych ekranach; teraz jest też w dolnym pasku', en: '🔴 Fix: the Siri-ous AI module didn\'t show up on phones after being enabled in Settings — it only had a sidebar entry, and the sidebar is fully hidden on small screens; it now also appears in the bottom nav' },
    { pl: '🤖 Siri-ous AI: podmieniona baza odpowiedzi na własną, zabawniejszą listę (w tym żarty nawiązujące do LifeXP), plus odpowiedzi wyzwalane słowem-kluczem — np. zapytaj o pogodę', en: "🤖 Siri-ous AI: swapped in a funnier custom response bank (including LifeXP in-jokes), plus keyword-triggered replies — try asking about the weather (in Polish)" },
  ]},
  { version: '2026.08.06', items: [
    { pl: '🤖 Nowość: Siri-ous AI — żartobliwy moduł-easter egg z czatem, który wygląda jak premium asystent AI, ale odpowiada losowymi, bezużytecznymi tekstami z 80+ elementową listą (i czasem szczerze poleca zapytać konkurencję). Włącz go w Ustawieniach → Moduły, jeśli chcesz się pośmiać', en: "🤖 New: Siri-ous AI — a joke easter-egg module with a chat that looks like a premium AI assistant but replies with random, useless one-liners from an 80+ line bank (and occasionally, honestly, recommends asking the competition instead). Turn it on in Settings → Modules if you're in the mood for a laugh" },
  ]},
  { version: '2026.08.05', items: [
    { pl: '🧭 Nowość: tryb konta Solo/Nadzorowane — przy pierwszym uruchomieniu wybierasz, czy korzystasz z LifeXP samodzielnie, czy z rodzicem/opiekunem w tle. W trybie solo znika email rodzica i raport tygodniowy z Ustawień; przełączenie na solo w każdej chwili zrywa istniejące połączenie z rodzicem (za potwierdzeniem)', en: "🧭 New: Solo/Supervised account mode — on first launch you choose whether you're using LifeXP on your own or with a parent/guardian in the loop. Solo mode hides the parent email and weekly report from Settings; switching to solo at any time disconnects an existing parent link (with a confirmation)" },
  ]},
  { version: '2026.08.04', items: [
    { pl: '🧩 Nowość: system personalizacji — przy pierwszym uruchomieniu wybierasz, z których modułów LifeXP chcesz korzystać (Obowiązki, Money, Gry, Statystyki XP, Planer dnia). Nawigacja pokazuje tylko wybrane moduły, a wybór można zmienić w każdej chwili w Ustawieniach → Moduły — wyłączenie modułu niczego nie kasuje, dane wracają po ponownym włączeniu', en: '🧩 New: personalization system — on first launch you choose which LifeXP modules you want (Chores, Money, Games, XP Stats, Day Planner). Navigation shows only the modules you picked, and you can change it any time in Settings → Modules — disabling a module never deletes anything, data comes right back when you re-enable it' },
  ]},
  { version: '2026.08.03', items: [
    { pl: '🗓️ Nowość: Planer dnia — oś czasu na dzisiaj, dodajesz zadania o konkretnej godzinie i długości, punkty liczą się z tej samej stawki co Log Activity (możesz je nadpisać ręcznie), a ukończone zadanie trafia też do Historii i Statystyk jak zwykła aktywność', en: '🗓️ New: Day Planner — a timeline for today, add tasks with a specific time and duration, points use the same rate as Log Activity (you can override them by hand), and a completed task also shows up in History/Stats like any other logged activity' },
  ]},
  { version: '2026.08.02', items: [
    { pl: '🔴 Nowy blok: Zegar — samodzielne, konfigurowalne źródło impulsów (okres 1-4 ticki, wł/wył w ustawieniach) — nie trzeba już budować pętli z Bramki NOT albo dwóch Observerów tylko po to, żeby dostać powtarzający się sygnał', en: '🔴 New block: Clock — a self-contained, configurable pulse generator (period 1-4 ticks, on/off in settings) — no more building a NOT Gate feedback loop or two facing Observers just to get a repeating signal' },
  ]},
  { version: '2026.08.01', items: [
    { pl: '🔴 Fix: Przekaźniki/Bramki NOT ustawione na różne opóźnienia potrafiły migotać (włączać/wyłączać się) w nieskończoność zamiast się ustabilizować — sygnał na wyjściu jest teraz trwałym stanem z opóźnionym przełączeniem (jak w prawdziwym Minecrafcie), a nie powtarzanym impulsem', en: '🔴 Fix: Repeaters/NOT Gates set to mismatched delays could flicker on/off forever instead of settling — output is now a persistent level with a delayed transition (matching real Minecraft), not a repeating pulse' },
  ]},
  { version: '2026.07.31', items: [
    { pl: '🔴 Fix: kasowanie gumką ciała wysuniętego tłoka zostawiało niewidzialną, niekasowalną Głowicę blokującą stawianie na tym polu na zawsze — teraz gumka chowa tłok całkowicie; stare zapisy z takimi duchami są automatycznie naprawiane przy wczytaniu', en: '🔴 Fix: erasing an extended piston\'s body left behind an invisible, un-erasable head permanently blocking placement on that cell — the eraser now retracts the piston fully; old saves with such ghost cells are auto-repaired on load' },
  ]},
  { version: '2026.07.30', items: [
    { pl: '🖥️ Fix: plansza Obwodów Redstone na pełnym ekranie wypełnia teraz całą wysokość telefonu zamiast kwadratu z pustym pasem pod spodem — prawdziwy fullscreen, nie okno w oknie', en: '🖥️ Fix: the Redstone Circuits board in fullscreen now fills the phone\'s full height instead of a square with empty space below it — real fullscreen, not a window inside a window' },
  ]},
  { version: '2026.07.29', items: [
    { pl: '🖥️ Obwody Redstone otwierają się teraz od razu na pełnym ekranie — bez dodatkowego tapnięcia', en: '🖥️ Redstone Circuits now opens straight into fullscreen — no extra tap needed' },
  ]},
  { version: '2026.07.28', items: [
    { pl: '🖥️ Wejście w pełny ekran w grach to teraz okrągły przycisk w rogu ekranu (zamiast przycisku w nagłówku) — tap pokazuje samą grę bez niczego innego, toolbar Obwodów Redstone zostaje widoczny', en: '🖥️ Entering fullscreen in games is now a round corner button (instead of a header button) — tap shows just the game with nothing else, the Redstone Circuits toolbar stays visible' },
  ]},
  { version: '2026.07.27', items: [
    { pl: '🔴 Fix: plansza Obwodów Redstone wystawała poza prawą krawędź telefonu odkąd doszła kolumna narzędzi po lewej (w zwykłym i pełnoekranowym widoku) — teraz poprawnie mieści się w szerokości ekranu', en: '🔴 Fix: the Redstone Circuits board overflowed past the right edge of the phone once the tool sidebar was added (both normal and fullscreen view) — it now correctly fits the screen width' },
    { pl: '🔴 Ustawienia Tabliczki/Przekaźnika/Komparatora otwierają się teraz jako duże okno na środku ekranu (jak w Minecrafcie), zamiast paska wciśniętego obok toolbara, w którym nie dało się wpisać tekstu', en: '🔴 Sign/Repeater/Comparator settings now open as a large centered dialog (Minecraft-style) instead of a bar squeezed next to the toolbar where typing text didn\'t work' },
  ]},
  { version: '2026.07.26', items: [
    { pl: '🔴 Toolbar Obwodów Redstone przeniesiony na wąską kolumnę po lewej stronie planszy (zamiast rzędów nad nią) — narzędzia są teraz zawsze widoczne, bez przewijania całej strony; ikonka nad nazwą zamiast nagłówków grup', en: '🔴 Redstone Circuits toolbar moved to a narrow column on the left of the board (instead of rows above it) — tools stay visible without scrolling the whole page; icon above the name instead of group headers' },
  ]},
  { version: '2026.07.25', items: [
    { pl: '🔴 Toolbar Obwodów Redstone przeorganizowany w czytelne grupy (Budowa/Logika/Mechanizmy/Wejście-Wyjście/Narzędzia), a każdy przycisk ma teraz obok nazwy małą ikonkę pokazującą, jak dany klocek wygląda w grze', en: '🔴 Redstone Circuits toolbar reorganized into clear groups (Building/Logic/Mechanism/Input-Output/Tools), and every button now shows a small icon next to its name previewing what that block actually looks like' },
  ]},
  { version: '2026.07.24', items: [
    { pl: '🔴 Nowy blok: Tabliczka — podpisz swoją konstrukcję tekstem (max 20 znaków). Postaw dwie obok siebie, a połączą się w jedną większą tabliczkę; w jej ustawieniach możesz je rozdzielić, żeby zostały osobne', en: '🔴 New block: Sign — label your build with text (max 20 characters). Place two next to each other and they merge into one bigger sign; toggle "Separate" in its settings to keep them apart' },
  ]},
  { version: '2026.07.23', items: [
    { pl: '🔴 Fix: Przekaźnik/Komparator/Tłok już nie „łapią" zasilenia z boku, którego nie powinny widzieć, i mogą wreszcie odczytać drugi Przekaźnik/Komparator dotykający ich wprost (bez przewodu)', en: '🔴 Fix: Repeater/Comparator/Piston no longer pick up power from a side they should ignore, and can finally read another Repeater/Comparator touching them directly (no wire needed)' },
    { pl: '🔴 Fix: Tłok reaguje na zasilenie z dowolnej strony poza swoim frontem, nie tylko od tyłu', en: '🔴 Fix: Piston reacts to power from any side except its own front, not just its back' },
    { pl: '🔴 Tłok pcha teraz też Note Block/Observer/Lampę (nie tylko zwykłe Bloki); przewód/Przekaźnik/Komparator/dźwignia/przycisk/Pochodnia mu nie przeszkadzają — po prostu odpadają', en: '🔴 Piston now also pushes Note Block/Observer/Lamp (not just plain Blocks); wire/Repeater/Comparator/lever/button/Torch no longer block it — they just break off' },
    { pl: '🔴 Fix: dwa Observery patrzące na siebie wreszcie działają jako zegar', en: '🔴 Fix: two Observers facing each other finally work as a clock' },
    { pl: '🔴 Pochodnia to teraz samodzielny, obracalny klocek — stawiasz ją jednym tapnięciem na pustym polu, bez wymogu istniejącego Bloku', en: '🔴 Torch is now a standalone, rotatable piece — place it with one tap on any empty cell, no Block required first' },
    { pl: '🔴 Nowe bloki: Miernik Sygnału (pokazuje najsilniejszy sygnał liczbą) i Sumator Sygnału (sumuje sygnały z wszystkich stron) — obydwa bierne, nic nie przewodzą, przydatne do budowy mini-kalkulatora', en: '🔴 New blocks: Signal Meter (shows the strongest signal as a number) and Signal Adder (sums signals from every side) — both passive, conduct nothing, handy for building a mini calculator' },
    { pl: '🔴 Nowy blok: Bramka NOT — odwraca sygnał jak Przekaźnik + Pochodnia razem, jednym klockiem — najprostszy sposób na zbudowanie działającego zegara', en: '🔴 New block: NOT Gate — inverts a signal like a Repeater + Torch combo in a single block — the easiest way to build a working clock' },
  ]},
  { version: '2026.07.22', items: [
    { pl: '📡 Fix: aplikacja czasem nie chciała się otworzyć w trybie samolotowym bez wcześniejszego internetu — ekran startowy jest teraz zawsze zapisany do użytku offline, nie tylko po pierwszym udanym uruchomieniu online', en: "📡 Fix: the app sometimes refused to open in airplane mode with no prior internet — the startup screen is now always saved for offline use, not just after the first successful online launch" },
  ]},
  { version: '2026.07.21', items: [
    { pl: '🔴 Fix: przycisk „Wyczyść świat" w Obwodach Redstone wreszcie działa', en: '🔴 Fix: the "Clear world" button in Redstone Circuits finally works' },
    { pl: '🔴 Fix: Przekaźnik/Komparator/Observer są teraz wyraźnie widoczne (nie ledwo-widzialne na tle siatki) i mają strzałkę pokazującą, w którą stronę patrzą', en: '🔴 Fix: Repeater/Comparator/Observer are now clearly visible (no longer nearly invisible against the grid) and show an arrow for the direction they face' },
    { pl: '🔴 Przekaźnik ma teraz regulowane opóźnienie (1-4) — tapnij go narzędziem „Zaznacz", żeby otworzyć panel ustawień (tam też tryb Komparatora, zamiast osobnego narzędzia)', en: '🔴 Repeater now has adjustable delay (1-4) — tap it with the "Select" tool to open a settings panel (Comparator mode moved there too, instead of a separate tool)' },
    { pl: '🔴 Fix: Przekaźnik/Komparator mogą teraz odwrócić pochodnię dotykając jej bloku wprost — da się wreszcie zbudować działający zegar/pętlę', en: '🔴 Fix: Repeater/Comparator can now invert a torch by touching its block directly — you can finally build a working clock/loop' },
    { pl: '🔴 Fix: tłok wysunięty w puste pole faktycznie je zajmuje — nie da się już postawić na nim klocka ani wepchnąć w niego bloku innym tłokiem', en: '🔴 Fix: an extended piston\'s head now actually occupies its cell — you can no longer place a block on it or push one into it with another piston' },
    { pl: '🔴 Tłoki mają teraz dźwięk i płynną animację wysuwania/chowania ramienia', en: '🔴 Pistons now have sound and a smooth extend/retract arm animation' },
  ]},
  { version: '2026.07.20', items: [
    { pl: '🔴 Fix: Obwody Redstone renderują się teraz zawsze w kolorach LifeXP, niezależnie od wybranego motywu apki (w Apple/Gold niektóre klocki były prawie niewidoczne)', en: '🔴 Fix: Redstone Circuits now always render in LifeXP colors regardless of your chosen app theme (some blocks were nearly invisible in Apple/Gold)' },
    { pl: '🔴 Fix: pochodnia podłączona do przewodu (bez innego źródła) już nie miga bez końca — przewód sam z siebie nie odwraca już własnej pochodni, tylko prawdziwe źródło (dźwignia/przycisk/inna pochodnia) dotykające bloku', en: '🔴 Fix: a torch connected to wire (with no other source) no longer blinks forever — plain wire no longer inverts its own torch, only a real source (lever/button/another torch) touching the block does' },
  ]},
  { version: '2026.07.19', items: [
    { pl: '🔴 Obwody Redstone: doszły Comparator, Observer, Piston, Sticky Piston i Note Block — tłoki fizycznie przesuwają bloki (łańcuchowo), Note Block gra dźwięk po impulsie (zmień wysokość tonu tapnięciem)', en: '🔴 Redstone Circuits: added Comparator, Observer, Piston, Sticky Piston and Note Block — pistons physically push blocks (chained), Note Block plays a sound on a pulse (tap to change pitch)' },
  ]},
  { version: '2026.07.18', items: [
    { pl: '🎁 Jeśli Twoje zgłoszenie zostanie zaakceptowane, dostajesz dodatkowe zgłoszenie do wykorzystania poza dziennym limitem', en: '🎁 If your report gets accepted, you get one extra report to use beyond the daily limit' },
  ]},
  { version: '2026.07.17', items: [
    { pl: '🔴 Nowa gra: Obwody Redstone — piaskownica, buduj obwody logiczne (bloki, przewody, pochodnie, przekaźniki, dźwignie, przyciski, lampy). Przeciągnij by przesunąć widok, uszczypnij/scrolluj by przybliżyć', en: '🔴 New game: Redstone Circuits — a sandbox for building logic circuits (blocks, wire, torches, repeaters, levers, buttons, lamps). Drag to pan, pinch/scroll to zoom' },
  ]},
  { version: '2026.07.16', items: [
    { pl: '📱 Fix: hitbox po tapnięciu naprawiony do końca — poprzedni fix łapał tylko flash koloru, teraz też zaznaczanie tekstu na klikalnych elementach (prawdziwa przyczyna na niektórych telefonach)', en: '📱 Fix: the tap hitbox is now fully fixed — the previous fix only caught the color flash, this also stops text-selection on clickable elements (the real cause on some phones)' },
    { pl: '⚙️ Ustawienia: kategorie mają teraz wyraźną ramkę — łatwiej zobaczyć że to osobne, klikalne wiersze', en: '⚙️ Settings: categories now have a visible border — easier to see they’re separate, tappable rows' },
  ]},
  { version: '2026.07.15', items: [
    { pl: '⚙️ Ustawienia: kategorie zwijają się w akordeon zamiast jednej długiej listy — łatwiej znaleźć to czego szukasz', en: '⚙️ Settings: categories now collapse into an accordion instead of one long list — easier to find what you need' },
    { pl: '📱 Fix: spadki FPS przy scrollu w Ustawieniach (motyw Apple) — mniej rozmycia tła na telefonie', en: '📱 Fix: FPS drops while scrolling Settings (Apple theme) — lighter background blur on mobile' },
    { pl: '📱 Fix: niebieski "hitbox" po tapnięciu działał tylko na przyciskach — teraz naprawiony wszędzie (np. wybór języka)', en: '📱 Fix: the blue tap "hitbox" was only fixed on buttons — now fixed everywhere (e.g. the language picker)' },
  ]},
  { version: '2026.07.14', items: [
    { pl: '🖥️ Pełny ekran w grach obejmuje teraz samą grę (na cały ekran), a nie całą aplikację — wychodzisz przyciskiem „✕"', en: '🖥️ Fullscreen in games now shows just the game (edge to edge), not the whole app — exit with the “✕” button' },
  ]},
  { version: '2026.07.13', items: [
    { pl: '🖥️ Gry można teraz grać na pełnym ekranie — przycisk „⛶ Pełny ekran" w każdej grze', en: '🖥️ Games can now be played fullscreen — a “⛶ Fullscreen” button in every game' },
    { pl: '💣 Łapacz monet: więcej bomb i 3 różne rodzaje (okrągła, dynamit, mina) — każdy z innym kształtem i trafieniem', en: '💣 Coin Catcher: more bombs and 3 different kinds (round, dynamite, mine) — each with its own shape and hitbox' },
  ]},
  { version: '2026.07.12', items: [
    { pl: '🎯 Wpłata na cel pobiera teraz kasę z konta Money (nie wpłacisz więcej niż masz), a pod saldem widać ile masz odłożone „w celach". Usunięcie celu zwraca kasę na saldo', en: '🎯 Depositing to a goal now takes the money from your Money balance (you can’t deposit more than you have), and the balance shows how much is “in goals”. Deleting a goal returns the money to your balance' },
    { pl: '🎮 Pożegnaj Flappy Bird — w jego miejsce nowa gra „Łapacz monet": łap spadające monety, omijaj bomby (offline, z animacjami)', en: '🎮 Goodbye Flappy Bird — replaced by a new game “Coin Catcher”: catch falling coins, dodge bombs (offline, animated)' },
  ]},
  { version: '2026.07.11', items: [
    { pl: '🏆 Nowe osiągnięcia za zdobyte pieniądze w Money (100, 500, 1000, 2500, 5000 i 10 000 zł) — liczą się też Twoje dotychczasowe wpływy', en: '🏆 New achievements for money earned in Money (100, 500, 1000, 2500, 5000 and 10,000 zł) — your past income counts too' },
    { pl: '🎯 Cele pieniężne: możesz sam odkładać kwoty na cel przyciskiem „Wpłać"', en: '🎯 Money goals: you can put money aside toward a goal with the “Deposit” button' },
    { pl: '🤝 Dodawanie pożyczki ma teraz przycisk „Anuluj"', en: '🤝 Adding a loan now has a “Cancel” button' },
    { pl: '✅ Obowiązki: dodawanie zamkniesz, tapając kreskę na górze okienka', en: '✅ Chores: cancel adding by tapping the handle at the top of the sheet' },
    { pl: '🥇 Motyw Gold: przycisk „+" ma teraz złotą poświatę zamiast zielonej', en: '🥇 Gold theme: the “+” button now has a gold glow instead of green' },
  ]},
  { version: '2026.07.10', items: [
    { pl: '🎮 2048: kafelki płynnie się przesuwają i pulsują przy łączeniu, zamiast się teleportować', en: '🎮 2048: tiles now slide and pulse on merge instead of teleporting' },
    { pl: '🎆 Pobicie rekordu w grze odpala fajerwerki', en: '🎆 Beating a game highscore now sets off fireworks' },
    { pl: '🐤 Flappy Bird: fizyka jak w oryginale (grawitacja, trzepot, prędkość rur) — koniec z kamieniem spadającym w dół', en: '🐤 Flappy Bird: physics matched to the original game (gravity, flap, pipe speed) — no more falling like a rock' },
    { pl: '🔧 Fix: zakładka Gry ma wreszcie ikonę', en: '🔧 Fix: the Games tab finally has an icon' },
  ]},
  { version: '2026.07.09', items: [
    { pl: '🎮 Nowa zakładka Gry — Flappy Bird, Snake i 2048 z lokalnymi rekordami, działa też offline', en: '🎮 New Games tab — Flappy Bird, Snake and 2048 with local highscores, works offline too' },
    { pl: '📡 Tryb offline — podgląd danych bez internetu, a wpisy zrobione offline czekają jako szkice do zatwierdzenia po powrocie online', en: '📡 Offline mode — browse your data without internet; entries made offline wait as drafts to confirm once you\'re back online' },
  ]},
  { version: '2026.07.08', items: [
    { pl: '📢 Globalne wiadomości pokazują się od razu, bez odświeżania aplikacji', en: '📢 Global messages now show up immediately, no app refresh needed' },
    { pl: '💬 Płynniejsze rozwijanie wątków w zgłoszeniach błędów', en: '💬 Smoother expand/collapse animation on bug report threads' },
    { pl: '📱 Fix: strona zgłoszeń nie wymaga już oddalania na telefonie', en: '📱 Fix: the reports page no longer requires zooming out on mobile' },
  ]},
  { version: '2026.07.07', items: [
    { pl: '💬 Możesz teraz odpisywać na zgłoszenia błędów — rozmowa tam i z powrotem, jak w Messengerze (z kropką nieprzeczytanych)', en: '💬 You can now reply to bug reports — a back-and-forth chat like Messenger (with an unread dot)' },
    { pl: '🔧 Fix: limit zgłoszeń liczony po dacie (reset o północy), a nie sztywne 24h', en: '🔧 Fix: report limit resets at midnight instead of a rolling 24h window' },
    { pl: '⏱️ Mogę ustawić na ile sekund pokazuje się globalna wiadomość', en: '⏱️ I can set how many seconds a global message stays on screen' },
  ]},
  { version: '2026.07.06', items: [
    { pl: '💸 Usunięto "Wypłać punkty" — punkty to teraz osobne wyzwanie w grze, Money to prawdziwe pieniądze', en: '💸 Removed "Withdraw points" — points are now a separate in-game challenge, Money is real money' },
    { pl: '📢 Nowość: mogę wysyłać globalne wiadomości, które błyskają Wam banerem na górze', en: '📢 New: I can send global messages that flash to everyone as a top banner' },
  ]},
  { version: '2026.07.05', items: [
    { pl: '🔧 Fix: formularz zgłaszania błędu działa, nawet zanim admin pierwszy raz otworzy panel', en: '🔧 Fix: bug report form works even before the admin has ever opened the panel' },
    { pl: '📱 Fix: zniknął niebieski "hitbox" po tapnięciu przycisku na telefonie', en: '📱 Fix: the blue tap "hitbox" flash on buttons is gone on mobile' },
    { pl: '📱 Fix: telefon nie pokazuje już starej zbuforowanej wersji aplikacji po update', en: "📱 Fix: phones no longer show a stale cached version of the app after an update" },
  ]},
  { version: '2026.07.04', items: [
    { pl: '🐛 Nowość: zgłaszanie błędów — ikonka obok profilu, limit 1 zgłoszenie/dzień', en: '🐛 New: bug reporting — icon next to your profile, 1 report/day limit' },
    { pl: '🌐 Obowiązki i reszta aplikacji przetłumaczone w pełni na EN/PL', en: '🌐 Chores and the rest of the app are now fully translated (EN/PL)' },
  ]},
  { version: '2026.07.03', items: [
    { pl: '💰 Nowa zakładka Money — budżet, transakcje i kategorie', en: '💰 New Money tab — budget, transactions and categories' },
    { pl: '🤝 Pożyczki — śledź komu pożyczasz i kto pożycza Tobie (z częściową spłatą)', en: '🤝 Loans — track who you lend to and who lends to you (with partial repayment)' },
    { pl: '🛒 Zakupy w Money odejmują też punkty LifeXP', en: '🛒 Money purchases also deduct LifeXP points' },
    { pl: '🚫 Saldo Money nie może już zejść poniżej zera', en: '🚫 Money balance can no longer go below zero' },
    { pl: '🎯 Cel pieniężny na dashboardzie liczy realne saldo Money', en: '🎯 Dashboard money goal now tracks your real Money balance' },
    { pl: '💵 Rozliczenie obowiązków trafia na saldo Money', en: '💵 Chore payouts now land on your Money balance' },
    { pl: '🌐 Okna potwierdzeń po polsku i angielsku + limity długości pól', en: '🌐 Bilingual confirmation dialogs + input length limits' },
  ]},
];

window.closeWhatsNew = () => {
  document.getElementById('whatsnew-modal').classList.remove('open');
  try { localStorage.setItem('lifexp-seen-version', APP_VERSION); } catch (e) {}
};

export function maybeShowWhatsNew() {
  try {
    if (localStorage.getItem('lifexp-seen-version') === APP_VERSION) return;
    const group = CHANGELOG.find(g => g.version === APP_VERSION);
    if (!group) return;
    const lng = (i18next.language === 'pl') ? 'pl' : 'en';
    document.getElementById('whatsnew-version').textContent = i18next.t('whatsnew.version', { v: APP_VERSION });
    document.getElementById('whatsnew-list').innerHTML = group.items.map(c => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <p style="margin:0;font-size:14px;line-height:1.5">${c[lng]}</p>
      </div>`).join('');
    document.getElementById('whatsnew-modal').classList.add('open');
  } catch (e) { console.error('maybeShowWhatsNew failed:', e); }
}

// ── Historia aktualizacji (pełny log wszystkich wersji z CHANGELOG) ──
export function renderUpdateHistory() {
  const el = document.getElementById('update-history-list');
  if (!el) return;
  const lng = (i18next.language === 'pl') ? 'pl' : 'en';
  el.innerHTML = CHANGELOG.map(group => `
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:10px;font-size:15px">${i18next.t('whatsnew.version', { v: group.version })}</h3>
      ${group.items.map(c => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <p style="margin:0;font-size:14px;line-height:1.5">${c[lng]}</p>
        </div>`).join('')}
    </div>`).join('');
}

// ── Globalne wiadomości (broadcasts) ──────────────────
// Top-level kolekcja `broadcasts` { text, createdAt }. Admin pisze, wszyscy czytają.
// User side: przy wejściu do apki nieprzeczytane wiadomości błyskają banerem
// (~4,5s każda, po kolei), potem oznaczane jako przeczytane w localStorage
// (per urządzenie) — "znika na zawsze", widać tylko gdy user jest aktywny.
const BROADCAST_SEEN_KEY = 'lifexp-seen-broadcasts';
let broadcastHideTimer = null;

function getSeenBroadcasts() {
  try { return JSON.parse(localStorage.getItem(BROADCAST_SEEN_KEY) || '[]'); } catch (e) { return []; }
}
function markBroadcastSeen(id) {
  try {
    const seen = getSeenBroadcasts();
    if (!seen.includes(id)) { seen.push(id); localStorage.setItem(BROADCAST_SEEN_KEY, JSON.stringify(seen.slice(-200))); }
  } catch (e) {}
}

let broadcastResolve = null;
window.dismissBroadcastNow = () => {
  const el = document.getElementById('broadcast-banner');
  el.classList.remove('show');
  if (broadcastHideTimer) { clearTimeout(broadcastHideTimer); broadcastHideTimer = null; }
  if (broadcastResolve) { const r = broadcastResolve; broadcastResolve = null; setTimeout(r, 380); }
};

function showBroadcastBanner(text, durationMs) {
  return new Promise(resolve => {
    const el = document.getElementById('broadcast-banner');
    el.textContent = text;
    el.classList.add('show');
    broadcastResolve = resolve;
    broadcastHideTimer = setTimeout(() => {
      el.classList.remove('show');
      broadcastHideTimer = null;
      if (broadcastResolve) { broadcastResolve = null; setTimeout(resolve, 380); }
    }, durationMs || 5000);
  });
}

// Kolejka + listener na żywo: nowa wiadomość globalna wysłana PODCZAS gdy apka jest
// otwarta ma się pokazać od razu (bez odświeżenia). broadcastShownThisSession to
// dodatkowy bezpiecznik w pamięci (obok localStorage) — gwarantuje "pojawia się raz"
// nawet gdyby snapshot odpalił się ponownie zanim zdąży zapisać się do localStorage.
let broadcastQueue = [];
let broadcastProcessing = false;
const broadcastShownThisSession = new Set();

function enqueueBroadcast(b) {
  if (broadcastShownThisSession.has(b.id)) return;
  if (getSeenBroadcasts().includes(b.id)) return;
  if (broadcastQueue.some(q => q.id === b.id)) return;
  broadcastQueue.push(b);
  processBroadcastQueue();
}

async function processBroadcastQueue() {
  if (broadcastProcessing) return;
  broadcastProcessing = true;
  while (broadcastQueue.length) {
    // Nie nachodź na modal "Co nowego?" — poczekaj, aż zniknie, zamiast pomijać.
    while (document.getElementById('whatsnew-modal').classList.contains('open')) {
      await new Promise(r => setTimeout(r, 300));
    }
    const b = broadcastQueue.shift();
    broadcastShownThisSession.add(b.id);
    const secs = Math.min(30, Math.max(1, Number(b.durationSec) || 5));
    await showBroadcastBanner(b.text, secs * 1000);
    markBroadcastSeen(b.id);
  }
  broadcastProcessing = false;
}

export function startBroadcastListener() {
  try {
    onSnapshot(
      query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => {
        const seen = getSeenBroadcasts();
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(b => !seen.includes(b.id) && !broadcastShownThisSession.has(b.id))
          .reverse() // najstarsze najpierw — kolejność banerów chronologiczna
          .forEach(enqueueBroadcast);
      },
      (e) => console.error('broadcast listener failed:', e)
    );
  } catch (e) { console.error('startBroadcastListener failed:', e); }
}

// ── Hub admina/zgłoszeń: nawigacja Zgłoszenia / Wiadomości (admin) / Historia ──
export function renderBugHubNav(active) {
  const admin = currentUser?.email === BUG_ADMIN_EMAIL;
  const btn = (key, page, label) =>
    `<button class="seg-btn ${active === key ? 'active' : ''}" onclick="showPage('${page}')">${label}</button>`;
  const html = btn('report', 'report-bug', '🐛 ' + i18next.t('bugHub.reports'))
    + (admin ? btn('broadcast', 'broadcasts', '📢 ' + i18next.t('bugHub.broadcasts')) : '')
    + btn('history', 'update-history', '✨ ' + i18next.t('bugHub.history'));
  document.querySelectorAll('.bug-hub-nav').forEach(el => { el.innerHTML = html; });
}

// ── Strona wiadomości globalnych (tylko BUG_ADMIN_EMAIL) ──
export async function loadBroadcastsPage() {
  // Zabezpieczenie: normalny user nie ma przycisku, ale gdyby trafił tu ręcznie — odeślij.
  if (currentUser?.email !== BUG_ADMIN_EMAIL) { showPage('report-bug'); return; }
  try { await renderBroadcastList(); } catch (e) { console.error(e); }
}

async function renderBroadcastList() {
  const el = document.getElementById('broadcast-list');
  if (!el) return;
  const snap = await getDocs(query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(20)));
  if (snap.empty) { el.innerHTML = `<p class="text2">${i18next.t('broadcast.none')}</p>`; return; }
  const loc = i18next.language === 'pl' ? 'pl-PL' : 'en-US';
  el.innerHTML = snap.docs.map(d => {
    const b = d.data();
    const date = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    const ds = date.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    const secs = Math.min(30, Math.max(1, Number(b.durationSec) || 5));
    return `<div class="preset-item" style="margin-bottom:6px">
      <span class="preset-info" style="min-width:0">
        <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(b.text)}</span>
        <span class="text2">${ds} · ${secs}s</span>
      </span>
      <button class="btn-secondary" onclick="deleteBroadcast('${d.id}')" style="padding:4px 10px;font-size:12px">${i18next.t('shop.delete')}</button>
    </div>`;
  }).join('');
}

export async function sendBroadcast() {
  const ta = document.getElementById('broadcast-text');
  const text = ta.value.trim();
  if (!text) return toast(i18next.t('broadcast.enterText'), 'error');
  const secs = Math.min(30, Math.max(1, parseInt(document.getElementById('broadcast-seconds').value) || 5));
  try {
    await addDoc(collection(db, 'broadcasts'), { text, durationSec: secs, createdAt: new Date() });
    ta.value = '';
    await renderBroadcastList();
    toast(i18next.t('broadcast.sent'));
  } catch (e) { console.error(e); toast(i18next.t('shop.saveError'), 'error'); }
}
window.sendBroadcast = sendBroadcast;

window.deleteBroadcast = async (id) => {
  if (!await confirmDialog(i18next.t('broadcast.confirmDelete'))) return;
  try {
    await deleteDoc(doc(db, 'broadcasts', id));
    await renderBroadcastList();
    toast(i18next.t('broadcast.deleted'));
  } catch (e) { console.error(e); toast(i18next.t('shop.saveError'), 'error'); }
};

