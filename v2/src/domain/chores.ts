// Chores as read on the Today screen (docs/v2/GOLDEN.md G8). Entries are keyed by
// the LOCAL day (v1 dateISOLocal), unlike dailyLog. Every entry that exists is
// still unpaid: v1 deletes entries when it pays them out.

/** users/{uid}/choreDefs/{id}. */
export interface ChoreDef {
  id: string;
  name: string;
  /** Optional; v1 stores it and never shows it (all empty in production). */
  desc: string;
  /** Chosen by the person, shown as content (PLAN.md 7.1). */
  emoji: string;
  points: number;
  /** Deleted by v1 after it is logged once. */
  oneTime: boolean;
  order: number;
}

/** users/{uid}/chores/{id}: one logged chore, unpaid until the next payout. */
export interface ChoreEntry {
  id: string;
  choreId: string;
  /** Copied at logging time, so an entry outlives its definition. */
  name: string;
  emoji: string;
  points: number;
  /** Local day "YYYY-MM-DD". */
  dateISO: string;
  /** "YYYY-MM" of dateISO; v1 filters months by this field. */
  monthKey: string;
  createdAt: Date | null;
}

/** v1 rateChores(): złoty per point, 0,45 zł / 1 pkt unless both profile fields are set. */
export function choresRate(zloty: number | null, points: number | null): number {
  return zloty && points ? zloty / points : 0.45;
}

export interface ChoreRow {
  choreId: string;
  name: string;
  emoji: string;
  points: number;
  /** How many times it was logged today. */
  doneToday: number;
}

/**
 * Today's chore list: every definition in v1's order, each with how often it was
 * done today; entries whose definition is gone (one-time chores, deleted ones)
 * follow, so nothing logged today disappears.
 */
export function todayChores(defs: readonly ChoreDef[], entries: readonly ChoreEntry[], today: string): ChoreRow[] {
  const doneToday = new Map<string, number>();
  const orphans = new Map<string, ChoreRow>();
  const defIds = new Set(defs.map((d) => d.id));
  for (const entry of entries) {
    if (entry.dateISO !== today) continue;
    doneToday.set(entry.choreId, (doneToday.get(entry.choreId) ?? 0) + 1);
    if (!defIds.has(entry.choreId)) {
      const row = orphans.get(entry.choreId);
      if (row) row.doneToday += 1;
      else orphans.set(entry.choreId, { ...pick(entry), doneToday: 1 });
    }
  }
  const rows = [...defs]
    .sort((a, b) => a.order - b.order)
    .map((def) => ({ ...pick({ ...def, choreId: def.id }), doneToday: doneToday.get(def.id) ?? 0 }));
  return [...rows, ...orphans.values()];
}

function pick(source: { choreId: string; name: string; emoji: string; points: number }) {
  return { choreId: source.choreId, name: source.name, emoji: source.emoji, points: source.points };
}

export interface Unpaid {
  points: number;
  grosze: number;
}

/** G8.5–G8.7: everything not paid out yet, at the CURRENT rate (v1 renderOutstanding). */
export function unpaidChores(entries: readonly ChoreEntry[], rate: number): Unpaid {
  const points = entries.reduce((sum, e) => sum + e.points, 0);
  return { points, grosze: Math.round(points * rate * 100) };
}

// ── The Chores screen (stage 3b): months, calendar, logging ──

/** v1 monthKeyOf(): "2026-09-30" → "2026-09". */
export function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** v1 monthKeys(): this month and the one before, on this device's calendar. */
export function monthKeys(today: string): { cur: string; prev: string } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return { cur: monthKeyOf(today), prev: `${prevY}-${String(prevM).padStart(2, '0')}` };
}

export function entriesInMonth(entries: readonly ChoreEntry[], monthKey: string): ChoreEntry[] {
  return entries.filter((e) => e.monthKey === monthKey);
}

/** Points and złoty earned in a month at the current rate (v1 renderChores summary). */
export function monthEarnings(entries: readonly ChoreEntry[], monthKey: string, rate: number): Unpaid {
  return unpaidChores(entriesInMonth(entries, monthKey), rate);
}

export interface CalendarMonth {
  /** Empty cells before the 1st: Monday = 0 (v1 renderCalendar). */
  leadingBlanks: number;
  /** Every day of the month as "YYYY-MM-DD". */
  days: string[];
}

