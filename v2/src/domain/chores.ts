// Chores as read on the Today screen (docs/v2/GOLDEN.md G8). Entries are keyed by
// the LOCAL day (v1 dateISOLocal), unlike dailyLog. Every entry that exists is
// still unpaid: v1 deletes entries when it pays them out.

/** users/{uid}/choreDefs/{id}. */
export interface ChoreDef {
  id: string;
  name: string;
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
