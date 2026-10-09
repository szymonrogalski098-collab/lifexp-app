// Task use cases (docs/v2/PLAN.md 9, stage 3a; GOLDEN G9): the rules of
// domain/tasks, then the repository's write. Writes that touch only a task return
// at once with a `saved` promise (queued offline); those that move the PC build
// run as transactions and are awaited (they need the server).
import {
  addFirstTask,
  addTask,
  completeTask as completeInStore,
  editTask,
  newTaskId,
  penaliseOverdue,
  removeTask,
  restoreTask,
} from '@/data/repos/tasks';
import {
  canAddTask,
  normalizedTaskDraft,
  taskProblem,
  tasksToPenalise,
  type Task,
  type TaskDraft,
  type TaskProblem,
} from '@/domain/tasks';

export type TaskRejection = TaskProblem | 'limit';

export type TaskSaveResult = { ok: true; id: string; saved: Promise<void> } | { ok: false; problem: TaskRejection };


/**
 * v1 openTodoForm() + saveTodo(): the limit, then the task. The first task of an
 * account also draws the PC build's order (v1 ensurePcBuild), in one transaction.
 */
export function createTask(
  uid: string,
  draft: TaskDraft,
  tasks: readonly Task[],
  hasBuild: boolean,
  today: string,
  now = new Date(),
): TaskSaveResult {
  if (!canAddTask(tasks)) return { ok: false, problem: 'limit' };
  const problem = taskProblem(draft, today);
  if (problem) return { ok: false, problem };
  const id = newTaskId(uid);
  const clean = normalizedTaskDraft(draft);
  return { ok: true, id, saved: hasBuild ? addTask(uid, id, clean, now) : addFirstTask(uid, id, clean, now) };
}

/** v1 saveTodo() on edit: the same checks, the due date included. */
export function updateTask(uid: string, id: string, draft: TaskDraft, today: string): TaskSaveResult {
  const problem = taskProblem(draft, today);
  if (problem) return { ok: false, problem };
  return { ok: true, id, saved: editTask(uid, id, normalizedTaskDraft(draft)) };
}

/** Pieces added to the build (0 when done late). */
export function completeTask(uid: string, id: string, today: string): Promise<number> {
  return completeInStore(uid, id, today);
}

/** Undo of a task just created (Ex-us "Cofnij"): the document goes again. */
export function removeCreatedTask(uid: string, id: string): Promise<void> {
  return removeTask(uid, id);
}

/** New in v2. `undo` puts the same document back. */
export function deleteTask(uid: string, task: Task): { saved: Promise<void>; undo: () => Promise<void> } {
  return { saved: removeTask(uid, task.id), undo: () => restoreTask(uid, task) };
}

/**
 * v1 applies overdue penalties when the task list opens; v2 does it explicitly
 * from the Tasks screen, never while rendering (B15). Resolves to the number of
 * tasks penalised.
 */
export function applyOverduePenalties(uid: string, tasks: readonly Task[], today: string): Promise<number> {
  const candidates = tasksToPenalise(tasks, today).map((t) => t.id);
  return candidates.length === 0 ? Promise.resolve(0) : penaliseOverdue(uid, candidates, today);
}
