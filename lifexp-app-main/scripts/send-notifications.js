/**
 * Wysyła push (FCM) do użytkowników którzy mają bieżącą godzinę (czas PL)
 * na swojej liście notifHours. Uruchamiane co godzinę przez GitHub Action.
 * Wymaga sekretu FIREBASE_SERVICE_ACCOUNT w ustawieniach repo.
 */
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Bieżąca godzina w Polsce (obsługuje zmianę czasu letniego/zimowego).
function polishHour() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' })).getHours();
}

const MESSAGES = [
  { title: 'LifeXP ⚡',            body: 'Nie zapomnij dziś zalogować aktywności i zgarnąć punktów!' },
  { title: '🔥 Utrzymaj serię!',   body: 'Zaloguj coś dziś i nie przerywaj passy!' },
  { title: '💰 Sprawdź saldo',     body: 'Może masz już dość punktów na coś fajnego?' },
  { title: '🎯 Wyzwanie dnia',     body: 'Czy uda Ci się dziś zbić dzienny limit punktów?' },
  { title: '🌙 Koniec dnia',       body: 'Podsumuj dzień — zaloguj aktywności zanim zaśniesz!' },
];

async function main() {
  const hour = polishHour();
  console.log(`Bieżąca godzina (PL): ${hour}:00`);

  // Pobierz tokeny od użytkowników którzy mają tę godzinę w notifHours.
  const usersSnap = await db.collection('users')
    .where('notifHours', 'array-contains', hour)
    .get();

  if (usersSnap.empty) { console.log('Brak użytkowników z powiadomieniem o tej godzinie.'); return; }

  // Zbierz wszystkie tokeny tych użytkowników.
  const tokenRefs = new Map();
  for (const userDoc of usersSnap.docs) {
    const tokensSnap = await db.collection(`users/${userDoc.id}/fcmTokens`).get();
    tokensSnap.docs.forEach(d => {
      const t = d.data().token;
      if (t) tokenRefs.set(t, d.ref);
    });
  }

  const tokens = [...tokenRefs.keys()];
  if (tokens.length === 0) { console.log('Brak tokenów FCM.'); return; }

  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  console.log(`Wysyłam: "${msg.title}" do ${tokens.length} urządzeń`);

  const message = {
    notification: { title: msg.title, body: msg.body },
    webpush: { fcmOptions: { link: 'https://szymonrogalski098-collab.github.io/lifexp-app/app.html' } },
  };

  const res = await admin.messaging().sendEachForMulticast({ ...message, tokens });
  console.log(`Wysłano: ${res.successCount}, błędy: ${res.failureCount}`);

  // Sprzątanie martwych tokenów.
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
      dead.push(tokenRefs.get(tokens[i]));
    }
  });
  await Promise.all(dead.map(ref => ref.delete().catch(() => {})));
  if (dead.length) console.log(`Usunięto martwych tokenów: ${dead.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
