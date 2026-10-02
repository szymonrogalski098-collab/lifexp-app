// Offline drafts (docs/v2/PLAN.md 4.8, stage 3f; v1 offline.js). Entries made with no
// connection are kept on the device as drafts and added to the account only when
// the person confirms them online, against the account as it is then (the daily
// limit, the Money balance). v1 and v2 share the queue and its format, so a draft
// made in one is confirmed in the other. These are the drafts as read: anything the
// format does not promise is checked, and a draft v2 cannot read is left for v1.

/** v1's queue entry: what kind of entry, a one-line summary written at the time, and the data. */
export interface DraftBase {
  id: string;
  /** Shown as written when the draft was made (in that day's language). */
  summary: string;
  /** When it was made, offline: the entry's time once it is added. */
  createdAt: Date;
}

export interface ActivityDraftItem extends DraftBase {
  kind: 'activity';
  type: string;
  typeName: string | null;
  minutes: number;
  desc: string;
  pointsPerHour: number;
  /** UTC day of the draft (v1 todayStr()), whose dailyLog the points go to. */
  day: string;
}

export interface ChoreDraftItem extends DraftBase {
  kind: 'chore';
  choreId: string;
  name: string;
  emoji: string;
  points: number;
  oneTime: boolean;
  /** Local day of the draft (G13). */
  dateISO: string;
}

export interface MoneyDraftItem extends DraftBase {
  kind: 'money';
  txType: 'expense' | 'income';
  /** Grosze. */
  grosze: number;
  /** The category's name, an existing one or one to create. */
  category: string;
  note: string;
  /** "YYYY-MM-DD" of the form (UTC today by default, as v1). */
  date: string;
}

/** A gaming session: v2 has no gaming (owner's decision), so it is confirmed in v1 or discarded. */
export interface GamingDraftItem extends DraftBase {
  kind: 'gaming';
}

/** Anything else (or a draft that does not read): left in the queue for v1. */
export interface OtherDraftItem extends DraftBase {
  kind: 'other';
}

export type DraftItem = ActivityDraftItem | ChoreDraftItem | MoneyDraftItem | GamingDraftItem | OtherDraftItem;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const day = (value: unknown): string | null => {
  const s = str(value);
  return s && DAY.test(s) ? s : null;
};

/**
 * One raw queue entry → a draft. null when it is not a queue entry at all (no id);
 * a known kind whose data does not read becomes "other", so it is never applied
 * half-understood and never silently lost.
 */
export function draftFromRaw(raw: unknown): DraftItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const id = str(item.id);
  if (!id) return null;
  const created = new Date(str(item.createdAtLocal) ?? '');
  const base: DraftBase = {
    id,
    summary: str(item.summary) ?? '',
    createdAt: Number.isNaN(created.getTime()) ? new Date(0) : created,
  };
  const p = (typeof item.payload === 'object' && item.payload !== null ? item.payload : {}) as Record<string, unknown>;
  const other: OtherDraftItem = { ...base, kind: 'other' };

  switch (item.type) {
    case 'activity': {
      const type = str(p.type);
      const minutes = num(p.minutes);
      const dateStr = day(p.dateStr);
      if (!type || minutes === null || !dateStr) return other;
      return {
        ...base,
        kind: 'activity',
        type,
        typeName: str(p.typeName) || null,
        minutes,
        desc: str(p.desc) ?? '',
        pointsPerHour: num(p.ptsPerHour) ?? 0,
        day: dateStr,
      };
    }
    case 'chore': {
      const choreId = str(p.choreId);
      const points = num(p.points);
      const dateISO = day(p.dateISO);
      if (!choreId || points === null || !dateISO) return other;
      return {
        ...base,
        kind: 'chore',
        choreId,
        name: str(p.choreName) ?? '',
        emoji: str(p.choreEmoji) ?? '',
        points,
        oneTime: p.oneTime === true,
        dateISO,
      };
    }
    case 'money_tx': {
      const amount = num(p.amount);
      const category = str(p.category);
      const date = day(p.date);
      if ((p.txType !== 'expense' && p.txType !== 'income') || amount === null || !category || !date) return other;
      return {
        ...base,
        kind: 'money',
        txType: p.txType,
        grosze: Math.round(amount * 100),
        category,
        note: str(p.note) ?? '',
        date,
      };
    }
    case 'gaming':
      return { ...base, kind: 'gaming' };
    default:
      return other;
  }
}

/** v1 queueOfflineDraft()'s id: time in base 36 and 5 random characters. */
export function newDraftId(now: number, random: () => number = Math.random): string {
  return now.toString(36) + random().toString(36).slice(2, 7);
}

// ── Drafts made in v2 (stage 3f-2), in v1's format ──

/** v1 queueActivityDraft()'s payload; points are estimated now and capped when confirmed. */
export function activityDraftPayload(input: {
  type: string;
  typeName: string | null;
  minutes: number;
  desc: string;
  pointsPerHour: number;
  /** UTC day of the draft (v1 todayStr()). */
  day: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: input.type,
    minutes: input.minutes,
    desc: input.desc,
    ptsPerHour: input.pointsPerHour,
    dateStr: input.day,
  };
  if (input.typeName) payload.typeName = input.typeName;
  return payload;
}

/** v1 queueMoneyTxDraft()'s payload: the amount in złoty and the category by name. */
export function moneyDraftPayload(input: {
  txType: 'expense' | 'income';
  grosze: number;
  category: string;
  note: string;
  date: string;
}): Record<string, unknown> {
  return {
    txType: input.txType,
    amount: input.grosze / 100,
    category: input.category,
    note: input.note,
    date: input.date,
  };
}
