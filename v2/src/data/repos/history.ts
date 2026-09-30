// The full activity history, a page at a time (docs/v2/PLAN.md B16, stage 3e DoD):
// v1 reads every activity at once; v2 reads one page per request with a cursor,
// so opening the history costs the same with 30 entries or 30 000. Nothing here writes.
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Activity } from '@/domain/activity';
import { activityFromData } from '../converters/activity';
import { db } from '../firebase';

export interface ActivityPage {
  activities: Activity[];
  hasMore: boolean;
}

export interface ActivityPager {
  /** The next page, newest first. Calls must not overlap. */
  next(): Promise<ActivityPage>;
}

/** Pages of `pageSize` activities, newest first. The cursor stays inside the data layer. */
export function activityPager(uid: string, pageSize: number): ActivityPager {
  const activities = collection(db, 'users', uid, 'activities');
  let cursor: QueryDocumentSnapshot | null = null;
  let finished = false;

  return {
    async next() {
      if (finished) return { activities: [], hasMore: false };
      // One entry more than the page tells whether another page exists, without a second request.
      const constraints = [orderBy('timestamp', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize + 1)];
      const snap = await getDocs(query(activities, ...constraints));
      const docs = snap.docs.slice(0, pageSize);
      finished = snap.docs.length <= pageSize;
      cursor = docs.at(-1) ?? cursor;
      return {
        activities: docs.flatMap((d) => activityFromData(d.id, d.data()) ?? []),
        hasMore: !finished,
      };
    },
  };
}

/** How many activities there are, counted by the server (one read per 1000 entries). Fails offline. */
export async function countActivities(uid: string): Promise<number> {
  const snap = await getCountFromServer(collection(db, 'users', uid, 'activities'));
  return snap.data().count;
}
