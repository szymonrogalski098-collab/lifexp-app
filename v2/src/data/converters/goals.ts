// users/{uid}.goals → Goal, and the maps v1 writes (dashboard.js saveGoal; docs/v2/
// INVENTORY.md: 3 goals, amount and saved as int, saved missing on 1). A money goal's
// amount and saved are złoty, a points goal's amount is points.
import type { DocumentData } from 'firebase/firestore';
import type { Goal, GoalType } from '@/domain/goals';
import { groszeFromZloty, zlotyFromGrosze } from '@/lib/money';
import { numberOr, stringOr } from './fields';

/** v1 treats anything that is not 'money' as a points goal (goalCardHTML). */
function typeOf(value: unknown): GoalType {
  return value === 'money' ? 'money' : 'points';
}

/** Entries without an id cannot be edited by v1 either; they are left out. */
export function goalsFromData(value: unknown): Goal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): Goal[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const g = entry as Record<string, unknown>;
    if (typeof g.id !== 'string' || g.id === '') return [];
    const type = typeOf(g.type);
    const amount = numberOr(g.amount);
    return [
      {
        id: g.id,
        name: stringOr(g.name),
        type,
        target: type === 'money' ? groszeFromZloty(amount) : amount,
        saved: groszeFromZloty(numberOr(g.saved)),
        celebrated: g.celebrated === true,
      },
    ];
  });
}

/** A goal's amount as v1 stores it: złoty for money, points for points. */
export function goalAmountData(type: GoalType, target: number): number {
  return type === 'money' ? zlotyFromGrosze(target) : target;
}

/** v1 saveGoal(): a new goal, nothing put aside, not celebrated. */
export function newGoalData(goal: { id: string; name: string; type: GoalType; target: number }): DocumentData {
  return {
    id: goal.id,
    name: goal.name,
    type: goal.type,
    amount: goalAmountData(goal.type, goal.target),
    celebrated: false,
    saved: 0,
  };
}
