// Module registry (docs/v2/PLAN.md 4.4). Navigation, routes and — later —
// onboarding, the module list in Settings and Ex-us commands are generated from
// this list: adding a module = one folder + one entry here.
import {
  ChartLine,
  ClipboardCheck,
  Gamepad2,
  House,
  ListTodo,
  type LucideIcon,
  Megaphone,
  NotebookPen,
  Palette,
  Settings,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-preact';
import type { ComponentType } from 'preact';
import { matchPath, type RouteParams, type RouteProps } from '@/lib/route-match';

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
  | 'exus'
  | 'gallery';

export interface FeatureDef {
  id: ModuleId;
  labelKey: `nav.${ModuleId}`;
  /** Hash route patterns; the first one is where navigation points. */
  paths: readonly [string, ...string[]];
  /** Shown next to the label, never instead of it (PLAN.md 7.1, D9). */
  icon: LucideIcon;
  /** null = reachable, but not listed in the menu (e.g. Ex-us has its own button). */
  nav: { group: 'main' | 'secondary'; order: number } | null;
  /** Also in the phone tab bar (D10), in this order; the "+" sits after the second. */
  tab?: number;
  /** Stage of docs/v2/PLAN.md 9 that builds the module; shown until it exists. */
  stage: string;
  /** The module's screen, loaded on first visit. Absent = "coming soon". */
  view?: () => Promise<{ default: ComponentType<RouteProps> }>;
}

export const FEATURES: readonly FeatureDef[] = [
  {
    id: 'today',
    labelKey: 'nav.today',
    icon: House,
    paths: ['/today'],
    nav: { group: 'main', order: 10 },
    tab: 1,
    stage: '2',
    view: () => import('@/features/today/TodayPage'),
  },
  { id: 'tasks', labelKey: 'nav.tasks', icon: ListTodo, paths: ['/tasks'], nav: { group: 'main', order: 20 }, stage: '3a' },
  { id: 'goals', labelKey: 'nav.goals', icon: Target, paths: ['/goals'], nav: { group: 'main', order: 30 }, stage: '3d' },
  { id: 'chores', labelKey: 'nav.chores', icon: ClipboardCheck, paths: ['/chores'], nav: { group: 'main', order: 40 }, tab: 2, stage: '3b' },
  { id: 'money', labelKey: 'nav.money', icon: Wallet, paths: ['/money', '/money/loans'], nav: { group: 'main', order: 50 }, tab: 3, stage: '3c' },
  { id: 'notes', labelKey: 'nav.notes', icon: NotebookPen, paths: ['/notes', '/notes/:id'], nav: { group: 'main', order: 60 }, stage: '3a' },
  {
    id: 'stats',
    labelKey: 'nav.stats',
    icon: ChartLine,
    paths: ['/stats', '/stats/history'],
    nav: { group: 'main', order: 70 },
    stage: '2',
    view: () => import('@/features/stats/StatsModule'),
  },
  { id: 'games', labelKey: 'nav.games', icon: Gamepad2, paths: ['/games'], nav: { group: 'main', order: 80 }, stage: '7' },
  { id: 'reports', labelKey: 'nav.reports', icon: Megaphone, paths: ['/reports'], nav: { group: 'secondary', order: 10 }, stage: '4' },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings, paths: ['/settings/:section?'], nav: { group: 'secondary', order: 20 }, stage: '4' },
  { id: 'exus', labelKey: 'nav.exus', icon: Sparkles, paths: ['/exus'], nav: null, stage: '5' },
  // Not in the menu: a preview of the ui/ components in every theme.
  {
    id: 'gallery',
    labelKey: 'nav.gallery',
    icon: Palette,
    paths: ['/ui'],
    nav: null,
    stage: '1c',
    view: () => import('@/features/gallery/GalleryPage'),
  },
];

export const DEFAULT_PATH = '/today';

export function featureHref(feature: FeatureDef): string {
  return `#${feature.paths[0]}`;
}

export function navItems(group: 'main' | 'secondary'): FeatureDef[] {
  return FEATURES.filter((f) => f.nav?.group === group).sort((a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0));
}

/** Modules in the phone tab bar, in order (D10). */
export function tabItems(): FeatureDef[] {
  return FEATURES.filter((f) => f.tab !== undefined).sort((a, b) => (a.tab ?? 0) - (b.tab ?? 0));
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
