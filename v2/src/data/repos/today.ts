// Live reads for the Today screen (docs/v2/PLAN.md 9, stage 2a). One listener per
// source; each returns its unsubscribe. Nothing here writes.
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { Activity, DayLog } from '@/domain/activity';
import { groszeFromZloty } from '@/lib/money';
import { activityDefName, activityFromData, dayLogFromData } from '../converters/activity';
import { numberOr } from '../converters/fields';
import { db } from '../firebase';

type OnError = (error: unknown) => void;

/** users/{uid}/dailyLog: every day (v1 reads them all for the streak; one small doc per day). */
export function watchDayLogs(uid: string, onChange: (days: Map<string, DayLog>) => void, onError: OnError) {
  return onSnapshot(
    collection(db, 'users', uid, 'dailyLog'),
    (snap) => onChange(new Map(snap.docs.map((d) => [d.id, dayLogFromData(d.data())]))),
    onError,
  );
}

/** The newest `count` activities, as on v1's dashboard (5). */
export function watchRecentActivities(
  uid: string,
  count: number,
  onChange: (activities: Activity[]) => void,
  onError: OnError,
) {
  return onSnapshot(
    query(collection(db, 'users', uid, 'activities'), orderBy('timestamp', 'desc'), limit(count)),
    (snap) => onChange(snap.docs.flatMap((d) => activityFromData(d.id, d.data()) ?? [])),
    onError,
  );
}

/** users/{uid}/activityDefs → id → name. v1 seeds them when empty; v2 does not. */
export function watchActivityDefNames(uid: string, onChange: (names: Map<string, string>) => void, onError: OnError) {
  return onSnapshot(
    collection(db, 'users', uid, 'activityDefs'),
    (snap) =>
      onChange(
        new Map(
          snap.docs.flatMap((d) => {
            const name = activityDefName(d.data());
            return name ? [[d.id, name] as const] : [];
          }),
        ),
      ),
    onError,
  );
}

/** users/{uid}/money/balance.current (złoty in v1) as grosze; null when there is no balance yet. */
export function watchMoneyBalance(uid: string, onChange: (grosze: number | null) => void, onError: OnError) {
  return onSnapshot(
    doc(db, 'users', uid, 'money', 'balance'),
    (snap) => onChange(snap.exists() ? groszeFromZloty(numberOr(snap.data().current)) : null),
    onError,
  );
}
