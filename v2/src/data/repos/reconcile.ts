// Everything "Sprawdź spójność" sets side by side (docs/v2/PLAN.md 5.5 point 4),
// read once from the server: a check against the cache could miss writes another
// device made. Reads only.
import { collection, doc, getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import type { ReconcileInput } from '@/domain/reconcile';
import { utcDayKey } from '@/lib/dates';
import { activityFromData } from '../converters/activity';
import { chorePayoutFromData } from '../converters/chores';
import { numberOr } from '../converters/fields';
import { loanFromData } from '../converters/loans';
import { moneyTxFromData } from '../converters/money';
import { profileFromData } from '../converters/profile';
import { db } from '../firebase';
import { balanceIn, moneyDoc } from './balance';

export async function readReconcileInput(uid: string): Promise<ReconcileInput> {
  const all = (name: string) => getDocsFromServer(collection(db, 'users', uid, name));
  const [user, balance, activities, dayLogs, txs, purchases, payouts, loans] = await Promise.all([
    getDocFromServer(doc(db, 'users', uid)),
    getDocFromServer(moneyDoc(uid, 'balance')),
    all('activities'),
    all('dailyLog'),
    all('moneyTransactions'),
    all('purchases'),
    all('chorePayouts'),
    all('moneyLoans'),
  ]);
  const profile = profileFromData(user.data() ?? {});
  return {
    // An entry without a usable timestamp still counts towards the totals, on no day.
    activities: activities.docs.map((d) => {
      const activity = activityFromData(d.id, d.data());
      return { points: numberOr(d.data().points), day: activity ? utcDayKey(activity.at) : null };
    }),
    dayLogs: new Map(dayLogs.docs.map((d) => [d.id, numberOr(d.data().pointsEarned)])),
    transactions: txs.docs.map((d) => moneyTxFromData(d.id, d.data())),
    purchasePoints: purchases.docs.map((d) => numberOr(d.data().pointsCost)),
    payouts: payouts.docs.map((d) => chorePayoutFromData(d.id, d.data()).grosze),
    loans: loans.docs.map((d) => loanFromData(d.id, d.data())),
    goals: profile.goals,
    points: profile.points,
    balance: balance.exists() ? balanceIn(balance) : null,
    incomeAllTime: profile.moneyIncomeAllTime,
  };
}
