import { describe, expect, test } from 'vitest';
import {
  canAddGoal,
  depositFits,
  goalProblem,
  goalProgress,
  goalsToCelebrate,
  newGoalId,
  refundOnDelete,
  savedInGoals,
  type Goal,
} from './goals';

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'SSD',
  type: 'money',
  target: 30000,
  saved: 0,
  celebrated: false,
  ...patch,
});

describe('G7 goals (v1 dashboard.js)', () => {
  test('G7.5: a points goal counts the spendable points; a money goal what was put aside', () => {
    expect(goalProgress(goal({ type: 'points', target: 500 }), 120)).toEqual({
      current: 120,
      missing: 380,
      share: 0.24,
      reached: false,
    });
    expect(goalProgress(goal({ saved: 7500 }), 999999)).toEqual({ current: 7500, missing: 22500, share: 0.25, reached: false });
    expect(goalProgress(goal({ saved: 31000 }), 0)).toMatchObject({ missing: 0, share: 1, reached: true });
  });

  test('G7.1: at most three goals', () => {
    expect(canAddGoal([goal(), goal()])).toBe(true);
    expect(canAddGoal([goal(), goal(), goal()])).toBe(false);
  });

  test('G7.2/G7.3: a deposit fits the balance; deleting gives back what was put aside', () => {
    expect(depositFits(5000, 5000)).toBe(true);
    expect(depositFits(5000, 5001)).toBe(false);
    expect(depositFits(5000, 0)).toBe(false);
    expect(refundOnDelete(goal({ saved: 1250 }))).toBe(1250);
    expect(refundOnDelete(goal({ type: 'points', saved: 99 }))).toBe(0);
    expect(savedInGoals([goal({ saved: 1250 }), goal({ type: 'points', saved: 99 }), goal({ saved: 10 })])).toBe(1260);
  });

  test('G7.6: reached and not yet celebrated', () => {
    const goals = [
      goal({ id: 'a', type: 'points', target: 100 }),
      goal({ id: 'b', type: 'points', target: 100, celebrated: true }),
      goal({ id: 'c', saved: 30000 }),
      goal({ id: 'd', saved: 100 }),
    ];
    expect(goalsToCelebrate(goals, 150).map((g) => g.id)).toEqual(['a', 'c']);
  });

  test('a name and an amount above zero; v1 stops at 10 000 000', () => {
    expect(goalProblem({ type: 'money', name: 'Rower', target: 150000 })).toBeNull();
    expect(goalProblem({ type: 'money', name: ' ', target: 150000 })).toBe('nameRequired');
    expect(goalProblem({ type: 'points', name: 'X', target: null })).toBe('targetRequired');
    expect(goalProblem({ type: 'points', name: 'X', target: 10_000_001 })).toBe('targetTooLarge');
    expect(goalProblem({ type: 'money', name: 'X', target: 1_000_000_000 })).toBeNull();
    expect(goalProblem({ type: 'money', name: 'X', target: 1_000_000_001 })).toBe('targetTooLarge');
  });

  test("ids look like v1's", () => {
    expect(newGoalId(1790000000000, () => 0.123456789)).toBe('mubbs7i8' + (0.123456789).toString(36).slice(2, 6));
    expect(newGoalId()).toMatch(/^[0-9a-z]{9,14}$/);
  });
});