export function calendarMonth(monthKey: string): CalendarMonth {
  const [y, m] = monthKey.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leadingBlanks = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
  return { leadingBlanks, days };
}

/** Points per day, for the days that have entries. */
export function pointsByDay(entries: readonly ChoreEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) out.set(e.dateISO, (out.get(e.dateISO) ?? 0) + e.points);
  return out;
}

/** One day's entries in the order they were logged (v1 renderDayDetail). */
export function dayEntries(entries: readonly ChoreEntry[], day: string): ChoreEntry[] {
  return entries
    .filter((e) => e.dateISO === day)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}

/**
 * v1 addChore() (G8.2, G8.3): log for today, unless the chore is already logged
 * today, not yet yesterday, and yesterday is in the same month — then ask.
 */
export function entryDay(
  choreId: string,
  entries: readonly ChoreEntry[],
  today: string,
  yesterday: string,
): 'today' | 'ask' {
  const has = (day: string) => entries.some((e) => e.choreId === choreId && e.dateISO === day);
  const sameMonth = monthKeyOf(today) === monthKeyOf(yesterday);
  return has(today) && sameMonth && !has(yesterday) ? 'ask' : 'today';
}

// ── Payout (stage 3b-2; G8.5–G8.7) ──

/** users/{uid}/chorePayouts/{id}: one settlement, kept for the history. */
export interface ChorePayout {
  id: string;
  points: number;
  /** v1 amountPln, in grosze. */
  grosze: number;
  /** First and last local day of the entries it paid. */
  fromISO: string | null;
  toISO: string | null;
  createdAt: Date | null;
}

export interface PayoutPlan {
  points: number;
  grosze: number;
  fromISO: string;
  toISO: string;
}

/**
 * v1 settleChores(): every unpaid entry, at the CURRENT rate (G8.7), rounded to
 * grosze; the period runs from the earliest to the latest entry day. Nothing to
 * pay → null (v1 does nothing then).
 */
export function payoutPlan(entries: readonly ChoreEntry[], rate: number): PayoutPlan | null {
  const { points, grosze } = unpaidChores(entries, rate);
  if (points === 0 || entries.length === 0) return null;
  const days = entries.map((e) => e.dateISO).sort();
  return { points, grosze, fromISO: days[0] as string, toISO: days[days.length - 1] as string };
}

