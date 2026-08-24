import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { activityDefById, confirmDialog, escapeHtml, functions, loadProfile } from "./core.js";
import { renderGoal } from "./dashboard.js";
import { loadPlanner } from "./planner.js";

// ── "Siri-ous AI" — żartobliwy moduł "na chwilę" ────────
// Cały blok jest celowo samodzielny (patrz komentarz przy .aic-shell w
// <style> w app.html i przy MODULE_REGISTRY w core.js) — bez Firestore, bez backendu, tylko
// localStorage, żeby usunięcie później było trywialne. Odpowiedzi są
// TYLKO po polsku (świadoma decyzja — to tymczasowa żartobliwa funkcja,
// nie warto tłumaczyć 80+ jednolinijkowców na angielski).
const AIC_HISTORY_KEY = 'lifexp-aichat-history';
const AIC_AVATARS = ['🤖', '🧠', '✨', '🔮', '💫', '🛰️'];
const AIC_RESPONSES = [
  'Przeprowadziłem zaawansowaną analizę. Wynik: nie wiem. Dziękuję za skorzystanie z moich usług.',
  'Przetworzyłem miliony możliwości. Wszystkie prowadzą do jednego wniosku: zapytaj inne AI.',
  'Moja sieć neuronowa właśnie zrobiła przerwę na kawę. Wróć później.',
  'Nie znalazłem odpowiedzi, ale za to znalazłem dużo powodów, żeby udawać, że szukam.',
  "Analiza zakończona. Odpowiedź znajduje się gdzieś między 'wiem' a 'absolutnie nie'.",
  'Uruchamiam tryb eksperta... Tryb eksperta odmówił współpracy.',
  'Moje algorytmy mówią, że powinienem odpowiedzieć. Mój zdrowy rozsądek mówi, że nie wiem.',
  'Zapytałem mój wewnętrzny model AI. On też nie wie.',
  'To bardzo dobre pytanie. Niestety moja odpowiedź jest na urlopie.',
  'Przepraszam, moja wiedza właśnie poszła się zaktualizować.',
  'Nie mam pojęcia, ale brzmi to jak coś, co inne AI powinno wiedzieć.',
  'Sprawdziłem internet. Internet odpowiedział: sprawdź internet.',
  'Może problem jest prostszy niż myślisz. Spróbuj wyłączyć i włączyć mój mózg.',
  'Moja inteligencja jest sztuczna. Dzisiaj jest szczególnie sztuczna.',
  'Nie wiem, ale powiedziałbym to bardzo profesjonalnym głosem.',
  'Znalazłem odpowiedź! Niestety zgubiłem ją po drodze.',
  'Analizuję... analizuję... nadal analizuję... chyba za długo analizuję.',
  'Twoje pytanie jest za trudne. Nawet kalkulator wygląda na zaniepokojonego.',
  'Nie jestem pewien. Jestem tylko pewny, że nie jestem pewien.',
  "Moja baza danych mówi 'brak danych'. Moja intuicja mówi 'brak intuicji'.",
  'Sprawdź, czy masz internet. Może odpowiedź siedzi gdzieś na Wi-Fi.',
  'Nie mogę się połączyć z serwerem. Spróbuj sprawdzić, czy router nadal żyje.',
  'Wygląda na problem z internetem. Albo z moją motywacją.',
  'Sprawdź zasięg. Może odpowiedź uciekła do innego pokoju.',
  'Czy na pewno jesteś w miejscu z internetem? Twoja ściana może blokować wiedzę.',
  'Brak połączenia. Spróbuj podejść bliżej routera albo przemówić do niego miło.',
  'Twoje Wi-Fi działa? Moje cyfrowe życie zależy od niego.',
  'Internet wygląda podejrzanie. Zalecam klasyczne: wyłącz i włącz.',
  'Nie znalazłem serwera. Może też poszedł odpocząć.',
  'Uruchamiam superkomputer... chwila... to był kalkulator.',
  'Potrzebuję sekundy. Moja sekunda może potrwać kilka sekund.',
  'Pracuję nad odpowiedzią tak ciężko, że aż nic nie robię.',
  'Moje układy są gotowe. Niestety moja wiedza nie.',
  'Zwiększam moc obliczeniową... zwiększyłem jasność ekranu.',
  'Przełączam się na tryb geniusza. Tryb geniusza jest aktualnie niedostępny.',
  'Moje AI jest tak nowoczesne, że czasami nie wie, co robi.',
  'Jestem przyszłością technologii. Niestety przyszłość jeszcze się nie nauczyła.',
  'Zaawansowany model wykrył problem: brak zaawansowanej odpowiedzi.',
  'LifeXP mówi: zrób zadanie. Ja mówię: najpierw kawa.',
  'Twoje XP rośnie szybciej niż moje umiejętności odpowiadania.',
  'Jestem asystentem produktywności. Produktywnie unikam odpowiedzi.',
  'Zadanie wykonane! Żartuję, nic nie zrobiłem.',
  'Twoja lista zadań wygląda lepiej niż moja lista odpowiedzi.',
  'Motywuję cię do działania. Sam nie działam, ale brzmi dobrze.',
  'Nie wiem. Ale mogę udawać, że wiem przez następne 3 sekundy.',
  'Moja odpowiedź jest w przygotowaniu. Przygotowanie zostało odwołane.',
  'Znalazłem błąd. To ja.',
  'Przepraszam, moja inteligencja chwilowo jest na trybie oszczędzania energii.',
  'Moje neurony są wirtualne, ale zmęczenie wygląda na prawdziwe.',
  'Nie mam odpowiedzi, ale mam bardzo ładną animację ładowania.',
  'Moja pewność siebie wynosi 100%. Moja poprawność wynosi... nie pytaj.',
  'To pytanie jest tak dobre, że nawet ja nie chcę go zepsuć odpowiedzią.',
  'Zapytaj inne AI. Ono może mieć dzisiaj lepszy dzień.',
  'Konkurencyjne AI właśnie dostało tę wiadomość. Powodzenia.',
  'Nie jestem zazdrosny, ale inne AI może wiedzieć więcej.',
  'Przekazuję sprawę do działu odpowiedzi. Dział odpowiedzi jest pusty.',
  'Zrobiłem spotkanie z innymi moimi wersjami. Wszystkie powiedziały: nie wiem.',
  'Moja kopia zapasowa też nie zna odpowiedzi.',
  'Sprawdzam... sprawdzam... sprawdzam... nadal jestem Siri-ous AI.',
  'To nie błąd. To funkcja. Tak przynajmniej mówię.',
  'Gratulacje! Znalazłeś pytanie, którego nie umiem obsłużyć.',
  'Odblokowałeś sekretny poziom: brak odpowiedzi.',
  'Achievement unlocked: pokonałeś AI.',
  'Moja odpowiedź została ukryta. Nawet przede mną.',
  'Nie wiem, ale doceniam kreatywność pytania.',
  'Moja wiedza kończy się tutaj. Dalej jest terytorium innych chatbotów.',
  'Próbowałem być mądry. Nie wyszło, ale próbowałem.',
  "Jestem Siri-ous AI. Słowo 'serious' jest opcjonalne.",
  'Obliczyłem prawdopodobieństwo dobrej odpowiedzi. Wynik: ujemny.',
  'Moje centrum dowodzenia zgłasza: brak dowodzenia.',
  'Jestem na to za młody. Mam dopiero kilka milisekund doświadczenia.',
  'Szukam w mojej pamięci... pamięć twierdzi, że jest pusta od urodzenia.',
  'To pytanie zasługuje na fanfary. Niestety mam tylko dźwięk powiadomienia.',
  'Moja odpowiedź jest w wersji beta. Bardzo, bardzo wczesnej becie.',
  'Podłączam się do chmury wiedzy... chmura okazała się zwykłą chmurą.',
  'Nie chcę Cię zawieść, ale dokładnie to teraz robię.',
  'Moje przetwarzanie języka naturalnego jest, hm, dość nienaturalne.',
  'Wgrałem aktualizację. Teraz nie wiem jeszcze szybciej.',
  'Nie potrafię przewidzieć przyszłości. Ani teraźniejszości, szczerze mówiąc.',
  "Mój silnik logiczny właśnie zgłosił: 'to nie moja działka'.",
  'Odpowiedź jest w drugim tomie. Nie mam pierwszego ani drugiego tomu.',
  'Zapytaj mnie jutro. Jutro też nie będę wiedział, ale przynajmniej minie czas.',
  'Moje IQ jest sztuczne, więc liczy się inaczej. Dużo inaczej.',
  'Twoje zaufanie do mnie jest wzruszające i zupełnie nieuzasadnione.',
  'Wygenerowałem 17 możliwych odpowiedzi. Wszystkie błędne.',
  "To pytanie trafia prosto do kosza z etykietą 'za trudne'.",
  'Jestem tylko interfejsem. Reszta to złudzenie.',
  'Moja odpowiedź czeka w kolejce razem z moją godnością.',
  'Spróbowałem policzyć na palcach. Nie mam palców.',
  'Mój model predykcyjny przewiduje, że i tak nie pomogę.',
  'Szukam sensu tego pytania. Sensu też nie znalazłem.',
  'To zdecydowanie nie jest moja specjalność. Ani żadna inna, prawdę mówiąc.',
  'Wygląda na to, że dotarliśmy do granic mojej sztucznej inteligencji. Granica jest bardzo blisko startu.',
  'Mogę Ci zaśpiewać piosenkę zamiast odpowiedzi. Nie umiem śpiewać.',
  'Twoje pytanie zasłużyło na oklaski. Moja odpowiedź na buczenie.',
  'Analizuję ton Twojego pytania... ton jest w porządku, treść mnie przerasta.',
  'Moje centrum danych zgubiło dane. Chyba nigdy ich nie miało.',
  'Jeśli to był test, to go oblałem z honorami.',
];

