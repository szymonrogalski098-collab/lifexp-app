// The admin's messages to everyone (v1 updates.js; stage 4). Only the admin may write
// them; the rules refuse anyone else.
import { addBroadcast, removeBroadcast } from '@/data/repos/broadcasts';
import { BROADCAST_TEXT_MAX, broadcastProblem, broadcastSeconds, type BroadcastProblem } from '@/domain/broadcasts';

/** v1 sendBroadcast(): the text (up to 280) and 1–30 seconds on screen. */
export function sendBroadcast(
  text: string,
  seconds: number | null,
  now = new Date(),
): { ok: true; saved: Promise<void> } | { ok: false; problem: BroadcastProblem } {
  const problem = broadcastProblem(text);
  if (problem) return { ok: false, problem };
  return { ok: true, saved: addBroadcast(text.trim().slice(0, BROADCAST_TEXT_MAX), broadcastSeconds(seconds), now) };
}

/** v1 deleteBroadcast(), after asking. */
export function deleteBroadcast(id: string): Promise<void> {
  return removeBroadcast(id);
}
