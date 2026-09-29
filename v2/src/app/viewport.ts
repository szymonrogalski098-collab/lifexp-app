// Width classes of docs/v2/PLAN.md 7.3. Only "expanded" changes the navigation
// model (persistent sidebar instead of the drawer); CSS uses the same 840 px.
import { signal } from '@preact/signals';

const expandedQuery = matchMedia('(min-width: 840px)');
export const isExpanded = signal(expandedQuery.matches);
expandedQuery.addEventListener('change', (e) => {
  isExpanded.value = e.matches;
});

/** Installed PWA: the left screen edge is ours. In a browser tab it belongs to the system Back gesture. */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || matchMedia('(display-mode: standalone)').matches;
}