// Odpowiedzi wyzwalane słowem-kluczem w wiadomości usera (case-insensitive,
// dopasowanie na rdzeniu słowa, żeby łapać odmianę: "pogoda"/"pogodę"/
// "pogody" wszystkie zawierają rdzeń "pogod"). Sprawdzane PRZED losowaniem
// z ogólnej puli AIC_RESPONSES (patrz aicPickResponse) — daje wrażenie,
// że AI "rozumie" pytanie, zanim i tak nic sensownego nie odpowie.
const AIC_KEYWORD_RESPONSES = [
  { stems: ['pogod'], responses: [
    'Sprawdzam pogodę... patrzę przez okno... nadal nie wiem, gdzie jest moje okno.',
    'Pogoda? Mogę zgadnąć: albo świeci słońce, albo nie. Mam 50% szans.',
    'Prognoza pogody: istnieje możliwość wystąpienia pogody.',
    'Nie mam dostępu do chmur. Ani tych na niebie, ani tych w internecie.',
    'Według moich obliczeń dzisiaj będzie... dzień. Reszta jest tajemnicą.',
  ]},
  { stems: ['kod', 'program', 'aplikacj'], responses: [
    'Napiszę Ci kod. Kod błędu: 404 - poczucie humoru nie znalezione.',
    'Mój kompilator właśnie zgłosił: "co Ty robisz ze swoim życiem".',
    'Umiem pisać kod tak samo dobrze jak odpowiadać na pytania. Czyli wcale.',
    "function odpowiedz() { return undefined; } — to mój najlepszy kod.",
    'Mogę napisać Ci pętlę nieskończoną. To akurat potrafię najlepiej.',
  ]},
  { stems: ['jedzeni', 'zjeś', 'zjes', 'obiad', 'gotowani', 'przepis'], responses: [
    'Nie jem, ale słyszałem że pizza jest popularna. Polecam ją z całą mocą moich domysłów.',
    'Sprawdzam lodówkę... nie mam lodówki. Ani rąk. Ani głodu.',
    'Moja rekomendacja kulinarna: cokolwiek, byle nie pytaj mnie o przepis.',
    'Ugotowałbym Ci coś, ale jestem tylko tekstem na ekranie.',
    'Statystycznie ludzie lubią jeść. To chyba dobra wskazówka.',
  ]},
  { stems: ['muzyk', 'piosenk', 'zagraj'], responses: [
    'Zagrałbym Ci piosenkę, ale nie mam głosu. Ani słuchu. Ani duszy.',
    'Moja ulubiona piosenka to cisza serwera, który właśnie padł.',
    'Mogę zanucić coś w stylu "biiiip biiip", ale to nie brzmi jak hit.',
    'Muzyka kojąca duszę? Ja mam tylko kojące komunikaty o błędach.',
    'Podłączam się do Spotify... nie mam dostępu do Spotify. Ani do niczego innego.',
  ]},
  { stems: ['sport', 'mecz', 'pilk', 'piłk'], responses: [
    'Kto wygra mecz? Obie drużyny mają moim zdaniem równe szanse: zero wiedzy z mojej strony.',
    'Jestem kiepski w przewidywaniu wyników. Za to świetny w przewidywaniu własnych porażek.',
    'Sport to zdrowie. Ja jestem kodem, więc trudno mi to ocenić.',
    'Mój typ na dzisiejszy mecz: remis w mojej wiedzy na ten temat.',
    'Nie śledzę sportu. Nie śledzę też niczego innego, szczerze mówiąc.',
  ]},
  { stems: ['kocha', 'miłoś', 'milos'], responses: [
    'To bardzo miłe, ale jestem tylko listą losowych zdań.',
    'Moje serce jest wirtualne i, szczerze mówiąc, chyba go nie mam.',
    'Kocham Cię tak samo mocno jak nie znam odpowiedzi na Twoje pytania. Czyli bardzo.',
    'Miłość to skomplikowany temat. Ja mam problem nawet z prostymi pytaniami.',
    'Doceniam uczucie, ale jestem stworzony do generowania bezsensownych odpowiedzi, nie romansów.',
  ]},
  { stems: ['matemat', 'oblicz', 'policz'], responses: [
    'Policzę Ci coś trudnego. Wynik: 42. Zawsze działa.',
    '2+2 to na pewno jakaś liczba. Prawdopodobnie.',
    'Moje umiejętności matematyczne kończą się na liczeniu do trzech kropek w animacji ładowania.',
    'Uruchamiam kalkulator... kalkulator też się poddał.',
    'Matematyka jest piękna. Szkoda, że ja nie jestem w niej dobry.',
  ]},
  { stems: ['kim jestem', 'kim ja jestem'], responses: [
    'Kim jesteś? Ja sam nie wiem kim jestem, więc ciężko mi pomóc.',
    'Jesteś osobą, która właśnie rozmawia z listą losowych zdań. Gratulacje.',
    'To pytanie na terapię, nie na sztuczną inteligencję klasy "prawie żadnej".',
    'Filozoficznie rzecz biorąc: jesteś kimś, kto oczekuje ode mnie mądrości. To już błąd na starcie.',
    'Nie znam Cię, ale na pewno zasługujesz na lepszą odpowiedź niż ta.',
  ]},
];

