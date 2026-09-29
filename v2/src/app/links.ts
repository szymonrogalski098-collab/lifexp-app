/** A plain left click: the app navigates. Anything else ("open in new tab"…) stays with the browser. */
export function isPlainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
