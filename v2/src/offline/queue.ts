// The offline draft queue shared with v1 (docs/v2/PLAN.md 4.8, stage 3f): the same
// localStorage key and entry format as v1 offline.js, so a draft made in either app
// shows up in both. Entries v2 does not understand are written back untouched.
// Storage can be missing or blocked (private mode): then there are simply no drafts.
import { signal } from '@preact/signals';
import { draftFromRaw, newDraftId, type DraftItem } from '@/domain/drafts';

/** v1 OFFLINE_QUEUE_KEY. */
export const OFFLINE_QUEUE_KEY = 'lifexp-offline-queue';

function readRaw(): unknown[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: readonly unknown[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the queue stays as it was.
  }
}

const read = () => readRaw().flatMap((raw) => draftFromRaw(raw) ?? []);

/** The drafts waiting on this device, oldest first (v1 appends). */
export const drafts = signal<readonly DraftItem[]>(read());

/** Reads the queue again (another tab, or v1 in this browser, may have changed it). */
export function refreshDrafts(): void {
  drafts.value = read();
}

/** Takes one draft out of the queue, leaving every other entry exactly as it was. */
export function removeDraft(id: string): void {
  writeRaw(readRaw().filter((raw) => (raw as { id?: unknown } | null)?.id !== id));
  refreshDrafts();
}

/** v1 queueOfflineDraft(): appends an entry in v1's format. */
export function addDraft(type: 'activity' | 'chore' | 'money_tx', summary: string, payload: Record<string, unknown>): void {
  const now = new Date();
  writeRaw([...readRaw(), { id: newDraftId(now.getTime()), type, summary, payload, createdAtLocal: now.toISOString() }]);
  refreshDrafts();
}

/** Asks the review to open (e.g. from Today's reminder); the review clears it. */
export const reviewRequested = signal(false);

/** Follows changes made in other tabs (v1 included); returns the unsubscribe. */
export function watchDraftsFromOtherTabs(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === OFFLINE_QUEUE_KEY || e.key === null) refreshDrafts();
  };
  addEventListener('storage', onStorage);
  return () => removeEventListener('storage', onStorage);
}
