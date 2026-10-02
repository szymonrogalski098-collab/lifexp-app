// Motion helpers for what CSS alone cannot trigger (docs/v2/PLAN.md 7.1: 150-250 ms,
// transform and opacity only, so the compositor animates without layout work).
// Durations come from the tokens (tokens.css), which are 0 ms when the system asks
// for reduced motion, so every animation here honours that setting too.

/** A duration token in ms, e.g. cssDurationMs('--duration-exit') → 160. */
export function cssDurationMs(token: string, element: Element = document.documentElement): number {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  const ms = parseFloat(value);
  if (!Number.isFinite(ms)) return 0;
  return value.endsWith('ms') ? ms : ms * 1000;
}

let enterRuns = 0;

/**
 * A new screen rising into place: the element keeps its content and state, only
 * its frame animates (no remount, so nothing reloads).
 *
 * Chrome works out the style of an element whose only change is a starting
 * animation from the style it kept from that element's last full calculation.
 * After a modal layer (Sheet, ConfirmDialog) opened and closed, that kept style can
 * still say "inert": the screen then came in looking normal but took no taps until
 * a reload (tests/v2/modal.spec.js). Changing a variable on the element in the same
 * frame makes Chrome calculate its style in full.
 */
export function playEnter(element: HTMLElement | null): void {
  if (!element || typeof element.animate !== 'function') return;
  const duration = cssDurationMs('--duration-enter', element);
  if (duration === 0) return;
  const easing = getComputedStyle(element).getPropertyValue('--ease-out').trim() || 'ease-out';
  element.style.setProperty('--enter-run', String(++enterRuns));
  element.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
    duration,
    easing,
  });
}
