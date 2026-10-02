import { describe, expect, test } from 'vitest';
import {
  ACTIVITY_SEEDS,
  activityProblem,
  creditActivity,
  earnedPoints,
  revertActivity,
  sortActivityDefs,
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
      { id: 'b', name: 'B', points: 10, order: 1 },
      { id: 'z', name: 'Z', points: 10, order: 0 },
      { id: 'a', name: 'A', points: 10, order: 1 },
    ];
    expect(sortActivityDefs(defs).map((d) => d.id)).toEqual(['z', 'a', 'b']);
  });
});
