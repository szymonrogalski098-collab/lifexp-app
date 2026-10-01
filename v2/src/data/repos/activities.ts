// users/{uid}/activities and their definitions (docs/v2/PLAN.md 9, stage 3e; GOLDEN
// G1, G11). Logging and deleting move points, so each is one transaction: the entry,
// the UTC day's dailyLog and the profile's points change together or not at all,
// and the daily limit is checked against the server's numbers. Needs the server.
import {
  collection,
  doc,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import {
  ACTIVITY_SEEDS,
  creditActivity,
  revertActivity,
  sortActivityDefs,
  type ActivityDef,
} from '@/domain/activity';
import { utcDayKey } from '@/lib/dates';
import { activityDefFromData, activityFromData, newActivityData } from '../converters/activity';
import { numberOr } from '../converters/fields';
import { db } from '../firebase';

type OnError = (error: unknown) => void;

const userOf = (uid: string) => doc(db, 'users', uid);
const activitiesOf = (uid: string) => collection(db, 'users', uid, 'activities');
const defsOf = (uid: string) => collection(db, 'users', uid, 'activityDefs');
const dayOf = (uid: string, key: string) => doc(db, 'users', uid, 'dailyLog', key);

/** Every definition with a name, in v1's order. */
export function watchActivityDefs(uid: string, onChange: (defs: ActivityDef[]) => void, onError: OnError) {
  return onSnapshot(
    defsOf(uid),
    (snap) => onChange(sortActivityDefs(snap.docs.flatMap((d) => activityDefFromData(d.id, d.data()) ?? []))),
    onError,
  );
}

/**
 * v1 ensureActivityDefsSeeded(): an account without a single definition gets v1's
 * list under v1's ids. Asked of the server only, so offline this rejects and
 * seeds nothing. Resolves to whether it seeded.
 */
export async function seedActivityDefsIfEmpty(uid: string): Promise<boolean> {
  const snap = await getDocsFromServer(query(defsOf(uid), limit(1)));
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  for (const { id, ...data } of ACTIVITY_SEEDS) batch.set(doc(defsOf(uid), id), data);
  await batch.commit();
  return true;
}

export interface LogActivityInput {
  type: string;
  typeName: string | null;
  minutes: number;
  desc: string;
  pointsPerHour: number;
  now: Date;
}

export type LogActivityOutcome = { ok: true; points: number; earned: number } | { ok: false; problem: 'dailyLimit' };

/**
 * v1 logActivity() + persistActivity() as one transaction: the credit is worked out
 * from the server's dailyLog and limit (G1), so two tabs cannot both fill the same
 * room under the limit. Nothing is written when nothing would be credited (G1.8).
 */
export function logActivity(uid: string, input: LogActivityInput): Promise<LogActivityOutcome> {
  return runTransaction(db, async (tx): Promise<LogActivityOutcome> => {
    const dayRef = dayOf(uid, utcDayKey(input.now));
    const day = await tx.get(dayRef);
    const user = await tx.get(userOf(uid));
    const earnedToday = day.exists() ? numberOr(day.data().pointsEarned) : 0;
    const credit = creditActivity(input.minutes, input.pointsPerHour, earnedToday, numberOr(user.data()?.dailyLimit));
    if (credit.points === 0) return { ok: false, problem: 'dailyLimit' };

    tx.set(doc(activitiesOf(uid)), newActivityData({ ...input, points: credit.points }));
    if (day.exists()) tx.update(dayRef, { pointsEarned: increment(credit.points) });
    else tx.set(dayRef, { pointsEarned: credit.points, gamingMinutes: 0 });
    tx.update(userOf(uid), {
      'points.total': increment(credit.points),
      'points.earnedAllTime': increment(credit.points),
    });
    return { ok: true, points: credit.points, earned: credit.earned };
  });
}

/**
 * G11 (v1 deleteActivity + revertActivityPoints) as one transaction, on the server's
 * numbers rather than the ones the screen last saw. Resolves to the points taken
 * back; 0 when the entry is already gone.
 */
export function deleteActivity(uid: string, id: string): Promise<number> {
  return runTransaction(db, async (tx) => {
    const ref = doc(activitiesOf(uid), id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return 0;
    const activity = activityFromData(id, snap.data());
    const points = numberOr(snap.data().points);
    // The UTC day of its timestamp (G13); an entry without one has no day to correct.
    const dayRef = activity ? dayOf(uid, utcDayKey(activity.at)) : null;
    const day = dayRef ? await tx.get(dayRef) : null;
    const user = await tx.get(userOf(uid));
    const totals = user.data()?.points;
    const after = revertActivity(points, {
      dayPoints: day?.exists() ? numberOr(day.data().pointsEarned) : null,
      total: numberOr(totals?.total),
      earnedAllTime: numberOr(totals?.earnedAllTime),
    });

    tx.delete(ref);
    if (dayRef && after.dayPoints !== null) tx.update(dayRef, { pointsEarned: after.dayPoints });
    tx.update(userOf(uid), { 'points.total': after.total, 'points.earnedAllTime': after.earnedAllTime });
    return points;
  });
}