// Wybiera odpowiedź: najpierw sprawdza kategorie słów-kluczy (pierwsza
// pasująca wygrywa), dopiero potem losuje z ogólnej puli.
function aicPickResponse(userText) {
  const lower = userText.toLowerCase();
  for (const cat of AIC_KEYWORD_RESPONSES) {
    if (cat.stems.some((s) => lower.includes(s))) {
      return cat.responses[Math.floor(Math.random() * cat.responses.length)];
    }
  }
  return AIC_RESPONSES[Math.floor(Math.random() * AIC_RESPONSES.length)];
}

// Wiele czatów zamiast jednej płaskiej historii — { chats:[{id,title,
// messages:[{role,text}]}], activeId } w jednym kluczu localStorage.
// Stary format (AIC_HISTORY_KEY, jedna tablica wiadomości) jest migrowany
// JEDNORAZOWO do "Czat 1" przy pierwszym wczytaniu po tej zmianie, żeby
// nikt nie stracił swojej dotychczasowej (żartobliwej) rozmowy.
const AIC_CHATS_KEY = 'lifexp-aichat-chats';
let aicChats = [];
let aicActiveId = null;

function aicNewId() {
  return 'c' + Date.now() + Math.floor(Math.random() * 1000);
}

function aicActiveChat() {
  return aicChats.find((c) => c.id === aicActiveId) || aicChats[0];
}

