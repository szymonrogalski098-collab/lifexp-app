// users/{uid}.goals (docs/v2/PLAN.md 9, stage 3d; GOLDEN G7). The array is read and
// written inside a transaction, so two tabs cannot lose each other's change (v1
// writes the whole array from what it loaded earlier). Each entry is changed in place,
// keeping any field v1 or its backend added. Deposits and refunds move the Money
// balance in the same transaction. Needs the server.
import { doc, runTransaction, type DocumentData } from 'firebase/firestore';
import { GOALS_MAX, depositFits, goalProgress, refundOnDelete, type GoalType } from '@/domain/goals';
import { groszeFromZloty, zlotyFromGrosze } from '@/lib/money';
import { goalAmountData, goalsFromData, newGoalData } from '../converters/goals';
import { numberOr } from '../converters/fields';
import { db } from '../firebase';
import { balanceIn, moneyDoc, writeBalance } from './balance';

const userOf = (uid: string) => doc(db, 'users', uid);

/** The raw goal maps, copied so they can be changed and written back. */
function rawGoals(data: DocumentData | undefined): DocumentData[] {
  const goals: unknown = data?.goals;
  return Array.isArray(goals) ? goals.map((g) => (typeof g === 'object' && g !== null ? { ...g } : g)) : [];
}

const indexOf = (goals: DocumentData[], id: string) => goals.findIndex((g) => g?.id === id);

export type GoalOutcome = { ok: true } | { ok: false; problem: 'limit' | 'notEnoughBalance' };

/** G7.1: a new goal at the end, at most three (checked against the server's list). */
export function addGoal(uid: string, goal: { id: string; name: string; type: GoalType; target: number }): Promise<GoalOutcome> {
  return runTransaction(db, async (tx): Promise<GoalOutcome> => {
    const user = await tx.get(userOf(uid));
    const goals = rawGoals(user.data());
    if (goals.length >= GOALS_MAX) return { ok: false, problem: 'limit' };
    tx.update(userOf(uid), { goals: [...goals, newGoalData(goal)] });
    return { ok: true };
  });
}

/** v1 saveGoal() editing: name and amount, and the goal is celebrated anew when reached. */
export function editGoal(uid: string, id: string, change: { name: string; target: number }): Promise<GoalOutcome> {
  return runTransaction(db, async (tx): Promise<GoalOutcome> => {
    const user = await tx.get(userOf(uid));
    const goals = rawGoals(user.data());
    const i = indexOf(goals, id);
    if (i < 0) return { ok: true };
    const type: GoalType = goals[i]?.type === 'money' ? 'money' : 'points';
    goals[i] = { ...goals[i], name: change.name, amount: goalAmountData(type, change.target), celebrated: false };
    tx.update(userOf(uid), { goals });
    return { ok: true };
  });
}

/** G7.2: out of the balance (never below zero) and onto the goal. */
export function depositToGoal(uid: string, id: string, grosze: number): Promise<GoalOutcome> {
  return runTransaction(db, async (tx): Promise<GoalOutcome> => {
    const user = await tx.get(userOf(uid));
    const balanceRef = moneyDoc(uid, 'balance');
    const balance = await tx.get(balanceRef);
    const goals = rawGoals(user.data());
    const i = indexOf(goals, id);
    if (i < 0 || goals[i]?.type !== 'money') return { ok: true };
    const current = balanceIn(balance);
    if (!depositFits(current, grosze)) return { ok: false, problem: 'notEnoughBalance' };
    const saved = groszeFromZloty(numberOr(goals[i]?.saved));
    goals[i] = { ...goals[i], saved: zlotyFromGrosze(saved + grosze) };
    tx.update(userOf(uid), { goals });
    writeBalance(tx, balanceRef, balance, current - grosze);
    return { ok: true };
  });
}

/** G7.3: the goal goes, and what was put aside on it comes back to the balance. */
export function deleteGoal(uid: string, id: string): Promise<GoalOutcome> {
  return runTransaction(db, async (tx): Promise<GoalOutcome> => {
    const user = await tx.get(userOf(uid));
    const balanceRef = moneyDoc(uid, 'balance');
    const balance = await tx.get(balanceRef);
    const goals = rawGoals(user.data());
    const i = indexOf(goals, id);
    if (i < 0) return { ok: true };
    const [goal] = goalsFromData([goals[i]]);
    const refund = goal ? refundOnDelete(goal) : 0;
    tx.update(userOf(uid), { goals: goals.filter((_, j) => j !== i) });
    if (refund > 0) writeBalance(tx, balanceRef, balance, balanceIn(balance) + refund);
    return { ok: true };
  });
}

/**
 * G7.6: marks the given goals celebrated if they are still reached on the server's
 * data and not celebrated yet. Resolves to the ids it marked, so each goal is
 * celebrated once even with two tabs open.
 */
export function celebrateGoals(uid: string, ids: readonly string[]): Promise<string[]> {
  return runTransaction(db, async (tx) => {
    const user = await tx.get(userOf(uid));
    const data = user.data();
    const goals = rawGoals(data);
    const pointsTotal = numberOr(data?.points?.total);
    const marked: string[] = [];
    goals.forEach((raw, i) => {
      if (!ids.includes(raw?.id)) return;
      const [goal] = goalsFromData([raw]);
      if (!goal || goal.celebrated || !goalProgress(goal, pointsTotal).reached) return;
      goals[i] = { ...raw, celebrated: true };
      marked.push(goal.id);
    });
    if (marked.length > 0) tx.update(userOf(uid), { goals });
    return marked;
  });
}
