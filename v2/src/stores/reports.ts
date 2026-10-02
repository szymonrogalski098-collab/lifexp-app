// The person's bug reports, live, and which threads this device has read (v1 keeps
// the same map under the same key, so reading in either app counts in both).
import { signal } from '@preact/signals';
import type { BugReport } from '@/domain/reports';

/** v1 'lifexp-bug-read': report id → time of the last message seen. */
const READ_KEY = 'lifexp-bug-read';

function readMap(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(READ_KEY) || '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Last message time seen per report, on this device. */
export const readMarks = signal<Readonly<Record<string, string>>>(readMap());

/** v1 markBugRead(): the thread's last message counts as seen. */
export function markRead(report: BugReport): void {
  const last = report.messages[report.messages.length - 1];
  if (!last) return;
  const next = { ...readMap(), [report.id]: last.at };
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: seen for this session only.
  }
  readMarks.value = next;
}

/** undefined = still loading. */
export interface MyReportsState {
  reports: readonly BugReport[] | undefined;
  failed: boolean;
}

const EMPTY: MyReportsState = { reports: undefined, failed: false };

export const myReports = signal<MyReportsState>(EMPTY);

export function watchMyReportsState(uid: string): () => void {
  myReports.value = EMPTY;
  let stopped = false;
  let stop: (() => void) | null = null;
  const fail = () => {
    if (!stopped) myReports.value = { ...myReports.value, failed: true };
  };
  void import('@/data/repos/reports')
    .then((repo) => {
      if (stopped) return;
      stop = repo.watchMyReports(uid, (reports) => !stopped && (myReports.value = { reports, failed: false }), fail);
    })
    .catch(fail);
  return () => {
    stopped = true;
    stop?.();
  };
}

/** Every report, for the admin; undefined = still loading. */
export const allReports = signal<MyReportsState>(EMPTY);

export function watchAllReportsState(): () => void {
  allReports.value = EMPTY;
  let stopped = false;
  let stop: (() => void) | null = null;
  const fail = () => {
    if (!stopped) allReports.value = { ...allReports.value, failed: true };
  };
  void import('@/data/repos/reports')
    .then((repo) => {
      if (stopped) return;
      stop = repo.watchAllReports((reports) => !stopped && (allReports.value = { reports, failed: false }), fail);
    })
    .catch(fail);
  return () => {
    stopped = true;
    stop?.();
  };
}
