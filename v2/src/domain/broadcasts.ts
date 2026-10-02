// Messages from the admin to everyone (v1 updates.js "broadcasts"; stage 4): each
// shows once per device as a banner, oldest first, for as long as the admin set.

/** v1 textarea#broadcast-text maxlength. */
export const BROADCAST_TEXT_MAX = 280;
export const BROADCAST_SECONDS_MIN = 1;
export const BROADCAST_SECONDS_MAX = 30;
export const BROADCAST_SECONDS_DEFAULT = 5;
/** v1 reads the last 10 for the banner and lists 20 for the admin. */
export const BROADCASTS_FOR_BANNER = 10;
export const BROADCASTS_FOR_ADMIN = 20;
/** v1 keeps the last 200 seen ids. */
export const SEEN_BROADCASTS_KEPT = 200;

export interface Broadcast {
  id: string;
  text: string;
  /** Seconds on screen, already within 1–30. */
  seconds: number;
  createdAt: Date | null;
}

/** v1: Math.min(30, Math.max(1, Number(x) || 5)). */
export function broadcastSeconds(value: unknown): number {
  const n = Number(value) || BROADCAST_SECONDS_DEFAULT;
  return Math.min(BROADCAST_SECONDS_MAX, Math.max(BROADCAST_SECONDS_MIN, n));
}

/** The newest-first list's messages this device has not shown yet, oldest first (v1 startBroadcastListener). */
export function unseenBroadcasts(newestFirst: readonly Broadcast[], seen: readonly string[]): Broadcast[] {
  return newestFirst.filter((b) => !seen.includes(b.id)).reverse();
}

/** Adds an id to the seen list, keeping only the last ones (v1 markBroadcastSeen). */
export function withSeen(seen: readonly string[], id: string): string[] {
  return seen.includes(id) ? [...seen] : [...seen, id].slice(-SEEN_BROADCASTS_KEPT);
}

export type BroadcastProblem = 'textRequired';

export function broadcastProblem(text: string): BroadcastProblem | null {
  return text.trim() ? null : 'textRequired';
}
