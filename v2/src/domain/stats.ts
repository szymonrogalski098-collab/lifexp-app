// Statistics as v1 shows them (docs/v2/GOLDEN.md G14): the last 7 UTC days next to
// the 7 before them, the most frequent activities among the latest entries, and
// the "facts" sentences built from both.
import type { Activity, DayLog } from './activity';
import { addDays } from '@/lib/dates';
import { pointsToGrosze } from './points';

/** v1 fetchTopActivities() groups the newest 50 activities. */
export const TOP_SAMPLE = 50;
/** v1 lists the first five groups. */
export const TOP_COUNT = 5;

export interface StatsDay {
  /** UTC day key (dailyLog id). */
  key: string;
  points: number;
  gamingMinutes: number;
}

export interface StatsWeeks {
  /** today − 6 … today, oldest first. */
  thisWeek: StatsDay[];
  /** today − 13 … today − 7, oldest first. */
  lastWeek: StatsDay[];
}

function daysBack(days: ReadonlyMap<string, DayLog>, today: string, from: number, to: number): StatsDay[] {
  const out: StatsDay[] = [];
  for (let ago = from; ago >= to; ago--) {
    const key = addDays(today, -ago);
    const log = days.get(key);
    out.push({ key, points: log?.pointsEarned ?? 0, gamingMinutes: log?.gamingMinutes ?? 0 });
  }
  return out;
}

/**
 * v1 statsDayWindows(): both windows count back from the same `today` (a UTC day,
 * G13), so the comparison cannot drift at midnight. Days without a log count as 0.
 */
export function statsWeeks(days: ReadonlyMap<string, DayLog>, today: string): StatsWeeks {
  return { thisWeek: daysBack(days, today, 6, 0), lastWeek: daysBack(days, today, 13, 7) };
}

export function sumPoints(days: readonly StatsDay[]): number {
  return days.reduce((sum, day) => sum + day.points, 0);
}

export function sumGaming(days: readonly StatsDay[]): number {
  return days.reduce((sum, day) => sum + day.gamingMinutes, 0);
}

export interface TopActivity {
  /** activityDefs id; v1 names the group by its definition, else by the id. */
  type: string;
  count: number;
  points: number;
}

/**
 * v1 fetchTopActivities(): entries grouped by type (entries without one are
 * skipped), most entries first; ties keep the order in which the newest-first
 * list meets them. Every group is returned; v1 shows the first TOP_COUNT.
 */
export function topActivities(activities: readonly Activity[]): TopActivity[] {
  const groups = new Map<string, TopActivity>();
  for (const activity of activities) {
    if (!activity.type) continue;
    const group = groups.get(activity.type) ?? { type: activity.type, count: 0, points: 0 };
    group.count += 1;
    group.points += activity.points;
    groups.set(activity.type, group);
  }
  // Array.prototype.sort is stable, as v1 relies on.
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export type StatsFact =
  | { kind: 'favoriteActivity'; type: string; count: number }
  | { kind: 'moreThisWeek'; diff: number; cur: number; prev: number }
  | { kind: 'moreLastWeek'; diff: number }
  | { kind: 'sameAsLastWeek'; cur: number }
  | { kind: 'weekMoney'; grosze: number }
  | { kind: 'gamedMoreThisWeek'; minutes: number }
  | { kind: 'gamedLessThisWeek'; minutes: number }
  | { kind: 'bestDay'; day: string; points: number };

/** The first day with the most points, counting from the oldest (v1's strict `>`). */
export function bestDay(week: readonly StatsDay[]): StatsDay | null {
  let best: StatsDay | null = null;
  for (const day of week) if (!best || day.points > best.points) best = day;
  return best && best.points > 0 ? best : null;
}

/**
 * v1 buildStatsFacts(), in its order: each sentence only when it has something to
 * say, so an empty list hides the card. `rate` is złoty per point (generalRate).
 */
export function statsFacts(weeks: StatsWeeks, top: readonly TopActivity[], rate: number): StatsFact[] {
  const facts: StatsFact[] = [];
  const favorite = top[0];
  if (favorite) facts.push({ kind: 'favoriteActivity', type: favorite.type, count: favorite.count });

  const cur = sumPoints(weeks.thisWeek);
  const prev = sumPoints(weeks.lastWeek);
  if (cur > prev) facts.push({ kind: 'moreThisWeek', diff: cur - prev, cur, prev });
  else if (cur < prev) facts.push({ kind: 'moreLastWeek', diff: prev - cur });
  else if (cur > 0) facts.push({ kind: 'sameAsLastWeek', cur });

  if (cur > 0) facts.push({ kind: 'weekMoney', grosze: pointsToGrosze(cur, rate) });

  const gamingDiff = sumGaming(weeks.thisWeek) - sumGaming(weeks.lastWeek);
  if (gamingDiff > 0) facts.push({ kind: 'gamedMoreThisWeek', minutes: gamingDiff });
  else if (gamingDiff < 0) facts.push({ kind: 'gamedLessThisWeek', minutes: -gamingDiff });

  const best = bestDay(weeks.thisWeek);
  if (best) facts.push({ kind: 'bestDay', day: best.key, points: best.points });
  return facts;
}
