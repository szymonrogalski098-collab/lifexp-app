// Goal use cases (docs/v2/PLAN.md 9, stage 3d; GOLDEN G7): the rules of domain/goals,
// then the repository's transaction. They read and write the goals array (and for
// money the balance), so they are awaited and need the server; offline they fail
// and change nothing.
import { addGoal, celebrateGoals, deleteGoal, depositToGoal, editGoal, type GoalOutcome } from '@/data/repos/goals';
import {
  canAddGoal,
  goalProblem,
  goalsToCelebrate,
  newGoalId,
  type Goal,
  type GoalDraft,
  type GoalProblem,
} from '@/domain/goals';

export type GoalSaveResult = { ok: true } | { ok: false; problem: GoalProblem | 'notEnoughBalance' };

const outcome = (result: GoalOutcome): GoalSaveResult => result;

/** v1 saveGoal(): a new goal, or a new name and amount for an existing one (its type stays). */
export async function saveGoal(uid: string, draft: GoalDraft, goals: readonly Goal[], editing: Goal | null): Promise<GoalSaveResult> {
  const problem = goalProblem(draft);
  if (problem) return { ok: false, problem };
  const name = draft.name.trim();
  const target = draft.target ?? 0;
  if (editing) return outcome(await editGoal(uid, editing.id, { name, target }));
  if (!canAddGoal(goals)) return { ok: false, problem: 'limit' };
  return outcome(await addGoal(uid, { id: newGoalId(), name, type: draft.type, target }));
}

/** G7.2: grosze from the Money balance onto a money goal. */
export async function depositGoal(uid: string, goal: Goal, grosze: number | null): Promise<GoalSaveResult> {
  if (grosze === null || grosze <= 0) return { ok: false, problem: 'targetRequired' };
  return outcome(await depositToGoal(uid, goal.id, grosze));
}

/** G7.3: what was put aside goes back to the balance. */
export function removeGoal(uid: string, goal: Goal): Promise<GoalOutcome> {
  return deleteGoal(uid, goal.id);
}

/** G7.6: the goals reached since last time, marked once; resolves to the ones marked. */
export async function celebrateReached(uid: string, goals: readonly Goal[], pointsTotal: number): Promise<Goal[]> {
  const due = goalsToCelebrate(goals, pointsTotal);
  if (due.length === 0) return [];
  const marked = await celebrateGoals(
    uid,
    due.map((g) => g.id),
  );
  return due.filter((g) => marked.includes(g.id));
}
