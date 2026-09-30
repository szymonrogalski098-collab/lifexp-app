import { describe, expect, test } from 'vitest';
import { choresRate, todayChores, unpaidChores, type ChoreDef, type ChoreEntry } from './chores';

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
