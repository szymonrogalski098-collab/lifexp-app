/**
 * Wysyła tygodniowy raport przez EmailJS REST API — zawiera zarówno
 * podsumowanie aktywności (tydzień) jak i sekcję Money (bieżący miesiąc).
 * Uruchamiane w niedzielę przez GitHub Action.
 * Wymaga sekretów: FIREBASE_SERVICE_ACCOUNT, EMAILJS_PRIVATE_KEY.
 *
 * Szablon EmailJS (template_jztwowz) — kod do wklejenia: email-templates/weekly-report.html
 */
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const SERVICE_ID  = 'service_417sg11';
const TEMPLATE_ID = 'template_jztwowz';
const PUBLIC_KEY  = '1vFk29QDNKopU0RnJ';

const MONEY_LIMIT_DEFAULT = 200;
const pln = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2);

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

// Sekcja Money: dane liczone od początku BIEŻĄCEGO miesiąca kalendarzowego
// (nie osobny cron — ten sam tygodniowy wysyłkowy job pokazuje stan "miesiąc do tej pory").
async function loadMoneyParams(uid) {
  const mk = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const [balSnap, setSnap, txSnap, goalsSnap] = await Promise.all([
    db.doc(`users/${uid}/money/balance`).get(),
    db.doc(`users/${uid}/money/settings`).get(),
    db.collection(`users/${uid}/moneyTransactions`)
      .where('date', '>=', `${mk}-01`).where('date', '<=', `${mk}-31`).get(),
    db.collection(`users/${uid}/moneyGoals`).get(),
  ]);

  const balance = balSnap.exists ? (balSnap.data().current || 0) : 0;
  const limit = setSnap.exists ? (setSnap.data().monthlyLimit ?? MONEY_LIMIT_DEFAULT) : MONEY_LIMIT_DEFAULT;

  let income = 0, expenses = 0;
  const byCat = {};
  txSnap.docs.forEach(d => {
    const t = d.data();
    if (t.type === 'income') {
      income += t.amount || 0;
    } else if (t.type === 'expense') {
      expenses += t.amount || 0;
      const cat = t.category || 'inne';
      byCat[cat] = (byCat[cat] || 0) + (t.amount || 0);
    }
  });

  const topCategories = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, sum], i) => `${i + 1}. ${name}: ${pln(sum)} zł`)
    .join('\n') || 'Brak wydatków w tym miesiącu.';

  const goalsStatus = goalsSnap.docs.map(d => {
    const g = d.data();
    const pct = g.targetAmount ? Math.min(100, ((g.savedAmount || 0) / g.targetAmount) * 100) : 0;
    return `• ${g.name}: zebrano ${pln(g.savedAmount)} / ${pln(g.targetAmount)} zł (${pct.toFixed(0)}%)`;
  }).join('\n') || 'Brak celów oszczędnościowych.';

  const exceeded = limit > 0 && expenses > limit;
  const limitInfo = exceeded
    ? `⚠️ ${pln(expenses)} / ${pln(limit)} zł`
    : `✅ ${pln(expenses)} / ${pln(limit)} zł`;

  return {
    money_balance_pln: pln(balance) + ' zł',
    money_income_pln: pln(income) + ' zł',
    money_expenses_pln: pln(expenses) + ' zł',
    money_limit_info: limitInfo,
    money_limit_color: exceeded ? '#ff6b6b' : '#4ecca3',
    money_top_categories: topCategories,
    money_goals_status: goalsStatus,
  };
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
    const toEmail = user.parentEmail;
    if (!toEmail) { console.log(`Pominięto ${user.name} — brak emaila rodzica.`); continue; }

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
      const moneyParams = await loadMoneyParams(userDoc.id);

      await sendEmail({
        to_email:      toEmail,
        user_name:     user.name || 'Użytkownik',
        points_earned: weekPts,
        balance_pln:   (balance / 10).toFixed(2) + ' zł',
        gaming_time:   formatMinutes(weekGaming),
        purchases:     weekSpent.toFixed(2),
        ...moneyParams,
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
