import { describe, expect, test } from 'vitest';
import {
  calendarMonth,
  choresRate,
  dayEntries,
  entryDay,
  monthEarnings,
  monthKeys,
  pointsByDay,
  todayChores,
  unpaidChores,
  type ChoreDef,
  type ChoreEntry,
} from './chores';

const TODAY = '2026-09-30';

const def = (id: string, order: number, points = 10): ChoreDef => ({
  id,
  name: id,
  emoji: '🧹',
  points,
  oneTime: false,
  order,
});

let n = 0;
const entry = (choreId: string, dateISO: string, points = 10): ChoreEntry => ({
  id: `e${(n += 1)}`,
  choreId,
  name: `${choreId} (wpis)`,
  emoji: '🧽',
  points,
  dateISO,
  monthKey: dateISO.slice(0, 7),
  createdAt: new Date(`${dateISO}T10:00:00`),
});

describe('G8 payout amount (v1 renderOutstanding)', () => {
  test('G8.5: 10 + 30 points at the default 0,45 zł = 18,00 zł', () => {
    expect(unpaidChores([entry('a', TODAY, 10), entry('b', '2026-08-01', 30)], choresRate(null, null))).toEqual({
      points: 40,
      grosze: 1800,
    });
  });

  test('G8.6: 7 points = 3,15 zł', () => {
    expect(unpaidChores([entry('a', TODAY, 7)], 0.45).grosze).toBe(315);
  });

  test('G8.7: the current rate applies to every entry', () => {
    expect(unpaidChores([entry('a', TODAY, 10), entry('b', TODAY, 10)], choresRate(1, 2)).grosze).toBe(1000);
  });

  test('a custom rate needs both fields, as in v1', () => {
    expect(choresRate(0.5, null)).toBe(0.45);
    expect(choresRate(0.9, 1)).toBe(0.9);
  });

  test('nothing logged', () => {
    expect(unpaidChores([], 0.45)).toEqual({ points: 0, grosze: 0 });
  });
});

describe("today's chores", () => {
  test('definitions in v1 order, each with how often it was done today (local day)', () => {
    const rows = todayChores(
      [def('b', 2), def('a', 1), def('c', 3)],
      [entry('a', TODAY), entry('a', TODAY), entry('c', '2026-09-29')],
      TODAY,
    );
    expect(rows.map((r) => [r.choreId, r.doneToday])).toEqual([
      ['a', 2],
      ['b', 0],
      ['c', 0],
    ]);
    expect(rows[0]).toMatchObject({ name: 'a', emoji: '🧹', points: 10 });
  });

  test('done today under a definition that is gone (one-time, deleted): shown from the entry', () => {
    const rows = todayChores([def('a', 1)], [entry('gone', TODAY, 25), entry('gone', TODAY, 25)], TODAY);
    expect(rows[1]).toEqual({ choreId: 'gone', name: 'gone (wpis)', emoji: '🧽', points: 25, doneToday: 2 });
  });

  test('an old entry of a deleted definition does not come back', () => {
    expect(todayChores([], [entry('gone', '2026-09-01')], TODAY)).toEqual([]);
  });
});

describe('G8.2/G8.3 today or yesterday (v1 addChore)', () => {
  const YESTERDAY = '2026-09-29';

  test('first time today → today, no question', () => {
    expect(entryDay('a', [], TODAY, YESTERDAY)).toBe('today');
  });

  test('G8.2: already today, not yet yesterday, same month → ask', () => {
    expect(entryDay('a', [entry('a', TODAY)], TODAY, YESTERDAY)).toBe('ask');
  });

  test('already today and yesterday → today, no question', () => {
    expect(entryDay('a', [entry('a', TODAY), entry('a', YESTERDAY)], TODAY, YESTERDAY)).toBe('today');
  });

  test('G8.3: yesterday was last month → today, no question', () => {
    expect(entryDay('a', [entry('a', '2026-10-01')], '2026-10-01', '2026-09-30')).toBe('today');
  });

  test('another chore today does not count', () => {
    expect(entryDay('a', [entry('b', TODAY)], TODAY, YESTERDAY)).toBe('today');
  });
});

describe('months and calendar (v1 renderChores, renderCalendar)', () => {
  test('this month and the one before, across a year', () => {
    expect(monthKeys('2026-09-30')).toEqual({ cur: '2026-09', prev: '2026-08' });
    expect(monthKeys('2027-01-15')).toEqual({ cur: '2027-01', prev: '2026-12' });
  });

  test('September 2026 starts on a Tuesday (one blank, Monday first) and has 30 days', () => {
    const m = calendarMonth('2026-09');
    expect(m.leadingBlanks).toBe(1);
    expect(m.days).toHaveLength(30);
    expect(m.days[0]).toBe('2026-09-01');
    expect(calendarMonth('2028-02').days).toHaveLength(29);
    expect(calendarMonth('2026-11').leadingBlanks).toBe(6); // a Sunday
  });

  test('month earnings count only that month, at the current rate', () => {
    const entries = [entry('a', '2026-09-02', 10), entry('b', '2026-09-30', 20), entry('c', '2026-08-31', 40)];
    expect(monthEarnings(entries, '2026-09', 0.45)).toEqual({ points: 30, grosze: 1350 });
  });

  test('points per day and a day in logging order', () => {
    const first = { ...entry('a', TODAY, 5), createdAt: new Date('2026-09-30T08:00:00') };
    const second = { ...entry('b', TODAY, 7), createdAt: new Date('2026-09-30T09:00:00') };
    expect(pointsByDay([second, first, entry('c', '2026-09-01', 3)]).get(TODAY)).toBe(12);
    expect(dayEntries([second, first], TODAY).map((e) => e.choreId)).toEqual(['a', 'b']);
  });
});
