// Shared behaviour of modal layers (Sheet, ConfirmDialog) on top of the native
// <dialog>: showModal() gives the focus trap, inert background, Escape and the
// top layer for free. On top of that:
// - opening adds a history entry, so the system Back closes the layer (PLAN.md 4.7);
// - closing plays the exit animation before the element really closes.
import { useEffect, useRef } from 'preact/hooks';

const HISTORY_KEY = 'lifexpModal';
let counter = 0;

function topEntryId(): string | null {
  const state: unknown = history.state;
  if (typeof state !== 'object' || state === null) return null;
  const id = (state as Record<string, unknown>)[HISTORY_KEY];
  return typeof id === 'string' ? id : null;
}

/** Longest exit animation of the dialog, in ms (0 with reduced motion). */
function exitDuration(dialog: HTMLElement): number {
  const style = getComputedStyle(dialog);
  const seconds = Math.max(...style.animationDuration.split(',').map((d) => parseFloat(d) || 0));
  return seconds * 1000;
}

/**
 * Wires a <dialog> to `open`. `onClose` is called for every way out the user
 * takes (Escape, Back, the component's own buttons call it themselves); the
 * parent then sets `open` to false.
 */
export function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const entryId = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.dataset.state = 'open';
      dialog.showModal();
      entryId.current = `m${++counter}`;
      history.pushState({ [HISTORY_KEY]: entryId.current }, '', location.href);
      return;
    }
    if (!open && dialog.open) {
      // Closed from the UI: drop our history entry too (Back already did it itself).
      if (entryId.current && topEntryId() === entryId.current) history.back();
      entryId.current = null;
      dialog.dataset.state = 'closing';
      const timer = setTimeout(() => {
        dialog.close();
        delete dialog.dataset.state;
      }, exitDuration(dialog));
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    const onCancel = (e: Event) => {
      e.preventDefault(); // Escape: close through the parent, with the animation
      onCloseRef.current();
    };
    const onPopState = () => {
      if (entryId.current && topEntryId() !== entryId.current) {
        entryId.current = null;
        onCloseRef.current();
      }
    };
    dialog?.addEventListener('cancel', onCancel);
    addEventListener('popstate', onPopState);
    return () => {
      dialog?.removeEventListener('cancel', onCancel);
      removeEventListener('popstate', onPopState);
      // Unmounted while open (e.g. navigation): leave no dead history entry.
      if (entryId.current && topEntryId() === entryId.current) history.back();
    };
  }, []);

  return ref;
}

/**
 * Runs `fn` once no modal history entry is on top: at once, or after the Back
 * that a closing modal has just started. For a navigation that follows a
 * confirmation (e.g. leave a deleted note), so it replaces the screen's entry
 * and not the dialog's. Returns a cancel function.
 */
export function afterModalHistory(fn: () => void): () => void {
  if (topEntryId() === null) {
    fn();
    return () => {};
  }
  const onPopState = () => fn();
  addEventListener('popstate', onPopState, { once: true });
  return () => removeEventListener('popstate', onPopState);
}
