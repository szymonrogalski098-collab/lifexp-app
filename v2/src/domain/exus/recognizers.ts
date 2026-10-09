// What one token of an Ex-us command means (docs/v2/PLAN.md 6.3): an amount, a
// duration, a day, one of a few words. Each returns undefined when the token is
// not one, so the parser can try the next slot.
import { addDays } from '@/lib/dates';
import { parseMoneyInput } from '@/lib/money';
import type { Recognizer } from './parse';

/** Lower case, without Polish letters: "Środa" → "sroda". */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const MONEY = /^(\d+(?:[.,]\d{1,2})?)(zl|pln)?$/;
const POINTS = /^(\d+)pkt$/;

export interface Money {
  grosze: number;
  /** "zł" or "PLN" was written: the amount is money, not points. */
  unit: boolean;
}

/** "12" "12,50" "12.5zł" "1500PLN" (after the tokenizer joined "1 500 PLN"). */
export const money: Recognizer<Money> = (token) => {
  const m = MONEY.exec(fold(token));
  if (!m) return undefined;
  const grosze = parseMoneyInput(m[1]!);
  return grosze === null ? undefined : { grosze, unit: m[2] !== undefined };
};

/** "500pkt" (after "500 pkt" was joined): points need their unit. */
export const points: Recognizer<number> = (token) => {
  const m = POINTS.exec(fold(token));
  return m ? Number(m[1]) : undefined;
};

/** A goal's amount: money or points, by its unit; a bare number stays undecided. */
export type Amount = { kind: 'money'; grosze: number } | { kind: 'points'; points: number } | { kind: 'unknown'; value: number };

export const amount: Recognizer<Amount> = (token) => {
  const p = points(token);
  if (p !== undefined) return { kind: 'points', points: p };
  const m = money(token);
  if (!m) return undefined;
  return m.unit ? { kind: 'money', grosze: m.grosze } : { kind: 'unknown', value: m.grosze / 100 };
};

/** A plain whole number. */
export const integer: Recognizer<number> = (token) => (/^\d+$/.test(token) ? Number(token) : undefined);

/** Minutes: "90" "90m" "90min" "1h" "1h30" "1h30m" "1,5h" "2h15m". */
export const duration: Recognizer<number> = (token) => {
  const t = fold(token);
  let m = /^(\d+)(m|min)?$/.exec(t);
  if (m) return Number(m[1]) || undefined;
  m = /^(\d+)(?:[.,](\d+))?h$/.exec(t);
  if (m) return Math.round(Number(`${m[1]}.${m[2] ?? 0}`) * 60) || undefined;
  m = /^(\d+)h(\d{1,2})(m|min)?$/.exec(t);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]) || undefined;
  return undefined;
};

const RELATIVE: Record<string, number> = {
  dzis: 0, dzisiaj: 0, today: 0,
  jutro: 1, tomorrow: 1,
  pojutrze: 2,
  wczoraj: -1, yesterday: -1,
};

/** Monday = 0 … Sunday = 6. */
const WEEKDAYS: Record<string, number> = {
  pn: 0, pon: 0, poniedzialek: 0, mon: 0, monday: 0,
  wt: 1, wto: 1, wtorek: 1, tue: 1, tuesday: 1,
  sr: 2, sro: 2, sroda: 2, wed: 2, wednesday: 2,
  czw: 3, czwartek: 3, thu: 3, thursday: 3,
  pt: 4, pia: 4, piatek: 4, fri: 4, friday: 4,
  sob: 5, sobota: 5, sat: 5, saturday: 5,
  nd: 6, ndz: 6, niedziela: 6, sun: 6, sunday: 6,
};

function validKey(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

/**
 * Days as local "YYYY-MM-DD" keys, counted from `today`: "dziś" "jutro" "pojutrze"
 * "wczoraj", a weekday ("pt" = the nearest Friday, today included), "12.10"
 * (this year), "12.10.2026", "2026-10-12", "+3d", "+2t" (weeks).
 */
export function dateFrom(today: string): Recognizer<string> {
  return (token) => {
    const t = fold(token);
    if (t in RELATIVE) return addDays(today, RELATIVE[t]!);
    if (t in WEEKDAYS) {
      const monday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return addDays(today, (WEEKDAYS[t]! - monday + 7) % 7);
    }
    let m = /^\+(\d{1,3})(d|t|w)?$/.exec(t);
    if (m) return addDays(today, Number(m[1]) * (m[2] === 't' || m[2] === 'w' ? 7 : 1));
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m) return validKey(Number(m[1]), Number(m[2]), Number(m[3]));
    m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/.exec(t);
    if (m) return validKey(m[3] ? Number(m[3]) : Number(today.slice(0, 4)), Number(m[2]), Number(m[1]));
    return undefined;
  };
}

/** One of a few words, in any case and with or without Polish letters. */
export function oneOf<T>(words: Readonly<Record<string, T>>): Recognizer<T> {
  const folded = new Map(Object.entries(words).map(([k, v]) => [fold(k), v]));
  return (token) => folded.get(fold(token));
}
