// Drag physics of the mobile drawer (docs/v2/PLAN.md 7.4, U3). Pure functions so
// the "does it open?" decision is tested without a browser.

export interface DragSample {
  /** Pointer x in px. */
  x: number;
  /** Timestamp in ms. */
  t: number;
}

/** Releasing faster than this (px/ms, i.e. 300 px/s) is a flick: direction decides, not position. */
export const FLICK_VELOCITY = 0.3;
/** Only the most recent part of the drag counts for velocity. */
const VELOCITY_WINDOW_MS = 100;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Progress (0 = closed, 1 = open) after dragging `dx` px, for a drawer `offset` px wide. */
export function dragProgress(startProgress: number, dx: number, offset: number): number {
  if (offset <= 0) return startProgress;
  return clamp01(startProgress + dx / offset);
}

/** Horizontal velocity in px/ms over the last ~100 ms of samples (0 if unknown). */
export function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    if (!s || last.t - s.t > VELOCITY_WINDOW_MS) break;
    first = s;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/**
 * Where the drawer settles when the finger lifts: a quick flick goes in its
 * direction; a slow drag settles on the side of the 50 % threshold.
 */
export function settlesOpen(progress: number, velocity: number): boolean {
  if (velocity >= FLICK_VELOCITY) return true;
  if (velocity <= -FLICK_VELOCITY) return false;
  return progress >= 0.5;
}

/** A pointer that moved less than this (px) was a tap, not a drag. */
export const TAP_SLOP = 6;
