// users/{uid}/activities and their definitions (docs/v2/PLAN.md 9, stage 3e; GOLDEN
// G1, G11). Logging and deleting move points, so each is one transaction: the entry,
// the UTC day's dailyLog and the profile's points change together or not at all,
// and the daily limit is checked against the server's numbers. Needs the server.
import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
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

/**
 * Every definition with a name, in v1's order. An empty answer from the local cache
 * says nothing yet (never read on this device), so it waits for the server instead
 * of reporting "no definitions".
 */
export function watchActivityDefs(uid: string, onChange: (defs: ActivityDef[]) => void, onError: OnError) {
  return onSnapshot(
    defsOf(uid),
    (snap) => {
      if (snap.empty && snap.metadata.fromCache) return;
      onChange(sortActivityDefs(snap.docs.flatMap((d) => activityDefFromData(d.id, d.data()) ?? [])));
    },
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

/** A type's fields as v1 addActivityDef() writes them; a missing icon or colour stays missing. */
function activityDefData({ name, points, order, icon, color }: Omit<ActivityDef, 'id'>): DocumentData {
  return { name, points, order, ...(icon ? { icon } : {}), ...(color ? { color } : {}) };
}

/** v1 addActivityDef(): a new document under a generated id. */
export function addActivityDef(uid: string, def: Omit<ActivityDef, 'id'>): { id: string; saved: Promise<void> } {
  const ref = doc(defsOf(uid));
  return { id: ref.id, saved: setDoc(ref, activityDefData(def)) };
}

/** Writes a type's fields over the stored ones; its place in the list and fields v2 does not know stay. */
export function updateActivityDef(uid: string, def: ActivityDef): Promise<void> {
  const { name, points, icon, color } = def;
  return updateDoc(doc(defsOf(uid), def.id), { name, points, ...(icon ? { icon } : {}), ...(color ? { color } : {}) });
}

/** v1 deleteActivityDef(): entries keep the type's id; they just lose its name, as in v1. */
export function removeActivityDef(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(defsOf(uid), id));
}

export function restoreActivityDef(uid: string, def: ActivityDef): Promise<void> {
  const { id, ...data } = def;
  return setDoc(doc(defsOf(uid), id), activityDefData(data));
}

export interface LogActivityInput {
  type: string;
  typeName: string | null;
  minutes: number;
  desc: string;
  pointsPerHour: number;
  /** The entry's time; for an offline draft, when the draft was made. */
  now: Date;
  /** The UTC day whose dailyLog gets the points; the day of `now` unless a draft says otherwise. */
  day?: string;
}

export type LogActivityOutcome = { ok: true; points: number; earned: number } | { ok: false; problem: 'dailyLimit' };

/**
 * v1 logActivity() + persistActivity() as one transaction: the credit is worked out
 * from the server's dailyLog and limit (G1), so two tabs cannot both fill the same
 * room under the limit. Nothing is written when nothing would be credited (G1.8).
 */
export function logActivity(uid: string, input: LogActivityInput): Promise<LogActivityOutcome> {
  return runTransaction(db, async (tx): Promise<LogActivityOutcome> => {
    const dayRef = dayOf(uid, input.day ?? utcDayKey(input.now));
    const day = await tx.get(dayRef);
    const user = await tx.get(userOf(uid));
    const earnedToday = day.exists() ? numberOr(day.data().pointsEarned) : 0;
    const credit = creditActivity(input.minutes, input.pointsPerHour, earnedToday, numberOr(user.data()?.dailyLimit));
    if (credit.points === 0) return { ok: false, problem: 'dailyLimit' };

    tx.set(
      doc(activitiesOf(uid)),
      newActivityData({ type: input.type, typeName: input.typeName, minutes: input.minutes, desc: input.desc, points: credit.points, now: input.now }),
    );
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
