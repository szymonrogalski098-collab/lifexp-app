import { describe, expect, test } from 'vitest';
import {
  ACTIVITY_SEEDS,
  generatorPool,
  pickActivity,
  activityProblem,
  creditActivity,
  earnedPoints,
  revertActivity,
  sortActivityDefs,
  activityDefDraft,
  activityDefProblem,
  editedActivityDef,
  nextActivityOrder,
} from './activity';

describe('G1 points for an activity and the daily limit', () => {
  test.each([
    ['G1.1', 60, 40, 0, 150, 40, 40],
    ['G1.2', 60, 40, 130, 150, 40, 20],
    ['G1.3', 45, 35, 0, 150, 26, 26],
    ['G1.4', 30, 35, 0, 150, 18, 18],
    ['G1.5', 50, 25, 0, 150, 21, 21],
    ['G1.6', 5, 40, 0, 150, 3, 3],
    ['G1.8', 60, 40, 150, 150, 40, 0],
  ])('%s: %i min at %i pts/h with %i of %i today → earned %i, credited %i', (_c, min, pph, today, limit, earned, points) => {
    expect(creditActivity(min, pph, today, limit)).toEqual({ earned, points, limit });
  });

  test('no limit on the profile (or 0) means 150, as v1', () => {
    expect(creditActivity(60, 40, 130, null).points).toBe(20);
    expect(creditActivity(60, 40, 130, 0).limit).toBe(150);
  });

  test('over the limit already (a limit lowered later) credits nothing, never less', () => {
    expect(creditActivity(60, 40, 200, 150).points).toBe(0);
  });

  test('17,5 rounds up, as Math.round', () => {
    expect(earnedPoints(30, 35)).toBe(18);
  });

  test('G1.7 and the type: v1 checks the type first, then at least 5 minutes', () => {
    expect(activityProblem({ type: null, minutes: 4, desc: '' })).toBe('typeRequired');
    expect(activityProblem({ type: 'learning', minutes: 4, desc: '' })).toBe('minMinutes');
    expect(activityProblem({ type: 'learning', minutes: null, desc: '' })).toBe('minMinutes');
    expect(activityProblem({ type: 'learning', minutes: 5, desc: '' })).toBeNull();
  });
});

describe('G11 deleting an activity', () => {
  test('its points come off the day, the balance and the all-time sum', () => {
    expect(revertActivity(40, { dayPoints: 100, total: 300, earnedAllTime: 900 })).toEqual({
      dayPoints: 60,
      total: 260,
      earnedAllTime: 860,
    });
  });

  test('nothing goes below zero (points already spent)', () => {
    expect(revertActivity(40, { dayPoints: 10, total: 25, earnedAllTime: 30 })).toEqual({
      dayPoints: 0,
      total: 0,
      earnedAllTime: 0,
    });
  });

  test('a day without a log stays without one', () => {
    expect(revertActivity(40, { dayPoints: null, total: 100, earnedAllTime: 100 }).dayPoints).toBeNull();
  });
});

describe('activity definitions', () => {
  test('the seed keeps v1 ids and order', () => {
    expect(ACTIVITY_SEEDS.map((d) => d.id)).toEqual(['learning', 'project', 'reading', 'exercise', 'school']);
  });

  test('sorted by order, then by name', () => {
    const defs = [
      { id: 'b', name: 'B', points: 10, order: 1, icon: null, color: null },
      { id: 'z', name: 'Z', points: 10, order: 0, icon: null, color: null },
      { id: 'a', name: 'A', points: 10, order: 1, icon: null, color: null },
    ];
    expect(sortActivityDefs(defs).map((d) => d.id)).toEqual(['z', 'a', 'b']);
  });
});

describe('"Co teraz?" (v1 generator)', () => {
  const pool = generatorPool(
    [
      { name: 'Czytanie', points: 35 },
      { name: 'Spacer', points: 20 },
    ],
    [{ id: 'learning', name: 'Nauka', points: 40, order: 0, icon: null, color: null }],
  );

  test("the pool's own activities, then the person's definitions", () => {
    expect(pool).toEqual([
      { name: 'Czytanie', points: 35, defId: null },
      { name: 'Spacer', points: 20, defId: null },
      { name: 'Nauka', points: 40, defId: 'learning' },
    ]);
  });

  test('each entry as likely as any other', () => {
    expect(pickActivity(pool, () => 0)?.name).toBe('Czytanie');
    expect(pickActivity(pool, () => 0.5)?.name).toBe('Spacer');
    expect(pickActivity(pool, () => 0.9999)?.name).toBe('Nauka');
    expect(pickActivity([], () => 0)).toBeNull();
  });
});

describe('activity types (v1 Settings → Aktywności)', () => {
  const def = { id: 'gitara', name: 'Gitara', points: 30, order: 4, icon: null, color: null };

  test('a name and whole points from 1 to 10 000', () => {
    const ok = { name: ' Gitara ', points: 30, icon: 'ti-music', color: '#ff6b6b' };
    expect(activityDefProblem(ok)).toBeNull();
    expect(activityDefProblem({ ...ok, name: '  ' })).toBe('nameRequired');
    expect(activityDefProblem({ ...ok, points: null })).toBe('pointsRequired');
    expect(activityDefProblem({ ...ok, points: 0 })).toBe('pointsRequired');
    expect(activityDefProblem({ ...ok, points: 10_001 })).toBe('pointsTooMany');
  });

  test("a new type goes after the last one (v1), a type without order counting as 0", () => {
    expect(nextActivityOrder([])).toBe(0);
    expect(nextActivityOrder([def, { ...def, order: 1 }])).toBe(5);
    expect(nextActivityOrder([{ ...def, order: Number.MAX_SAFE_INTEGER }])).toBe(1);
  });

  test("a type without icon or colour starts from v1's defaults; editing keeps id and order", () => {
    expect(activityDefDraft(def)).toEqual({ name: 'Gitara', points: 30, icon: 'ti-book', color: '#6c63ff' });
    expect(editedActivityDef(def, { name: ' Gitara elektryczna ', points: 45, icon: 'ti-music', color: '#ff6b6b' })).toEqual({
      id: 'gitara',
      name: 'Gitara elektryczna',
      points: 45,
      order: 4,
      icon: 'ti-music',
      color: '#ff6b6b',
    });
  });
});