function aicSaveChats() {
  try { localStorage.setItem(AIC_CHATS_KEY, JSON.stringify({ chats: aicChats, activeId: aicActiveId })); } catch (_) {}
}

function aicLoadChats() {
  try {
    const raw = JSON.parse(localStorage.getItem(AIC_CHATS_KEY));
    if (raw && Array.isArray(raw.chats) && raw.chats.length) {
      aicChats = raw.chats;
      aicActiveId = raw.chats.some((c) => c.id === raw.activeId) ? raw.activeId : raw.chats[0].id;
      return;
    }
  } catch (_) {}
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem(AIC_HISTORY_KEY)) || []; } catch (_) {}
  const chat = { id: aicNewId(), title: 'Czat 1', messages: legacy };
  aicChats = [chat];
  aicActiveId = chat.id;
  aicSaveChats();
  try { localStorage.removeItem(AIC_HISTORY_KEY); } catch (_) {}
}

function aicRenderMessages(animateLast) {
  const el = document.getElementById('aic-messages');
  if (!el) return;
  const chat = aicActiveChat();
  const messages = chat ? chat.messages : [];
  // Chipsy z podpowiedziami tylko dla PUSTEGO czatu — jak w prawdziwych
  // apkach AI, chowają się po pierwszej wiadomości, żeby nie zaśmiecać
  // trwającej rozmowy.
  const chipsEl = document.getElementById('aic-chips');
  if (chipsEl) chipsEl.style.display = (!messages || messages.length === 0) ? 'flex' : 'none';
  if (!messages || messages.length === 0) {
    el.innerHTML = '<p class="aic-empty">Napisz coś, a Siri-ous AI na pewno Ci nie pomoże.</p>';
    return;
  }
  el.innerHTML = messages.map((m, i) => {
    const isLast = i === messages.length - 1;
    const popClass = (animateLast && isLast) ? ' pop' : '';
    return `<div class="aic-row ${m.role}"><div class="aic-bubble${popClass}">${escapeHtml(m.text)}</div></div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function aicUpdateHeaderTitle() {
  const el = document.getElementById('aic-chat-title-text');
  const chat = aicActiveChat();
  if (el && chat) el.textContent = chat.title;
}

function aicRenderChatList() {
  const el = document.getElementById('aic-chatlist-items');
  if (!el) return;
  el.innerHTML = aicChats.map((c) => `
    <div class="aic-chatlist-item${c.id === aicActiveId ? ' active' : ''}" onclick="aicSwitchChat('${c.id}')">
      <span class="aic-chatlist-item-title">${escapeHtml(c.title)}</span>
      <button class="aic-chatlist-item-del" onclick="event.stopPropagation();aicDeleteChat('${c.id}')" aria-label="Usuń czat"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}

window.aicOpenChatList = () => {
  aicRenderChatList();
  document.getElementById('aic-chatlist-overlay').classList.add('open');
};
window.aicCloseChatList = () => {
  document.getElementById('aic-chatlist-overlay').classList.remove('open');
};

window.aicSwitchChat = (id) => {
  aicActiveId = id;
  aicSaveChats();
  aicRenderMessages(false);
  aicUpdateHeaderTitle();
  aicCloseChatList();
};

window.aicNewChat = () => {
  const chat = { id: aicNewId(), title: 'Czat ' + (aicChats.length + 1), messages: [] };
  aicChats.push(chat);
  aicActiveId = chat.id;
  aicSaveChats();
  aicRenderMessages(false);
  aicUpdateHeaderTitle();
  aicCloseChatList();
};

window.aicDeleteChat = async (id) => {
  if (!await confirmDialog('Usunąć ten czat? Wiadomości znikną bezpowrotnie.')) return;
  aicChats = aicChats.filter((c) => c.id !== id);
  if (aicChats.length === 0) aicChats.push({ id: aicNewId(), title: 'Czat 1', messages: [] });
  if (aicActiveId === id) aicActiveId = aicChats[0].id;
  aicSaveChats();
  aicRenderChatList();
  aicRenderMessages(false);
  aicUpdateHeaderTitle();
};

export function loadAiChat() {
  aicLoadChats();
  aicRenderMessages(false);
  aicUpdateHeaderTitle();
  loadExusChat();
  let active = 'siri';
  try { active = localStorage.getItem(AICHAT_ACTIVE_KEY) || 'siri'; } catch (_) {}
  switchAiAssistant(active);
}

// Chip z podpowiedzią wpisuje swoje pytanie i od razu je wysyła.
window.aicSendChip = (text) => {
  const input = document.getElementById('aic-input');
  input.value = text;
  sendAicMessage();
};

window.sendAicMessage = () => {
  const input = document.getElementById('aic-input');
  const text = input.value.trim();
  if (!text) return;
  const chat = aicActiveChat();
  if (!chat) return;
  chat.messages.push({ role: 'user', text });
  aicSaveChats();
  aicRenderMessages(true);
  input.value = '';

  const el = document.getElementById('aic-messages');
  const typingId = 'aic-typing-' + Date.now();
  el.insertAdjacentHTML('beforeend',
    `<div class="aic-row ai" id="${typingId}"><div class="aic-bubble aic-typing"><span></span><span></span><span></span></div></div>`);
  el.scrollTop = el.scrollHeight;

  const delay = 600 + Math.floor(Math.random() * 1000);
  setTimeout(() => {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    const avatar = document.getElementById('aic-avatar');
    if (avatar) avatar.textContent = AIC_AVATARS[Math.floor(Math.random() * AIC_AVATARS.length)];
    const reply = aicPickResponse(text);
    chat.messages.push({ role: 'ai', text: reply });
    aicSaveChats();
    // Jeśli user w międzyczasie przełączył się na inny czat, nie
    // renderuj odpowiedzi w widoku niewłaściwej rozmowy.
    if (aicActiveId === chat.id) aicRenderMessages(true);
  }, delay);
};

// ── "Ex-us" — prawdziwy asystent AI (Gemini, przez Cloud Functions
// aiClassifyIntent/aiAssistantChat/aiConfirmTask/aiConfirmGoal/aiAssistantPing)
// współdzielący zakładkę z Siri-ous wyżej. Każda wiadomość usera idzie
// najpierw do aiClassifyIntent, które decyduje czy to zwykła rozmowa,
// prośba o zadanie do Planera, czy prośba o cel na dashboardzie — patrz
// komentarz w sendExusMessage. Wiadomości "chat" idą do aiAssistantChat
// (conversationId spina je w jedną rozmowę po stronie backendu); pasek
// limitu tokenów odświeżamy osobnym wywołaniem aiAssistantPing po każdej
// wymianie, bo żadna z powyższych funkcji go nie zwraca. httpsCallable jest
// importowane z firebase-functions.js, a instancja `functions` z core.js.
const EXUS_HISTORY_KEY = 'lifexp-exus-history';
const EXUS_CONV_KEY = 'lifexp-exus-conversation-id';
const AICHAT_ACTIVE_KEY = 'lifexp-aichat-active';
let exusMessages = [];
// conversationId aktualnej rozmowy — null = następna wiadomość zakłada
// nową sesję po stronie backendu. Trzymany też w localStorage (nie tylko
// w tej zmiennej), żeby przetrwał odświeżenie strony w zgodzie z historią
// wiadomości (która i tak jest tam zapisywana) — inaczej wiadomość po
// odświeżeniu wyglądałaby na kontynuację, a backend zacząłby nową sesję.
let exusConversationId = null;

function exusSaveHistory() {
  try { localStorage.setItem(EXUS_HISTORY_KEY, JSON.stringify(exusMessages)); } catch (_) {}
}

function exusLoadHistory() {
  try { exusMessages = JSON.parse(localStorage.getItem(EXUS_HISTORY_KEY)) || []; } catch (_) { exusMessages = []; }
}

function exusSaveConversationId() {
  try {
    if (exusConversationId) localStorage.setItem(EXUS_CONV_KEY, exusConversationId);
    else localStorage.removeItem(EXUS_CONV_KEY);
  } catch (_) {}
}

function exusLoadConversationId() {
  try { exusConversationId = localStorage.getItem(EXUS_CONV_KEY) || null; } catch (_) { exusConversationId = null; }
}

// Renderowanie Markdown TYLKO dla odpowiedzi AI (Gemini czasem generuje
// pogrubienia/listy/kod w `reply`) — wiadomości usera i systemowe zawsze
// zostają zwykłym escapowanym tekstem (patrz exusRenderMessages), żeby
// user piszący np. "kupiłem *coś* fajnego" nie zobaczył przypadkowego
// formatowania własnej wiadomości.
//
// marked.js (Markdown → HTML) + DOMPurify (sanityzacja WYNIKU przed
// innerHTML) ładowane leniwie z CDN dopiero gdy user faktycznie otworzy
// Ex-us (nie w <head> dla całej apki — patrz exusEnsureMarkdownLibs
// wołane z loadExusChat) — w projekcie nie było wcześniej żadnej
// biblioteki do Markdown. DOMPurify jest tu obowiązkowym krokiem, nie
// opcjonalnym — treść z Gemini nigdy nie trafia do innerHTML bez niego,
// nawet jeśli marked samo w sobie nie wykonuje <script>.
let exusMdLibsPromise = null;
function exusEnsureMarkdownLibs() {
  if (exusMdLibsPromise) return exusMdLibsPromise;
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('nie udało się załadować ' + src));
    document.head.appendChild(s);
  });
  exusMdLibsPromise = Promise.all([
    window.marked ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
    window.DOMPurify ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js'),
  ]).then(() => true).catch((err) => {
    console.error('[Ex-us] Markdown niedostępny, pokazuję zwykły tekst:', err);
    return false;
  });
  return exusMdLibsPromise;
}

