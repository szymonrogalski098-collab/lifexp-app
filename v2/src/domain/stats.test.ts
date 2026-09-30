import { describe, expect, test } from 'vitest';
import type { Activity, DayLog } from './activity';
import { bestDay, statsFacts, statsWeeks, sumGaming, sumPoints, topActivities, type StatsWeeks } from './stats';

const TODAY = '2026-09-30';

function logs(entries: Record<string, [number, number]>): Map<string, DayLog> {
  return new Map(
    Object.entries(entries).map(([key, [pointsEarned, gamingMinutes]]) => [key, { pointsEarned, gamingMinutes }]),
  );
}

let n = 0;
const activity = (type: string, points: number): Activity => ({
  id: `a${(n += 1)}`,
  type,
  typeName: null,
  desc: '',
  duration: 30,
  points,
  at: new Date('2026-09-30T10:00:00Z'),
});

describe('G14.1 windows (v1 statsDayWindows)', () => {
  test('this week = today − 6 … today, last week = today − 13 … today − 7, oldest first', () => {
    const weeks = statsWeeks(new Map(), TODAY);
    expect(weeks.thisWeek.map((d) => d.key)).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
    expect(weeks.lastWeek[0]?.key).toBe('2026-09-17');
    expect(weeks.lastWeek[6]?.key).toBe('2026-09-23');
  });

  test('days without a log count as 0; logs outside both windows are ignored', () => {
    const weeks = statsWeeks(logs({ '2026-09-30': [40, 30], '2026-09-23': [25, 60], '2026-09-16': [999, 999] }), TODAY);
    expect(sumPoints(weeks.thisWeek)).toBe(40);
    expect(sumGaming(weeks.thisWeek)).toBe(30);
    expect(sumPoints(weeks.lastWeek)).toBe(25);
    expect(sumGaming(weeks.lastWeek)).toBe(60);
  });

  test('crosses a month and a year', () => {
    expect(statsWeeks(new Map(), '2027-01-03').thisWeek[0]?.key).toBe('2026-12-28');
  });
});

describe('G14.2 top activities (v1 fetchTopActivities)', () => {
  test('grouped by type, most entries first, points summed', () => {
    const top = topActivities([
      activity('run', 10),
      activity('read', 5),
      activity('read', 7),
      activity('run', 3),
      activity('read', 1),
    ]);
    expect(top).toEqual([
      { type: 'read', count: 3, points: 13 },
      { type: 'run', count: 2, points: 13 },
    ]);
  });

  test('ties keep the order of the newest-first list; entries without a type are skipped', () => {
    const top = topActivities([activity('b', 1), activity('', 50), activity('a', 1), activity('c', 1)]);
    expect(top.map((g) => g.type)).toEqual(['b', 'a', 'c']);
  });
});

describe('G14.3 facts (v1 buildStatsFacts)', () => {
  const weeks = (entries: Record<string, [number, number]>): StatsWeeks => statsWeeks(logs(entries), TODAY);

  test('nothing to say → no facts (v1 hides the card)', () => {
    expect(statsFacts(weeks({}), [], 0.1)).toEqual([]);
  });

  test('all sentences, in v1 order', () => {
    const w = weeks({ '2026-09-28': [60, 90], '2026-09-30': [60, 0], '2026-09-20': [50, 30] });
    expect(statsFacts(w, [{ type: 'read', count: 3, points: 13 }], 0.1)).toEqual([
      { kind: 'favoriteActivity', type: 'read', count: 3 },
      { kind: 'moreThisWeek', diff: 70, cur: 120, prev: 50 },
      { kind: 'weekMoney', grosze: 1200 },
      { kind: 'gamedMoreThisWeek', minutes: 60 },
      // Two days with 60: the older one wins.
      { kind: 'bestDay', day: '2026-09-28', points: 60 },
    ]);
  });

  test('a weaker week: points and gaming both lower', () => {
    const w = weeks({ '2026-09-29': [10, 15], '2026-09-18': [40, 75] });
    expect(statsFacts(w, [], 0.1)).toEqual([
      { kind: 'moreLastWeek', diff: 30 },
      { kind: 'weekMoney', grosze: 100 },
      { kind: 'gamedLessThisWeek', minutes: 60 },
      { kind: 'bestDay', day: '2026-09-29', points: 10 },
    ]);
  });

  test('the same points as last week; equal gaming says nothing', () => {
    const w = weeks({ '2026-09-30': [35, 20], '2026-09-17': [35, 20] });
    expect(statsFacts(w, [], 0.1).map((f) => f.kind)).toEqual(['sameAsLastWeek', 'weekMoney', 'bestDay']);
  });

  test('nothing this week, something last week: only the comparison', () => {
    expect(statsFacts(weeks({ '2026-09-20': [20, 0] }), [], 0.1)).toEqual([{ kind: 'moreLastWeek', diff: 20 }]);
  });

  test('money at the account rate, rounded to grosze', () => {
    const w = weeks({ '2026-09-30': [7, 0] });
    expect(statsFacts(w, [], 0.45)).toContainEqual({ kind: 'weekMoney', grosze: 315 });
  });
});

describe('best day', () => {
  test('none when the week has no points', () => {
    expect(bestDay(statsWeeks(logs({ '2026-09-30': [0, 120] }), TODAY).thisWeek)).toBeNull();
  });
});
