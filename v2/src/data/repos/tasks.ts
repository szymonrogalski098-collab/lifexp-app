// users/{uid}/todos and users/{uid}.pcBuild (docs/v2/PLAN.md 9, stage 3a; GOLDEN G9).
// A change that touches only a task is one write, queued offline like any other.
// A change that moves the PC build reads the build and the task again inside a
// transaction: two tabs or devices cannot both add the same pieces or apply the
// same penalty twice (v1 reads and writes them separately). Transactions need
// the server, so these fail offline and are simply tried again later.
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import {
  addPieces,
  applyPenalty,
  completionPieces,
  isOverdue,
  makePcBuild,
  pcBuildOrNull,
  type PcBuild,
  type Task,
  type TaskDraft,
} from '@/domain/tasks';
import { newTaskData, taskEditData, taskFromData } from '../converters/tasks';
import { db } from '../firebase';

type OnError = (error: unknown) => void;

const tasksOf = (uid: string) => collection(db, 'users', uid, 'todos');
const userOf = (uid: string) => doc(db, 'users', uid);

/** Every task, newest first (v1's query). */
export function watchTasks(uid: string, onChange: (tasks: Task[]) => void, onError: OnError) {
  return onSnapshot(
    query(tasksOf(uid), orderBy('createdAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => taskFromData(d.id, d.data()))),
    onError,
  );
}

export function newTaskId(uid: string): string {
  return doc(tasksOf(uid)).id;
}

/** A task when the account already has a build: one write. */
export function addTask(uid: string, id: string, draft: TaskDraft, now: Date): Promise<void> {
  return setDoc(doc(tasksOf(uid), id), newTaskData(draft, now));
}

/** v1 ensurePcBuild() + the first task: the build's order is drawn once, in the same transaction. */
export function addFirstTask(uid: string, id: string, draft: TaskDraft, now: Date): Promise<void> {
  return runTransaction(db, async (tx) => {
    const user = await tx.get(userOf(uid));
    if (!pcBuildOrNull(user.data()?.pcBuild)) tx.update(userOf(uid), { pcBuild: makePcBuild() });
    tx.set(doc(tasksOf(uid), id), newTaskData(draft, now));
  });
}

export function editTask(uid: string, id: string, draft: TaskDraft): Promise<void> {
  return updateDoc(doc(tasksOf(uid), id), taskEditData(draft));
}

/** New in v2 (v1 has no delete): the task goes, the build stays as it is. */
export function removeTask(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(tasksOf(uid), id));
}

/**
 * v1 markTodoDone(): done is final; in time adds the size's pieces to the build
 * (creating it if needed). Returns the pieces added; 0 when late or already done.
 */
export function completeTask(uid: string, id: string, today: string): Promise<number> {
  return runTransaction(db, async (tx) => {
    const taskRef = doc(tasksOf(uid), id);
    const [taskSnap, user] = [await tx.get(taskRef), await tx.get(userOf(uid))];
    if (!taskSnap.exists()) return 0;
    const task = taskFromData(taskSnap.id, taskSnap.data());
    if (task.done) return 0;
    tx.update(taskRef, { done: true });
    const pieces = completionPieces(task, today);
    if (pieces > 0) {
      const build: PcBuild = pcBuildOrNull(user.data()?.pcBuild) ?? makePcBuild();
      tx.update(userOf(uid), { pcBuild: addPieces(build, pieces) });
    }
    return pieces;
  });
}

/**
 * v1 applyOverduePenalties(): one piece off the build per overdue task, once per
 * task (penaltyApplied is set even when there was nothing to take, G9.5). The
 * candidates are re-read, so a penalty another tab already applied is skipped.
 * Returns how many tasks were penalised.
 */
export function penaliseOverdue(uid: string, candidateIds: readonly string[], today: string): Promise<number> {
  return runTransaction(db, async (tx) => {
    const user = await tx.get(userOf(uid));
    const snaps = [];
    for (const id of candidateIds) snaps.push(await tx.get(doc(tasksOf(uid), id)));
    const due = snaps
      .filter((s) => s.exists())
      .map((s) => taskFromData(s.id, s.data() ?? {}))
      .filter((t) => isOverdue(t, today) && !t.penaltyApplied);
    if (due.length === 0) return 0;

    let build = pcBuildOrNull(user.data()?.pcBuild);
    for (const task of due) {
      if (build) build = applyPenalty(build);
      tx.update(doc(tasksOf(uid), task.id), { penaltyApplied: true });
    }
    if (build) tx.update(userOf(uid), { pcBuild: build });
    return due.length;
  });
}

/** Undo of a delete: the same document back under the same id. */
export function restoreTask(uid: string, task: Task): Promise<void> {
  return setDoc(doc(tasksOf(uid), task.id), {
    text: task.text,
    dueDate: task.dueDate ?? '',
    size: task.size,
    done: task.done,
    createdAt: (task.createdAt ?? new Date()).toISOString(),
    penaltyApplied: task.penaltyApplied,
  });
}
