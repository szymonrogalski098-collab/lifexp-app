// Which modules the person uses (v1 MODULE_REGISTRY and users.enabledModules;
// docs/v2/PLAN.md 5.4 M3, 2.3 B9). A module turned off disappears from the menu,
// the tab bar, "+" and Today; its data stays and comes back when it is turned on.

/**
 * Modules that can be turned off, under v1's ids; 'aichat' (v1's chat) is Ex-us in
 * v2. Today, Tasks, Goals and Settings are always there.
 */
export const OPTIONAL_MODULES = ['chores', 'money', 'notes', 'stats', 'games', 'aichat'] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];

/** v1's modules, in v1's order: v1 reads only enabledModules, so for these it stays the truth while v1 is in use. */
const V1_MODULES = ['chores', 'money', 'games', 'stats', 'notes', 'aichat'] as const;

export interface ModuleChoice {
  /** v1's list of modules turned on; null = never chosen (everything on, as in v1). */
  enabledModules: readonly string[] | null;
  /** M3: modules turned off, written by v2 next to enabledModules; null = not written yet. */
  disabledModules: readonly string[] | null;
}

function isV1Module(id: string): boolean {
  return (V1_MODULES as readonly string[]).includes(id);
}

export function isModuleOn(id: string, { enabledModules, disabledModules }: ModuleChoice): boolean {
  if (isV1Module(id)) {
    if (enabledModules === null) return true;
    // B9: the survey before 24.08 offered the Planner, which Notes replaced; an
    // account that chose the Planner then has Notes, not a hidden notebook.
    if (id === 'notes' && enabledModules.includes('planner')) return true;
    return enabledModules.includes(id);
  }
  // Modules v1 does not know (none yet): on unless turned off, so a new module is on.
  return !(disabledModules ?? []).includes(id);
}

/**
 * The profile fields after turning one module on or off: enabledModules for v1 (the
 * Planner, gone from v1, is dropped, its Notes kept) and the whole list of what is
 * off as disabledModules (M3), which takes over once v1 is retired.
 */
export function toggleModule(
  choice: ModuleChoice,
  id: OptionalModule,
  on: boolean,
): { enabledModules: string[]; disabledModules: string[] } {
  const after = (m: string) => (m === id ? on : isModuleOn(m, choice));
  return {
    enabledModules: V1_MODULES.filter(after),
    disabledModules: OPTIONAL_MODULES.filter((m) => !after(m)),
  };
}
