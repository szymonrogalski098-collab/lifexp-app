// The one Firebase app of v2. Same project, same default app name and the same
// Firestore cache settings as v1 (core.js), so both share the signed-in session
// and the IndexedDB cache on this origin (docs/v2/PLAN.md 3.2). SDK pinned to
// 10.12.x until v1 is retired.
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { emulatorTarget } from '@/lib/emulator';

// Public by design (visible in any browser); security comes from Auth and firestore.rules.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD7Nk7rZydzSA5AdKPJpn0Jm18_LvpAsS4',
  authDomain: 'faiobaj4.firebaseapp.com',
  projectId: 'faiobaj4',
  storageBucket: 'faiobaj4.firebasestorage.app',
  messagingSenderId: '256487131449',
  appId: '1:256487131449:web:9161866d149951b1e580e8',
};

function sessionStorageOrNull(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

const emulator = emulatorTarget(location.hostname, location.search, sessionStorageOrNull());

export const app = initializeApp(emulator ? { ...FIREBASE_CONFIG, projectId: emulator.projectId } : FIREBASE_CONFIG);
// getAuth() without its popup/redirect helper: that helper loads Google's gapi
// script and an iframe at every start. The persistence list is getAuth()'s own,
// so the session stored by v1 is read as before; data/auth.ts passes the helper
// to the one call that needs it (Google sign-in).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

if (emulator) {
  connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
}
