// todos documents ↔ domain values (docs/v2/INVENTORY.md: 7 tasks, every field
// present, createdAt an ISO string, size S or L). v2 writes v1's exact shape.
import type { DocumentData } from 'firebase/firestore';
import { TASK_SIZES, type Task, type TaskDraft, type TaskSize } from '@/domain/tasks';
import { dateOrNull, dayKeyOrNull, stringOr } from './fields';

/** v1 shows and scores a missing or unknown size as S. */
function sizeOr(value: unknown): TaskSize {
  return TASK_SIZES.includes(value as TaskSize) ? (value as TaskSize) : 'S';
}

export function taskFromData(id: string, data: DocumentData): Task {
  return {
    id,
    text: stringOr(data.text),
    dueDate: dayKeyOrNull(data.dueDate),
    size: sizeOr(data.size),
    done: data.done === true,
    createdAt: dateOrNull(data.createdAt),
    penaltyApplied: data.penaltyApplied === true,
  };
}

/** v1 saveTodo() for a new task. */
export function newTaskData(draft: TaskDraft, now: Date): DocumentData {
  return {
    text: draft.text,
    dueDate: draft.dueDate,
    size: draft.size,
    done: false,
    createdAt: now.toISOString(),
    penaltyApplied: false,
  };
}

/** v1 saveTodo() for an edit. */
export function taskEditData(draft: TaskDraft): DocumentData {
  return { text: draft.text, dueDate: draft.dueDate, size: draft.size };
}
