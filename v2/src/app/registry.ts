// Module registry (docs/v2/PLAN.md 4.4). Navigation, routes and — later —
// onboarding, the module list in Settings and Ex-us commands are generated from
// this list: adding a module = one folder + one entry here.
import { matchPath, type RouteParams } from '@/lib/route-match';

export type ModuleId =
  | 'today'
  | 'tasks'
  | 'goals'
  | 'chores'
  | 'money'
  | 'notes'
  | 'stats'
  | 'games'
  | 'reports'
  | 'settings'
  | 'exus';

export interface FeatureDef {
  id: ModuleId;
  labelKey: `nav.${ModuleId}`;
  /** Hash route patterns; the first one is where navigation points. */
  paths: readonly [string, ...string[]];
  /** null = reachable, but not listed in the menu (e.g. Ex-us has its own button). */
  nav: { group: 'main' | 'secondary'; order: number } | null;
  /** Stage of docs/v2/PLAN.md 9 that builds the module; shown until it exists. */
  stage: string;
}

export const FEATURES: readonly FeatureDef[] = [
  { id: 'today', labelKey: 'nav.today', paths: ['/today'], nav: { group: 'main', order: 10 }, stage: '2' },
  { id: 'tasks', labelKey: 'nav.tasks', paths: ['/tasks'], nav: { group: 'main', order: 20 }, stage: '3a' },
  { id: 'goals', labelKey: 'nav.goals', paths: ['/goals'], nav: { group: 'main', order: 30 }, stage: '3d' },
  { id: 'chores', labelKey: 'nav.chores', paths: ['/chores'], nav: { group: 'main', order: 40 }, stage: '3b' },
  { id: 'money', labelKey: 'nav.money', paths: ['/money', '/money/loans'], nav: { group: 'main', order: 50 }, stage: '3c' },
  { id: 'notes', labelKey: 'nav.notes', paths: ['/notes', '/notes/:id'], nav: { group: 'main', order: 60 }, stage: '3a' },
  { id: 'stats', labelKey: 'nav.stats', paths: ['/stats', '/stats/history'], nav: { group: 'main', order: 70 }, stage: '3e' },
  { id: 'games', labelKey: 'nav.games', paths: ['/games'], nav: { group: 'main', order: 80 }, stage: '7' },
  { id: 'reports', labelKey: 'nav.reports', paths: ['/reports'], nav: { group: 'secondary', order: 10 }, stage: '4' },
  { id: 'settings', labelKey: 'nav.settings', paths: ['/settings/:section?'], nav: { group: 'secondary', order: 20 }, stage: '4' },
  { id: 'exus', labelKey: 'nav.exus', paths: ['/exus'], nav: null, stage: '5' },
];

export const DEFAULT_PATH = '/today';

export function featureHref(feature: FeatureDef): string {
  return `#${feature.paths[0]}`;
}

export function navItems(group: 'main' | 'secondary'): FeatureDef[] {
  return FEATURES.filter((f) => f.nav?.group === group).sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0));
}

export interface ResolvedRoute {
  feature: FeatureDef;
  params: RouteParams;
}

export function resolveRoute(path: string): ResolvedRoute | null {
  for (const feature of FEATURES) {
    for (const pattern of feature.paths) {
      const params = matchPath(pattern, path);
      if (params) return { feature, params };
    }
  }
  return null;
}
