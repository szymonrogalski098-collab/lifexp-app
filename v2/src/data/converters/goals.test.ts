import { describe, expect, test } from 'vitest';
import { goalsFromData, newGoalData } from './goals';

describe('goal converters', () => {
  test('goals as v1 stores them, money in złoty', () => {
    expect(
      goalsFromData([
        { id: 'a', name: 'Rower', type: 'money', amount: 1500, saved: 120.5, celebrated: false },
        { id: 'b', name: 'Level', type: 'points', amount: 800, celebrated: true },
        { id: 'c', name: 'Old', type: 'money', amount: 50 },
      ]),
    ).toEqual([
      { id: 'a', name: 'Rower', type: 'money', target: 150000, saved: 12050, celebrated: false },
      { id: 'b', name: 'Level', type: 'points', target: 800, saved: 0, celebrated: true },
      { id: 'c', name: 'Old', type: 'money', target: 5000, saved: 0, celebrated: false },
    ]);
  });

  test('odd entries: no id is skipped, an unknown type is a points goal (as v1 shows it)', () => {
    expect(goalsFromData('x')).toEqual([]);
    expect(goalsFromData([null, { name: 'no id' }, { id: 'd', type: 'other', amount: 3 }])).toEqual([
      { id: 'd', name: '', type: 'points', target: 3, saved: 0, celebrated: false },
    ]);
  });

  test("a new goal is written in v1's shape", () => {
    expect(newGoalData({ id: 'x1', name: 'SSD', type: 'money', target: 29999 })).toEqual({
      id: 'x1',
      name: 'SSD',
      type: 'money',
      amount: 299.99,
      celebrated: false,
      saved: 0,
    });
    expect(newGoalData({ id: 'x2', name: 'XP', type: 'points', target: 500 }).amount).toBe(500);
  });
});
