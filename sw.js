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
const CACHE = 'lifexp-shell-v1';
const SHELL = ['./', 'index.html', 'app.html', 'verify.html', 'parent.html', 'style.css', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Tylko GET-y z naszego origin obsługujemy z cache; Firebase/Firestore/EmailJS → sieć.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match('app.html')))
  );
});
