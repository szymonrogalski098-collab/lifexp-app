import { describe, expect, test } from 'vitest';
import { choresCardRows, choresOnCard, type ChoreDef, type ChoreEntry } from './chores';

const def = (id: string, order: number, oneTime = false): ChoreDef => ({
  id,
  name: id,
  desc: '',
  emoji: '',
  points: 10,
  oneTime,
  order,
});
const DEFS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => def(id, i));
const random = { mode: 'random' as const, ids: [] };

describe("Today's chore card", () => {
  test('a random day shows 3 or 4 repeating chores, in v1 order, the same all day', () => {
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) {
      const seed = `uid-1:${day}`;
      const shown = choresOnCard(DEFS, random, seed);
      expect(shown.length === 3 || shown.length === 4).toBe(true);
      expect(shown.map((d) => d.order)).toEqual([...shown.map((d) => d.order)].sort((x, y) => x - y));
      expect(choresOnCard(DEFS, random, seed)).toEqual(shown);
    }
  });

  test('another day or another account draws differently', () => {
    const draws = new Set(
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((day) =>
        choresOnCard(DEFS, random, `uid-1:${day}`)
          .map((d) => d.id)
          .join(),
      ),
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  test('one-time chores are not drawn; fewer chores than the draw shows them all', () => {
    const defs = [def('a', 0), def('once', 1, true), def('b', 2)];
    expect(choresOnCard(defs, random, 'uid:2026-10-02').map((d) => d.id)).toEqual(['a', 'b']);
  });

  test('removing a chore that was not drawn changes nothing', () => {
    const seed = 'uid-1:2026-10-02';
    const shown = choresOnCard(DEFS, random, seed).map((d) => d.id);
    const other = DEFS.find((d) => !shown.includes(d.id));
    const without = DEFS.filter((d) => d !== other);
    expect(choresOnCard(without, random, seed).map((d) => d.id)).toEqual(shown);
  });

  test('chosen chores every day, in v1 order; ids of deleted chores are skipped', () => {
    const chosen = { mode: 'chosen' as const, ids: ['f', 'b', 'gone'] };
    expect(choresOnCard(DEFS, chosen, 'any').map((d) => d.id)).toEqual(['b', 'f']);
  });

  test('rows: done today on the card, and a picked one-time chore after it was logged', () => {
    const entry = (choreId: string, dateISO: string): ChoreEntry => ({
      id: `${choreId}-${dateISO}`,
      choreId,
      name: choreId === 'once' ? 'Okna' : choreId,
      emoji: '',
      points: 20,
      dateISO,
      monthKey: dateISO.slice(0, 7),
      createdAt: null,
    });
    const chosen = { mode: 'chosen' as const, ids: ['b', 'once'] };
    const entries = [entry('b', '2026-10-02'), entry('b', '2026-10-01'), entry('once', '2026-10-02'), entry('c', '2026-10-02')];
    const rows = choresCardRows(DEFS, entries, '2026-10-02', chosen, 'any');
    expect(rows.map((r) => [r.choreId, r.doneToday])).toEqual([
      ['b', 1],
      ['once', 1],
    ]);
  });
});
