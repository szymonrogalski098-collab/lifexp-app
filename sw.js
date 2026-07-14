/* LifeXP service worker — PWA app-shell cache + FCM background push (jeden SW). */

// ── Firebase Cloud Messaging (background) ──
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD7Nk7rZydzSA5AdKPJpn0Jm18_LvpAsS4",
  authDomain: "faiobaj4.firebaseapp.com",
  projectId: "faiobaj4",
  storageBucket: "faiobaj4.firebasestorage.app",
  messagingSenderId: "256487131449",
  appId: "1:256487131449:web:9161866d149951b1e580e8"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'LifeXP', {
    body: n.body || '',
    icon: 'icon.svg',
    badge: 'icon.svg',
  });
});

// Klik w powiadomienie → otwórz/focusuj aplikację.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) { if ('focus' in w) return w.focus(); }
    if (clients.openWindow) return clients.openWindow('app.html');
  }));
});

// ── PWA app-shell cache ──
const CACHE = 'lifexp-shell-v24';
const STATIC = ['style.css', 'manifest.json', 'icon.svg', 'games.js'];
const HTML   = ['index.html', 'app.html', 'verify.html', 'parent.html'];

// Precache STATIC *i* HTML na starcie — bez tego HTML trafiał do cache TYLKO
// jako efekt uboczny udanej nawigacji online (patrz fetch handler niżej), więc
// zaraz po każdym bumpie CACHE (czyli niemal po każdym deployu — activate niżej
// czyści WSZYSTKIE inne wersje cache) świeży cache był PUSTY z HTML-i. Jeśli
// pierwsze uruchomienie po takim bumpie trafiło się w pełni offline (tryb
// samolotowy bez wcześniejszego online), fetch() padał, a fallback
// (caches.match) też nic nie znajdował — to była przyczyna "nie może
// przekierować na app.html" w trybie samolotowym. `cache: 'reload'` pomija
// zwykły cache HTTP przy pobieraniu (spójne z network-first HTML niżej) —
// bez tego precache mógłby złapać starą, zbuforowaną przez przeglądarkę kopię.
const PRECACHE = STATIC.concat(HTML);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((url) => fetch(url, { cache: 'reload' }).then((resp) => c.put(url, resp)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Ostatnia deska ratunku, gdy fetch() padnie I nic nie ma w cache (powinno być
// rzadkie po precache HTML wyżej, ale np. ręcznie wyczyszczone dane strony
// mid-flight nadal by to trafiły) — respondWith(undefined) to NIE jest
// poprawny Response, więc przeglądarka rzuca własny, niekontrolowany błąd
// nawigacji zamiast czegokolwiek pokazać. Zawsze zwracamy PRAWDZIWY Response.
const OFFLINE_FALLBACK = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>LifeXP — offline</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;' +
  'justify-content:center;background:#0e0f13;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
  '<div><h1 style="margin-bottom:8px">Brak połączenia</h1>' +
  '<p style="color:#8a8fa8;max-width:320px">Nie udało się załadować LifeXP offline. Otwórz aplikację raz z internetem, ' +
  'żeby zapisała się do użytku offline, a potem spróbuj ponownie.</p></div></body>',
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const isHTML = HTML.some((f) => url.pathname.endsWith(f)) || url.pathname === '/' || url.pathname.endsWith('/');

  if (isHTML) {
    // Network-first: zawsze świeży HTML, fallback na cache gdy offline.
    // cache: 'no-store' pomija zwykły cache HTTP przeglądarki/CDN (GitHub Pages) —
    // bez tego fetch() potrafił dostawać stary zbuforowany HTML mimo strategii
    // "network-first" (to była przyczyna starego UI na telefonie po deployu).
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('app.html')).then((hit) => hit || OFFLINE_FALLBACK()))
    );
  } else {
    // Cache-first: CSS, ikony itd. — szybkość, aktualizowane przy zmianie pliku.
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      }))
    );
  }
});
