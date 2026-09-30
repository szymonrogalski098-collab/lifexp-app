// Tasks and the PC build they feed (v1 notes.js:33-137, 561-683; docs/v2/GOLDEN.md G9).
// A task has a due date (the device's local calendar, G13) and a size; done in time
// it adds pieces to the component being built, overdue it takes one piece back.
// Everything here is pure: state in, new state out.

/** v1 TODOS_MAX: every task counts, done ones too. */
export const TASKS_MAX = 30;
export const PIECES_PER_COMPONENT = 3;
/** v1's task field (maxlength="500"). */
export const TASK_TEXT_MAX = 500;

export type TaskSize = 'S' | 'M' | 'L';
export const TASK_SIZES: readonly TaskSize[] = ['S', 'M', 'L'];
export const SIZE_PIECES: Readonly<Record<TaskSize, number>> = { S: 1, M: 2, L: 3 };

/** users/{uid}/todos/{id}. */
export interface Task {
  id: string;
  /** Markdown, as in v1. */
  text: string;
  /** Local "YYYY-MM-DD"; null only for a malformed document. */
  dueDate: string | null;
  size: TaskSize;
  done: boolean;
  createdAt: Date | null;
  penaltyApplied: boolean;
}

export interface TaskDraft {
  text: string;
  dueDate: string;
  size: TaskSize;
}

export type TaskProblem = 'textRequired' | 'dueRequired' | 'dueInPast';

/** v1 saveTodo(): text (trimmed), a due date, not before today (local). Also on edit. */
export function taskProblem(draft: TaskDraft, today: string): TaskProblem | null {
  if (!draft.text.trim()) return 'textRequired';
  if (!draft.dueDate) return 'dueRequired';
  if (draft.dueDate < today) return 'dueInPast';
  return null;
}

export function normalizedTaskDraft(draft: TaskDraft): TaskDraft {
  return { text: draft.text.trim(), dueDate: draft.dueDate, size: draft.size };
}

/** v1 openTodoForm(): a new task only below the limit. */
export function canAddTask(tasks: readonly Task[]): boolean {
  return tasks.length < TASKS_MAX;
}

/** Not done and past its due day (the due day itself still counts as in time, G9.6). */
export function isOverdue(task: Task, today: string): boolean {
  return !task.done && task.dueDate !== null && task.dueDate < today;
}

/** v1 markTodoDone(): pieces only when done on or before the due day. */
export function completionPieces(task: Task, today: string): number {
  return task.dueDate !== null && today <= task.dueDate ? SIZE_PIECES[task.size] : 0;
}

/** v1 applyOverduePenalties(): overdue tasks not penalised yet, each exactly once. */
export function tasksToPenalise(tasks: readonly Task[], today: string): Task[] {
  return tasks.filter((task) => isOverdue(task, today) && !task.penaltyApplied);
}

export interface TaskGroups {
  overdue: Task[];
  open: Task[];
  done: Task[];
}

/** For the list: overdue and open by due date (soonest first), done ones last, newest first. */
export function groupTasks(tasks: readonly Task[], today: string): TaskGroups {
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  const byCreated = (a: Task, b: Task) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  return {
    overdue: tasks.filter((t) => isOverdue(t, today)).sort(byDue),
    open: tasks.filter((t) => !t.done && !isOverdue(t, today)).sort(byDue),
    done: tasks.filter((t) => t.done).sort(byCreated),
  };
}

// ── PC build ──

export type PcComponent = 'case' | 'motherboard' | 'gpu' | 'cpu' | 'psu' | 'ram';
/** Always first, in this order. */
const FIXED: readonly PcComponent[] = ['case', 'motherboard'];
/** Shuffled once per account. */
const SHUFFLED: readonly PcComponent[] = ['gpu', 'cpu', 'psu', 'ram'];
export const PC_COMPONENTS: readonly PcComponent[] = [...FIXED, ...SHUFFLED];

/** users/{uid}.pcBuild. */
export interface PcBuild {
  componentOrder: PcComponent[];
  progress: Record<string, number>;
  /** Index into componentOrder; equal to its length when the PC is complete. */
  currentComponentIndex: number;
}

/** v1 makePcBuild(): the order is drawn here only, once per account (Fisher–Yates, `random` in [0, 1)). */
export function makePcBuild(random: () => number = Math.random): PcBuild {
  const tail = [...SHUFFLED];
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tail[i], tail[j]] = [tail[j] as PcComponent, tail[i] as PcComponent];
  }
  const componentOrder = [...FIXED, ...tail];
  return {
    componentOrder,
    progress: Object.fromEntries(componentOrder.map((c) => [c, 0])),
    currentComponentIndex: 0,
  };
}

/** v1 getPcBuild(): the stored build, or null when absent or malformed (then it counts as "none yet"). */
export function pcBuildOrNull(value: unknown): PcBuild | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  if (!Array.isArray(b.componentOrder) || b.componentOrder.length !== PC_COMPONENTS.length) return null;
  if (typeof b.progress !== 'object' || b.progress === null || typeof b.currentComponentIndex !== 'number') return null;
  return {
    componentOrder: b.componentOrder.map(String) as PcComponent[],
    progress: { ...(b.progress as Record<string, number>) },
    currentComponentIndex: b.currentComponentIndex,
  };
}

function clone(build: PcBuild): PcBuild {
  return { ...build, componentOrder: [...build.componentOrder], progress: { ...build.progress } };
}

const piecesOf = (build: PcBuild, component: string) => build.progress[component] || 0;

export function isComplete(build: PcBuild): boolean {
  return build.currentComponentIndex >= build.componentOrder.length;
}

/**
 * v1 addPiecesToBuild(): pieces go to the component being built only; what does
 * not fit is lost (G9.2). At 3/3 the next component starts.
 */
export function addPieces(build: PcBuild, pieces: number): PcBuild {
  const b = clone(build);
  const component = b.componentOrder[b.currentComponentIndex];
  if (component === undefined) return b;
  b.progress[component] = Math.min(PIECES_PER_COMPONENT, piecesOf(b, component) + pieces);
  if ((b.progress[component] ?? 0) >= PIECES_PER_COMPONENT) b.currentComponentIndex += 1;
  return b;
}

/**
 * v1 applyPenaltyToBuild(): one piece off the last finished component, counting
 * from the end; the one being built is never hit and the index stays (G9.4).
 * Nothing finished → no effect (G9.5).
 */
export function applyPenalty(build: PcBuild): PcBuild {
  const b = clone(build);
  for (let i = b.componentOrder.length - 1; i >= 0; i--) {
    const component = b.componentOrder[i] as string;
    if (piecesOf(b, component) >= PIECES_PER_COMPONENT) {
      b.progress[component] = PIECES_PER_COMPONENT - 1;
      return b;
    }
  }
  return b;
}
