// Toast queue (docs/v2/PLAN.md 7.5): short feedback after an action, one at a
// time, optional single action ("Cofnij"). Any layer may call showToast();
// ToastHost (mounted once by the app shell) renders the head of the queue.
import { signal } from '@preact/signals';

export type ToastTone = 'default' | 'positive' | 'negative';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onAction: () => void };
  /** Override the default time on screen. */
  durationMs?: number;
}

export interface Toast extends ToastInput {
  id: number;
}

export const toasts = signal<readonly Toast[]>([]);
let nextId = 1;

export function showToast(input: ToastInput): number {
  const id = nextId++;
  toasts.value = [...toasts.value, { ...input, id }];
  return id;
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

/** Long enough to read, longer when there is something to press or an error to take in. */
export function toastDuration(toast: ToastInput): number {
  if (toast.durationMs !== undefined) return toast.durationMs;
  if (toast.action) return 7000;
  if (toast.tone === 'negative') return 6000;
  return 4000;
}