/** Newest first (v1 sorts by createdAt). */
export function payoutHistory(payouts: readonly ChorePayout[]): ChorePayout[] {
  return [...payouts].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

// ── Definitions (v1 settings.js addChoreDef, deleteChoreDef; chores.js seed) ──

/** v1's form fields (maxlength / max). */
export const CHORE_NAME_MAX = 60;
export const CHORE_DESC_MAX = 100;
export const CHORE_POINTS_MAX = 10000;
/** v1 CHORE_EMOJI_PRESETS: the only emoji a definition can get ("" = none). */
export const CHORE_EMOJIS: readonly string[] = ['🧹', '🪣', '🧽', '🗑️', '🍽️', '🛏️', '🧺', '🚿', '🪴', '🔧', '📦', '🐶'];

/**
 * v1 ensureChoreDefsSeeded(): the list an account starts with, under the ids of
 * v1's old constant list, so entries that point at them keep their definition.
 */
export const CHORE_SEEDS: readonly ChoreDef[] = [
  { id: 'entryway', name: 'Odkurzanie wiatrołapu (buty, kurtki, czapki)', desc: '', emoji: '🧹', points: 10, oneTime: false, order: 0 },
  { id: 'vacuum_stairs', name: 'Odkurzanie schodów', desc: '', emoji: '🧹', points: 5, oneTime: false, order: 1 },
  { id: 'wash_stairs', name: 'Zmycie schodów na mokro', desc: '', emoji: '🪣', points: 30, oneTime: false, order: 2 },
  { id: 'vacuum_ground', name: 'Kompleksowe odkurzenie całego parteru', desc: '', emoji: '🧹', points: 40, oneTime: false, order: 3 },
  { id: 'room_quick', name: 'Pobieżne sprzątnięcie pokoju', desc: '', emoji: '🛏️', points: 30, oneTime: false, order: 4 },
  { id: 'room_deep', name: 'Gruntowne sprzątnięcie pokoju', desc: '', emoji: '🧽', points: 60, oneTime: false, order: 5 },
  { id: 'trash_segregated', name: 'Opróżnienie głównego kosza segregowanego', desc: '', emoji: '🗑️', points: 40, oneTime: false, order: 6 },
  { id: 'dishwasher', name: 'Opróżnienie zmywarki', desc: '', emoji: '🍽️', points: 15, oneTime: false, order: 7 },
];

export interface ChoreDefDraft {
  name: string;
  desc: string;
  emoji: string;
  /** null = the field is empty. */
  points: number | null;
  oneTime: boolean;
}

export type ChoreDefProblem = 'nameRequired' | 'pointsRequired' | 'pointsTooMany';

/** v1 addChoreDef(): a name (trimmed) and whole points above zero; v1's field stops at 10 000. */
export function choreDefProblem(draft: ChoreDefDraft): ChoreDefProblem | null {
  if (!draft.name.trim()) return 'nameRequired';
  if (draft.points === null || !Number.isInteger(draft.points) || draft.points <= 0) return 'pointsRequired';
  if (draft.points > CHORE_POINTS_MAX) return 'pointsTooMany';
  return null;
}

/** v1 addChoreDef(): after the last one (max order + 1, missing order counts as 0), or 0 for the first. */
export function nextChoreOrder(defs: readonly ChoreDef[]): number {
  return defs.length ? Math.max(...defs.map((d) => d.order || 0)) + 1 : 0;
}

/** The definition v1 would write for a valid draft; call choreDefProblem() first. */
export function newChoreDef(draft: ChoreDefDraft, defs: readonly ChoreDef[]): Omit<ChoreDef, 'id'> {
  return {
    name: draft.name.trim(),
    desc: draft.desc.trim(),
    emoji: CHORE_EMOJIS.includes(draft.emoji) ? draft.emoji : '',
    points: draft.points ?? 0,
    oneTime: draft.oneTime,
    order: nextChoreOrder(defs),
  };
}

// ── The chores card on Today (owner's request 2026-10-02) ──

/**
 * users.choresCard: what Today's chore card shows. "random" (the default, also
 * without the field) draws 3–4 repeating chores a day; "chosen" shows the
 * chores picked in the card's editor, every day.
 */
export interface ChoresCardSettings {
  mode: 'random' | 'chosen';
  /** Chore definition ids, for "chosen". */
  ids: readonly string[];
}

export const CHORES_CARD_DEFAULT: ChoresCardSettings = { mode: 'random', ids: [] };

/** A random day shows this many chores, or 1 more (also drawn). */
export const CHORES_CARD_RANDOM_MIN = 3;

/** FNV-1a: a stable 32-bit hash, so a draw is the same on every device and reload. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The definitions on Today's card, in v1's order. A random day ranks every
 * repeating chore by a hash of `seed` (account and local day) and its id, and
 * takes the top 3 or 4: nothing is written, the draw is the same all day, and
 * adding or removing one chore leaves the others' ranks as they were. One-time
 * chores are left out of the draw (logging one deletes it).
 */
export function choresOnCard(defs: readonly ChoreDef[], settings: ChoresCardSettings, seed: string): ChoreDef[] {
  const byOrder = (a: ChoreDef, b: ChoreDef) => a.order - b.order;
  if (settings.mode === 'chosen') return defs.filter((d) => settings.ids.includes(d.id)).sort(byOrder);
  const count = CHORES_CARD_RANDOM_MIN + (hash(seed) % 2);
  return defs
    .filter((d) => !d.oneTime)
    .map((def) => ({ def, rank: hash(`${seed}:${def.id}`) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ def }) => def)
    .sort(byOrder);
}

/**
 * The card's rows: its chores with how often each was done today, and, for
 * "chosen", a picked one-time chore done today whose definition is already gone.
 */
export function choresCardRows(
  defs: readonly ChoreDef[],
  entries: readonly ChoreEntry[],
  today: string,
  settings: ChoresCardSettings,
  seed: string,
): ChoreRow[] {
  const shown = choresOnCard(defs, settings, seed);
  const keep = new Set([...shown.map((d) => d.id), ...(settings.mode === 'chosen' ? settings.ids : [])]);
  return todayChores(
    shown,
    entries.filter((e) => keep.has(e.choreId)),
    today,
  );
}
