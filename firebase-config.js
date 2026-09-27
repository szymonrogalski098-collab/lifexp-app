// Firebase web config — JEST publiczny z założenia (widoczny w DevTools).
// To nie jest hasło, tylko identyfikator projektu. Bezpieczeństwo dają
// reguły Firestore (firestore.rules) + Auth, NIE ukrywanie tych kluczy.
const firebaseConfig = {
  apiKey: "AIzaSyD7Nk7rZydzSA5AdKPJpn0Jm18_LvpAsS4",
  authDomain: "faiobaj4.firebaseapp.com",
  projectId: "faiobaj4",
  storageBucket: "faiobaj4.firebasestorage.app",
  messagingSenderId: "256487131449",
  appId: "1:256487131449:web:9161866d149951b1e580e8"
};

// Tryb emulatora — WYŁĄCZNIE do testów (Playwright/CI na localhost). Włącza go
// parametr ?emulator=1; flaga zostaje w sessionStorage, bo strony przechodzą
// między sobą przez location.href (index → verify → app), co gubi query string.
// Poza localhost zawsze null, więc produkcja (github.io) nie ma jak go włączyć.
// Projekt "demo-*" to konwencja Firebase: emulator nie może wtedy sięgnąć do
// żadnych prawdziwych zasobów, a cache IndexedDB jest oddzielony od produkcji.
const LIFEXP_EMULATOR = (function () {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!local) return null;
  try {
    if (new URLSearchParams(location.search).has('emulator')) sessionStorage.setItem('lifexp-emulator', '1');
    if (sessionStorage.getItem('lifexp-emulator') !== '1') return null;
  } catch (e) { return null; }
  return { host: '127.0.0.1', authPort: 9099, firestorePort: 8080, functionsPort: 5001, projectId: 'demo-lifexp' };
})();
if (LIFEXP_EMULATOR) firebaseConfig.projectId = LIFEXP_EMULATOR.projectId;