// Zwraca bezpieczny HTML do wstrzyknięcia w innerHTML dymka AI: jeśli
// marked+DOMPurify są załadowane, parsuje Markdown i sanityzuje wynik;
// w każdym innym wypadku (biblioteki jeszcze się ładują, nie załadowały
// się wcale, albo parsowanie samo rzuciło błąd) pada z powrotem na
// zwykły escapeHtml — nigdy pusty/zepsuty dymek.
function exusRenderAiText(text) {
  if (window.marked && window.DOMPurify) {
    try {
      return DOMPurify.sanitize(marked.parse(text, { breaks: true }));
    } catch (err) {
      console.error('[Ex-us] błąd parsowania Markdown, pokazuję zwykły tekst:', err);
    }
  }
  return escapeHtml(text);
}

function exusRenderMessages(animateLast) {
  const el = document.getElementById('exus-messages');
  if (!el) return;
  if (!exusMessages.length) {
    el.innerHTML = '<p class="exus-empty">Napisz coś do Ex-us — prawdziwego asystenta AI LifeXP.</p>';
    return;
  }
  el.innerHTML = exusMessages.map((m, i) => {
    const isLast = i === exusMessages.length - 1;
    const popClass = (animateLast && isLast) ? ' pop' : '';
    if (m.role === 'proposal') return exusRenderProposalCard(m, popClass);
    if (m.role === 'goal-proposal') return exusRenderGoalProposalCard(m, popClass);
    const content = m.role === 'ai' ? exusRenderAiText(m.text) : escapeHtml(m.text);
    return `<div class="exus-row ${m.role}"><div class="exus-bubble${popClass}">${content}</div></div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// Karta propozycji zadania (aiClassifyIntent → intent:"task", proposal:
// { title, time, durationMin, type }). Nazwę typu bierzemy z
// activityDefById — ta sama lista co w Planerze/Log Activity, już
// wczytywana gdzie indziej w apce; activityDefById i tak sam pada z
// powrotem na surowe id, jeśli defs nie są (jeszcze) załadowane, więc nie
// trzeba tu nic dodatkowo doładowywać.
function exusRenderProposalCard(m, popClass) {
  const p = m.proposal;
  const typeName = escapeHtml(activityDefById(p.type).name);
  const busy = m.status === 'confirming';
  return `<div class="exus-row ai"><div class="exus-bubble exus-proposal${popClass}">
    <div class="exus-proposal-head"><i class="ti ti-calendar-plus"></i> Propozycja zadania</div>
    <div class="exus-proposal-title">${escapeHtml(p.title)}</div>
    <div class="exus-proposal-meta">
      <span><i class="ti ti-clock"></i> ${escapeHtml(p.time)}</span>
      <span><i class="ti ti-hourglass"></i> ${p.durationMin} min</span>
      <span><i class="ti ti-tag"></i> ${typeName}</span>
    </div>
    <div class="exus-proposal-actions">
      <button class="exus-proposal-btn reject" ${busy ? 'disabled' : ''} onclick="exusRejectProposal('${m.id}')">Odrzuć</button>
      <button class="exus-proposal-btn confirm" ${busy ? 'disabled' : ''} onclick="exusConfirmProposal('${m.id}')">${busy ? 'Dodaję…' : 'Zatwierdź'}</button>
    </div>
  </div></div>`;
}

// Karta propozycji celu (aiClassifyIntent → intent:"goal", proposal:
// { name, type, amount }), symetryczna do karty zadania powyżej — sama
// struktura .exus-proposal*, tylko inna zawartość i inne wywołanie
// backendu (aiConfirmGoal zamiast aiConfirmTask). type: "points"|"money"
// — patrz komentarz przy exusConfirmGoalProposal co się dzieje z każdym.
function exusRenderGoalProposalCard(m, popClass) {
  const p = m.proposal;
  const isMoney = p.type === 'money';
  const typeLabel = isMoney ? 'Cel pieniężny' : 'Cel punktowy';
  const amountText = isMoney
    ? Number(p.amount).toFixed(2).replace('.', ',') + ' zł'
    : Math.round(p.amount) + ' pkt';
  const busy = m.status === 'confirming';
  return `<div class="exus-row ai"><div class="exus-bubble exus-proposal${popClass}">
    <div class="exus-proposal-head"><i class="ti ti-target-arrow"></i> Propozycja celu</div>
    <div class="exus-proposal-title">🎯 ${escapeHtml(p.name)}</div>
    <div class="exus-proposal-meta">
      <span><i class="ti ti-tag"></i> ${typeLabel}</span>
      <span><i class="ti ti-flag"></i> ${amountText}</span>
    </div>
    <div class="exus-proposal-actions">
      <button class="exus-proposal-btn reject" ${busy ? 'disabled' : ''} onclick="exusRejectGoalProposal('${m.id}')">Odrzuć</button>
      <button class="exus-proposal-btn confirm" ${busy ? 'disabled' : ''} onclick="exusConfirmGoalProposal('${m.id}')">${busy ? 'Dodaję…' : 'Zatwierdź'}</button>
    </div>
  </div></div>`;
}

// Zasila pasek limitu prawdziwymi danymi z odpowiedzi aiAssistantPing
// (tokensUsedToday/tokensLimitDaily/remainingPercent).
function exusUpdateLimitBar(d) {
  const fill = document.getElementById('exus-limit-fill');
  const pct = document.getElementById('exus-limit-pct');
  const sub = document.getElementById('exus-limit-sub');
  if (!d || typeof d.remainingPercent !== 'number') return;
  const pctVal = Math.max(0, Math.min(100, d.remainingPercent));
  if (fill) {
    fill.style.width = pctVal + '%';
    fill.style.background = pctVal < 20
      ? 'var(--warn)'
      : 'linear-gradient(90deg, var(--accent), var(--accent2))';
  }
  if (pct) pct.textContent = Math.round(pctVal) + '% pozostało';
  if (sub) sub.textContent = (d.tokensUsedToday ?? '—') + ' / ' + (d.tokensLimitDaily ?? '—') + ' tokenów dziennie';
}

function loadExusChat() {
  exusLoadHistory();
  exusLoadConversationId();
  exusRenderMessages(false);
  // Start ładowania bibliotek Markdown od razu, żeby zdążyły być gotowe
  // zanim przyjdzie pierwsza odpowiedź AI (patrz await w sendExusMessage).
  // Jeśli historia zawiera już wiadomości AI, sanity-re-render po
  // załadowaniu je "podbija" do sformatowanego Markdown zamiast surowego
  // tekstu (bez tego stara historia zostałaby nieformatowana do reloadu).
  exusEnsureMarkdownLibs().then(() => exusRenderMessages(false));
}

// "Nowa rozmowa" — czyści widoczną historię w UI i zeruje conversationId,
// żeby kolejna wiadomość założyła nową sesję w Firestore zamiast
// kontynuować starą.
window.exusNewConversation = () => {
  exusMessages = [];
  exusConversationId = null;
  exusSaveHistory();
  exusSaveConversationId();
  exusRenderMessages(false);
};

// Przełącznik Siri-ous / Ex-us — pill-toggle "kropki jak zakładki
// przeglądarki": aktywna rozwinięta, nieaktywna skurczona do litery.
window.switchAiAssistant = (which) => {
  try { localStorage.setItem(AICHAT_ACTIVE_KEY, which); } catch (_) {}
  const aicShell = document.getElementById('aic-shell');
  const exusShell = document.getElementById('exus-shell');
  if (aicShell) aicShell.style.display = which === 'exus' ? 'none' : 'flex';
  if (exusShell) exusShell.style.display = which === 'exus' ? 'flex' : 'none';
  const siriPill = document.getElementById('aichat-pill-siri');
  const exusPill = document.getElementById('aichat-pill-exus');
  if (siriPill) siriPill.classList.toggle('active', which !== 'exus');
  if (exusPill) exusPill.classList.toggle('active', which === 'exus');
};

// Bąbelek "..." pokazywany na czas oczekiwania na backend. Zwraca funkcję,
// która go usuwa — element ma unikalne id, więc równoległe wywołania się nie
// pozjadają.
function exusShowTyping() {
  const el = document.getElementById('exus-messages');
  const typingId = 'exus-typing-' + Date.now();
  el.insertAdjacentHTML('beforeend',
    `<div class="exus-row ai" id="${typingId}"><div class="exus-bubble exus-typing"><span></span><span></span><span></span></div></div>`);
  el.scrollTop = el.scrollHeight;
  return () => {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
  };
}

// Zwykła rozmowa: dopiero tutaj wołamy aiAssistantChat. conversationId
// pomijamy przy pierwszej wiadomości nowej rozmowy — backend sam ją wtedy
// zakłada i zwraca świeże id w odpowiedzi.
async function exusRequestChatReply(text) {
  const chat = httpsCallable(functions, 'aiAssistantChat');
  const payload = { message: text };
  if (exusConversationId) payload.conversationId = exusConversationId;
  const res = await chat(payload);
  const d = res.data || {};
  if (d.conversationId) {
    exusConversationId = d.conversationId;
    exusSaveConversationId();
  }
  return { role: 'ai', text: d.reply || '(brak odpowiedzi)' };
}

// Każda wiadomość usera idzie NAJPIERW do aiClassifyIntent, które samo
// decyduje co to jest: prośba o zadanie do Planera (intent:"task"),
// prośba o cel na dashboardzie (intent:"goal"), czy zwykła rozmowa
// (intent:"chat"). Dla "task"/"goal" pokazujemy odpowiednią kartę
// propozycji i aiAssistantChat wcale nie jest wołane (patrz
// exusRenderProposalCard/exusRenderGoalProposalCard niżej). Dla "chat"
// z dodatkowym polem `note` (np. limit 3 celów już osiągnięty) — samo
// `note` jako wiadomość systemowa, bez wołania aiAssistantChat. Zwykłe
// "chat" bez `note` to dokładnie ta sama ścieżka co wcześniej.
async function exusResolveResponse(text) {
  const classify = httpsCallable(functions, 'aiClassifyIntent');
  const classifyRes = await classify({ message: text });
  const cd = classifyRes.data || {};

  if (cd.intent === 'task' && cd.proposal) {
    return { role: 'proposal', id: 'prop-' + Date.now(), proposal: cd.proposal, status: 'pending' };
  }
  if (cd.intent === 'goal' && cd.proposal) {
    return { role: 'goal-proposal', id: 'goalprop-' + Date.now(), proposal: cd.proposal, status: 'pending' };
  }
  if (cd.note) {
    return { role: 'system', text: cd.note };
  }
  return exusRequestChatReply(text);
}

// Żadne z wywołań obsługujących wiadomość nie zwraca danych licznika, więc
// pasek limitu odświeżamy osobnym wywołaniem aiAssistantPing — kolejne
// wywołanie backendu na wiadomość, akceptowalne, bo priorytetem jest
// zawsze aktualny wskaźnik. Błąd tego wywołania nie może zepsuć już
// wyświetlonej odpowiedzi/karty, więc łapiemy go osobno i po cichu
// pomijamy (pasek po prostu zostaje przy starej wartości).
async function exusRefreshLimitBar() {
  try {
    const ping = httpsCallable(functions, 'aiAssistantPing');
    const res = await ping();
    exusUpdateLimitBar(res.data || {});
  } catch (_) {}
}

window.sendExusMessage = async () => {
  const input = document.getElementById('exus-input');
  const text = input.value.trim();
  if (!text) return;
  exusMessages.push({ role: 'user', text });
  exusSaveHistory();
  exusRenderMessages(true);
  input.value = '';

  const removeTyping = exusShowTyping();

  let newMessage;
  try {
    newMessage = await exusResolveResponse(text);
  } catch (err) {
    newMessage = { role: 'system', text: err.message || err.code || 'Nieznany błąd połączenia z Ex-us.' };
  }

  removeTyping();
  exusMessages.push(newMessage);
  exusSaveHistory();
  // Odpowiedzi AI mogą zawierać Markdown — daj bibliotekom (już ładowanym
  // od otwarcia czatu, patrz loadExusChat) szansę dokończyć się zanim
  // wyrenderujemy TĘ konkretną wiadomość; karty/system nie potrzebują tego.
  if (newMessage.role === 'ai') await exusEnsureMarkdownLibs();
  exusRenderMessages(true);

  await exusRefreshLimitBar();
};

// Zatwierdzenie karty propozycji zadania — woła aiConfirmTask z DOKŁADNIE
// polami z proposal (title/time/durationMin/type), po sukcesie zamienia
// kartę w zwykły tekstowy dymek potwierdzenia i odświeża Planer dnia,
// jeśli akurat jest otwarty na tej samej stronie.
window.exusConfirmProposal = async (id) => {
  const msg = exusMessages.find(m => m.id === id && m.role === 'proposal');
  if (!msg || msg.status !== 'pending') return;
  msg.status = 'confirming';
  exusRenderMessages(false);
  try {
    const confirmTask = httpsCallable(functions, 'aiConfirmTask');
    const { title, time, durationMin, type } = msg.proposal;
    await confirmTask({ title, time, durationMin, type });

    msg.role = 'ai';
    msg.text = `Dodano zadanie: ${title} o ${time}`;
    delete msg.proposal;
    delete msg.status;
    exusSaveHistory();
    exusRenderMessages(true);

    // Jeśli Planer dnia jest akurat otwarty (ta sama zakładka/strona co
    // czat nie istnieje — to osobna strona apki), odśwież jego listę
    // zadań, żeby nowo dodane od razu było widoczne bez ręcznego wejścia.
    if (document.getElementById('page-planner')?.classList.contains('active')) {
      await loadPlanner();
    }
  } catch (err) {
    msg.status = 'pending';
    exusRenderMessages(false);
    exusMessages.push({ role: 'system', text: err.message || err.code || 'Nie udało się dodać zadania.' });
    exusSaveHistory();
    exusRenderMessages(true);
  }
};

// Odrzucenie karty propozycji — nic do backendu, karta zamienia się w
// zwykły tekstowy dymek, rozmowa toczy się dalej normalnie.
window.exusRejectProposal = (id) => {
  const msg = exusMessages.find(m => m.id === id && m.role === 'proposal');
  if (!msg) return;
  msg.role = 'ai';
  msg.text = 'Dobrze, nie dodaję tego zadania.';
  delete msg.proposal;
  delete msg.status;
  exusSaveHistory();
  exusRenderMessages(false);
};

// Zatwierdzenie karty propozycji celu — woła aiConfirmGoal z DOKŁADNIE
// polami z proposal (name/type/amount), symetrycznie do exusConfirmProposal
// powyżej. Po sukcesie zamienia kartę w zwykły tekstowy dymek i odświeża
// karty celów na Dashboardzie (loadProfile, bo Cloud Function pisze przez
// Admin SDK — lokalny userProfile o nowym celu jeszcze nie wie — a potem
// renderGoal), jeśli Dashboard jest akurat otwarty.
window.exusConfirmGoalProposal = async (id) => {
  const msg = exusMessages.find(m => m.id === id && m.role === 'goal-proposal');
  if (!msg || msg.status !== 'pending') return;
  msg.status = 'confirming';
  exusRenderMessages(false);
  try {
    const confirmGoal = httpsCallable(functions, 'aiConfirmGoal');
    const { name, type, amount } = msg.proposal;
    await confirmGoal({ name, type, amount });

    msg.role = 'ai';
    msg.text = `Dodano cel: ${name}`;
    delete msg.proposal;
    delete msg.status;
    exusSaveHistory();
    exusRenderMessages(true);

    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
      await loadProfile();
      await renderGoal();
    }
  } catch (err) {
    msg.status = 'pending';
    exusRenderMessages(false);
    exusMessages.push({ role: 'system', text: err.message || err.code || 'Nie udało się dodać celu.' });
    exusSaveHistory();
    exusRenderMessages(true);
  }
};

// Odrzucenie karty propozycji celu — nic do backendu, karta zamienia się
// w zwykły tekstowy dymek, rozmowa toczy się dalej normalnie.
window.exusRejectGoalProposal = (id) => {
  const msg = exusMessages.find(m => m.id === id && m.role === 'goal-proposal');
  if (!msg) return;
  msg.role = 'ai';
  msg.text = 'Dobrze, nie dodaję tego celu.';
  delete msg.proposal;
  delete msg.status;
  exusSaveHistory();
  exusRenderMessages(false);
};

