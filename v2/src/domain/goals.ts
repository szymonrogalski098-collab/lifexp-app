// Goals (v1 dashboard.js:49-250; docs/v2/GOLDEN.md G7): up to three, each either a
// points goal (progress = the spendable points, G7.5) or a money goal (progress =
// what was put aside on it, taken from the Money balance, G7.2). Money amounts are
// grosze here; the converter writes v1's złoty.

/** v1: "Możesz mieć maksymalnie 3 cele." */
export const GOALS_MAX = 3;
/** v1's goal name field (maxlength="50"). */
export const GOAL_NAME_MAX = 50;
/** v1's amount field (max="10000000"): 10 000 000 zł or points. */
export const GOAL_TARGET_MAX_ZLOTY = 10_000_000;

export type GoalType = 'points' | 'money';

/** One entry of users/{uid}.goals. */
export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  /** Points for a points goal, grosze for a money goal. */
  target: number;
  /** Grosze put aside (money goals; 0 for points goals and old goals without it). */
  saved: number;
  /** Set once the goal was reached and celebrated. */
  celebrated: boolean;
}

export interface GoalProgress {
  /** In the goal's unit (points or grosze). */
  current: number;
  missing: number;
  /** 0 … 1. */
  share: number;
  reached: boolean;
}

/** v1 goalCardHTML(): a points goal counts the spendable points, a money goal what was put aside. */
export function goalProgress(goal: Goal, pointsTotal: number): GoalProgress {
  const current = goal.type === 'money' ? goal.saved : pointsTotal;
  return {
    current,
    missing: Math.max(0, goal.target - current),
    share: goal.target > 0 ? Math.min(1, current / goal.target) : 1,
    reached: current >= goal.target,
  };
}

/** v1 updateMoneyBalanceUI(): "W celach" = everything put aside in money goals. */
export function savedInGoals(goals: readonly Goal[]): number {
  return goals.reduce((sum, g) => (g.type === 'money' ? sum + g.saved : sum), 0);
}

/** Reached and not celebrated yet (v1 marks them while rendering, B15; v2 through a service). */
export function goalsToCelebrate(goals: readonly Goal[], pointsTotal: number): Goal[] {
  return goals.filter((g) => !g.celebrated && goalProgress(g, pointsTotal).reached);
}

export function canAddGoal(goals: readonly Goal[]): boolean {
  return goals.length < GOALS_MAX;
}

/** v1 newGoalId(): time in base 36 and four random characters. */
export function newGoalId(now: number = Date.now(), random: () => number = Math.random): string {
  return now.toString(36) + random().toString(36).slice(2, 6);
}

// ── The form (v1 saveGoal) ──

export interface GoalDraft {
  type: GoalType;
  name: string;
  /** Points or grosze, by type; null = empty. */
  target: number | null;
}

export type GoalProblem = 'nameRequired' | 'targetRequired' | 'targetTooLarge' | 'limit';

/** v1 saveGoal(): a name (trimmed) and an amount above zero; v1's field stops at 10 000 000. */
export function goalProblem(draft: GoalDraft): GoalProblem | null {
  if (!draft.name.trim()) return 'nameRequired';
  if (draft.target === null || draft.target <= 0) return 'targetRequired';
  const max = draft.type === 'money' ? GOAL_TARGET_MAX_ZLOTY * 100 : GOAL_TARGET_MAX_ZLOTY;
  if (draft.target > max) return 'targetTooLarge';
  return null;
}

// ── Money (G7.2, G7.3) ──

/** G7.2: a deposit comes out of the balance, never more than there is. */
export function depositFits(balance: number, grosze: number): boolean {
  return grosze > 0 && grosze <= balance;
}

/** G7.3: deleting a money goal gives back what was put aside. */
export function refundOnDelete(goal: Goal): number {
  return goal.type === 'money' ? goal.saved : 0;
}
