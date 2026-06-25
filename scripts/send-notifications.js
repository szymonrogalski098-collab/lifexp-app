/**
 * Wysyła push (FCM) do wszystkich zapisanych urządzeń.
 * Uruchamiane przez GitHub Action (cron). Wymaga sekretu FIREBASE_SERVICE_ACCOUNT
 * (cała zawartość pliku JSON service account) w ustawieniach repo.
 */
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  // Wszystkie tokeny ze wszystkich kont: subkolekcje users/{uid}/fcmTokens.
  const snap = await db.collectionGroup('fcmTokens').get();
  const docsByToken = new Map();
  snap.docs.forEach((d) => { const t = d.data().token; if (t) docsByToken.set(t, d.ref); });
  const tokens = [...docsByToken.keys()];

  if (tokens.length === 0) { console.log('Brak tokenów — nic do wysłania.'); return; }

  const message = {
    notification: {
      title: 'LifeXP ⚡',
      body: 'Nie zapomnij dziś zalogować aktywności i zgarnąć punktów!',
    },
    webpush: { fcmOptions: { link: 'https://szymonrogalski098-collab.github.io/lifexp-app/app.html' } },
  };

  const res = await admin.messaging().sendEachForMulticast({ ...message, tokens });
  console.log(`Wysłano: ${res.successCount}, błędy: ${res.failureCount}`);

  // Sprzątanie martwych tokenów.
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
      dead.push(docsByToken.get(tokens[i]));
    }
  });
  await Promise.all(dead.map((ref) => ref.delete().catch(() => {})));
  if (dead.length) console.log(`Usunięto martwych tokenów: ${dead.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
