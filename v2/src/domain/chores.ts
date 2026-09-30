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
