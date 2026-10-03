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
import { isModuleOn, type ModuleChoice, type OptionalModule } from '@/domain/modules';
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
  /** The person can turn it off in Settings (domain/modules); absent = always there. */
  optional?: OptionalModule;
  /** The module's screen, loaded on first visit. Absent = "coming soon". */
  view?: () => Promise<{ default: ComponentType<RouteProps> }>;
  /**
   * Sibling views of one screen, switched by its ViewSwitch. Moving between them is
   * not a new screen: the switch slides and only the content below changes.
   */
  views?: readonly string[];
}

export const FEATURES: readonly FeatureDef[] = [
  {
    id: 'today',
    labelKey: 'nav.today',
    icon: House,
    paths: ['/today', '/today/activity'],
    nav: { group: 'main', order: 10 },
    tab: 1,
    stage: '2',
    view: () => import('@/features/today/TodayPage'),
  },
  {
    id: 'tasks',
    labelKey: 'nav.tasks',
    icon: ListTodo,
    paths: ['/tasks', '/tasks/new'],
    nav: { group: 'main', order: 20 },
    stage: '3a',
    view: () => import('@/features/tasks/TasksPage'),
  },
  {
    id: 'goals',
    labelKey: 'nav.goals',
    icon: Target,
    paths: ['/goals'],
    nav: { group: 'main', order: 30 },
    stage: '3d',
    view: () => import('@/features/goals/GoalsPage'),
  },
  {
    id: 'chores',
    labelKey: 'nav.chores',
    optional: 'chores',
    icon: ClipboardCheck,
    paths: ['/chores', '/chores/new', '/chores/defs'],
    nav: { group: 'main', order: 40 },
    tab: 2,
    stage: '3b',
    view: () => import('@/features/chores/ChoresModule'),
    views: ['/chores', '/chores/defs'],
  },
  {
    id: 'money',
    labelKey: 'nav.money',
    optional: 'money',
    icon: Wallet,
    paths: ['/money', '/money/new', '/money/loans', '/money/settings'],
    nav: { group: 'main', order: 50 },
    tab: 3,
    stage: '3c',
    view: () => import('@/features/money/MoneyModule'),
    views: ['/money', '/money/loans', '/money/settings'],
  },
  {
    id: 'notes',
    labelKey: 'nav.notes',
    optional: 'notes',
    icon: NotebookPen,
    paths: ['/notes', '/notes/:id'],
    nav: { group: 'main', order: 60 },
    stage: '3a',
    view: () => import('@/features/notes/NotesModule'),
  },
  {
    id: 'stats',
    labelKey: 'nav.stats',
    optional: 'stats',
    icon: ChartLine,
    paths: ['/stats', '/stats/history'],
    nav: { group: 'main', order: 70 },
    stage: '2',
    view: () => import('@/features/stats/StatsModule'),
    views: ['/stats', '/stats/history'],
  },
  {
    id: 'games',
    labelKey: 'nav.games',
    optional: 'games',
    icon: Gamepad2,
    paths: ['/games'],
    nav: { group: 'main', order: 80 },
    stage: '7',
  },
  {
    id: 'reports',
    labelKey: 'nav.reports',
    icon: Megaphone,
    paths: ['/reports', '/reports/broadcasts', '/reports/updates'],
    nav: { group: 'secondary', order: 10 },
    stage: '4',
    view: () => import('@/features/reports/ReportsModule'),
    views: ['/reports', '/reports/broadcasts', '/reports/updates'],
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    icon: Settings,
    paths: ['/settings/:section?'],
    nav: { group: 'secondary', order: 20 },
    stage: '4',
    view: () => import('@/features/settings/SettingsModule'),
  },
  { id: 'exus', labelKey: 'nav.exus', optional: 'aichat', icon: Sparkles, paths: ['/exus'], nav: null, stage: '5' },
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

/**
 * Where the menu and the tab bar take a module: its first path without route
 * params ("/settings/:section?" → "/settings"). The pattern itself is no address:
 * opened as one, ":section" read as a section name.
 */
export function featurePath(feature: FeatureDef): string {
  return '/' + feature.paths[0].split('/').filter((part) => part && !part.startsWith(':')).join('/');
}

export function featureHref(feature: FeatureDef): string {
  return `#${featurePath(feature)}`;
}

/** Everything on: what a list shows before the profile says otherwise. */
const ALL_ON: ModuleChoice = { enabledModules: null, disabledModules: null };

/** The module is there for this person (not turned off in Settings). */
export function featureOn(feature: FeatureDef, choice: ModuleChoice = ALL_ON): boolean {
  return feature.optional === undefined || isModuleOn(feature.optional, choice);
}

export function navItems(group: 'main' | 'secondary', choice: ModuleChoice = ALL_ON): FeatureDef[] {
  return FEATURES.filter((f) => f.nav?.group === group && featureOn(f, choice)).sort(
    (a, b) => (a.nav?.order ?? 0) - (b.nav?.order ?? 0),
  );
}

/** How many modules the phone tab bar holds besides "+" and Menu (D10). */
const TAB_COUNT = 3;

/**
 * Modules in the phone tab bar, in order (D10). A tab whose module is off gives its
 * place to the next module of the menu that is on, so the bar stays full.
 */
export function tabItems(choice: ModuleChoice = ALL_ON): FeatureDef[] {
  const tabs = FEATURES.filter((f) => f.tab !== undefined && featureOn(f, choice)).sort(
    (a, b) => (a.tab ?? 0) - (b.tab ?? 0),
  );
  for (const f of navItems('main', choice)) {
    if (tabs.length >= TAB_COUNT) break;
    if (!tabs.includes(f)) tabs.push(f);
  }
  return tabs;
}

export interface ResolvedRoute {
  feature: FeatureDef;
  params: RouteParams;
}

/** Two paths that are views of the same screen (FeatureDef.views), so not a new screen. */
export function isViewSwitch(from: string | null, to: string): boolean {
  if (from === null || from === to) return false;
  return FEATURES.some((f) => f.views?.includes(from) && f.views.includes(to));
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
