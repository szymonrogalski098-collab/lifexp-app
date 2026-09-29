// Theme preference model (docs/v2/PLAN.md 4.9): a theme is a family × mode.
// Pure functions only — reading storage and touching the DOM live in app/theme.ts.

export const THEME_FAMILIES = ['lifexp', 'ios', 'gold'] as const;
export type ThemeFamily = (typeof THEME_FAMILIES)[number];

export type ThemeMode = 'light' | 'dark';
export type ModePreference = ThemeMode | 'system';

export interface ThemePreference {
  family: ThemeFamily;
  mode: ModePreference;
}

export interface ResolvedTheme {
  family: ThemeFamily;
  mode: ThemeMode;
}

/**
 * Modes each family ships; the FIRST one is the family's default. Gold exists only
 * as a dark theme (as in v1). index.html repeats this table for the pre-paint script.
 */
export const FAMILY_MODES: Record<ThemeFamily, readonly [ModePreference, ...ModePreference[]]> = {
  lifexp: ['dark', 'light', 'system'],
  ios: ['system', 'light', 'dark'],
  gold: ['dark'],
};

export const DEFAULT_THEME: ThemePreference = { family: 'lifexp', mode: 'dark' };

/** v2 keeps its own key; v1's `lifexp-theme` is only read once, as a starting point. */
export const THEME_STORAGE_KEY = 'lifexp-v2-theme';
export const V1_THEME_STORAGE_KEY = 'lifexp-theme';

function isFamily(value: unknown): value is ThemeFamily {
  return typeof value === 'string' && (THEME_FAMILIES as readonly string[]).includes(value);
}

/** A family with a mode it supports; anything else falls back to the family default. */
export function normalizePreference(family: ThemeFamily, mode: unknown): ThemePreference {
  const modes = FAMILY_MODES[family];
  return { family, mode: modes.includes(mode as ModePreference) ? (mode as ModePreference) : modes[0] };
}

/** v1 values: 'lifexp' (dark), 'apple' (replaced by iOS), 'gold'. */
export function fromV1Theme(v1: string | null): ThemePreference {
  if (v1 === 'apple') return normalizePreference('ios', 'system');
  if (v1 === 'gold') return normalizePreference('gold', 'dark');
  return DEFAULT_THEME;
}

/**
 * Preference from the stored v2 value (JSON), else migrated from v1, else the default.
 * Corrupt or unknown stored values never throw.
 */
export function parseStoredPreference(v2Raw: string | null, v1Raw: string | null): ThemePreference {
  if (v2Raw) {
    try {
      const parsed: unknown = JSON.parse(v2Raw);
      if (parsed && typeof parsed === 'object' && isFamily((parsed as { family?: unknown }).family)) {
        const { family, mode } = parsed as { family: ThemeFamily; mode?: unknown };
        return normalizePreference(family, mode);
      }
    } catch {
      // fall through to the v1 value
    }
  }
  return fromV1Theme(v1Raw);
}

export function serializePreference(pref: ThemePreference): string {
  return JSON.stringify(pref);
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  const mode: ThemeMode = pref.mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : pref.mode;
  return { family: pref.family, mode };
}
