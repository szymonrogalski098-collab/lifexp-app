/**
 * Wysyła tygodniowy raport przez EmailJS REST API.
 * Uruchamiane w niedzielę przez GitHub Action.
 * Wymaga sekretów: FIREBASE_SERVICE_ACCOUNT, EMAILJS_PRIVATE_KEY.
 */
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const SERVICE_ID  = 'service_417sg11';
const TEMPLATE_ID = 'template_jztwowz';
const PUBLIC_KEY  = '1vFk29QDNKopU0RnJ';

function formatMinutes(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

async function sendEmail(params) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: params,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function main() {
  const snap = await db.collection('users').where('autoReport', '==', true).get();
  if (snap.empty) { console.log('Brak użytkowników z włączonym raportem.'); return; }

  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  let sent = 0, errors = 0;

  for (const userDoc of snap.docs) {
    const user = userDoc.data();
    const toEmail = user.parentEmail || user.email;
    if (!toEmail) { console.log(`Pominięto ${user.name} — brak emaila.`); continue; }

    try {
      let weekPts = 0, weekGaming = 0, weekSpent = 0;

      for (const day of days) {
        const daySnap = await db.doc(`users/${userDoc.id}/dailyLog/${day}`).get();
        if (daySnap.exists) {
          weekPts    += daySnap.data().pointsEarned  || 0;
          weekGaming += daySnap.data().gamingMinutes || 0;
        }
      }

      const pSnap = await db.collection(`users/${userDoc.id}/purchases`)
        .orderBy('timestamp', 'desc').limit(20).get();
      pSnap.docs.forEach(d => {
        const ts = d.data().timestamp?.toDate ? d.data().timestamp.toDate() : new Date(d.data().timestamp);
        if (ts > weekAgo) weekSpent += d.data().amount || 0;
      });

      const balance = user.points?.total || 0;

      await sendEmail({
        to_email:      toEmail,
        user_name:     user.name || 'Użytkownik',
        points_earned: weekPts,
        balance_pln:   (balance / 10).toFixed(2) + ' zł',
        gaming_time:   formatMinutes(weekGaming),
        purchases:     weekSpent.toFixed(2),
      });

      await db.doc(`users/${userDoc.id}`).update({ lastReportSent: now.toISOString().split('T')[0] });
      console.log(`✓ Raport wysłany: ${user.name} → ${toEmail}`);
      sent++;
    } catch (e) {
      console.error(`✗ Błąd dla ${user.name}:`, e.message);
      errors++;
    }
  }

  console.log(`\nGotowe. Wysłano: ${sent}, błędy: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
