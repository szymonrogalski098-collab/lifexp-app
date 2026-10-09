// Ex-us command parsing (docs/v2/PLAN.md 6.3): "/zadanie Kupić mleko jutro M" →
// the command and its arguments, in any order. Each slot of a command has a type
// with a recognizer; the most specific slots take their tokens first and whatever
// is left becomes the one text slot. Missing slots are not an error here: the
// preview card is an editable form that shows what is missing.

export interface Tokenized {
  /** "zadanie" for "/zadanie …"; null when the text is not a command. */
  command: string | null;
  /** Positional tokens, quotes removed, in order. */
  tokens: string[];
  /** `key=value` arguments (keys lower-case). */
  named: Record<string, string>;
  /** `--flag` arguments (lower-case, without dashes). */
  flags: string[];
}

const QUOTES: Record<string, string> = { '"': '"', '„': '”', '“': '”', '«': '»' };
const UNIT = /^(zł|zl|pln|pkt)$/i;
const DIGITS = /^\d+([.,]\d+)?$/;

/** Splits on whitespace, keeping quoted parts ("…", „…”) together. */
function split(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) break;
    let token = '';
    while (i < text.length && !/\s/.test(text[i]!)) {
      const close = QUOTES[text[i]!];
      if (close) {
        const end = text.indexOf(close, i + 1);
        if (end > i) {
          token += text.slice(i + 1, end);
          i = end + 1;
          continue;
        }
      }
      token += text[i];
      i++;
    }
    out.push(token);
  }
  return out;
}

/**
 * "12 zł" → "12zł", "1 500 PLN" → "1500PLN": a unit written apart sticks to its
 * number, and thousands groups stick together when a unit follows them.
 */
function joinUnits(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let j = i;
    let joined = tokens[i]!;
    if (/^\d{1,3}$/.test(joined)) {
      let k = i + 1;
      let groups = joined;
      while (k < tokens.length && /^\d{3}([.,]\d{1,2})?$/.test(tokens[k]!)) groups += tokens[k++];
      if (k > i + 1 && k < tokens.length && UNIT.test(tokens[k]!)) {
        joined = groups;
        j = k - 1;
      }
    }
    if (DIGITS.test(joined) && j + 1 < tokens.length && UNIT.test(tokens[j + 1]!)) {
      joined += tokens[j + 1];
      j++;
    }
    out.push(joined);
    i = j;
  }
  return out;
}

export function tokenize(input: string): Tokenized {
  const text = input.trim();
  const parts = split(text);
  let command: string | null = null;
  if (parts[0]?.startsWith('/')) command = parts.shift()!.slice(1).toLowerCase() || null;
  const named: Record<string, string> = {};
  const flags: string[] = [];
  const rest: string[] = [];
  for (const part of parts) {
    const kv = /^([\p{L}][\p{L}\d_-]*)=(.*)$/u.exec(part);
    if (kv) named[kv[1]!.toLowerCase()] = kv[2]!;
    else if (/^--[\p{L}\d-]+$/u.test(part)) flags.push(part.slice(2).toLowerCase());
    else if (part) rest.push(part);
  }
  return { command, tokens: joinUnits(rest), named, flags };
}

// ── Slot filling ──

export type SlotType = 'enum' | 'date' | 'duration' | 'money' | 'points' | 'number' | 'entity' | 'text';

/** A token → its value, or undefined when it is not one. */
export type Recognizer<T> = (token: string) => T | undefined;

export interface SlotDef<T = unknown> {
  name: string;
  type: SlotType;
  required: boolean;
  /** Not used for the text slot. */
  recognize?: Recognizer<T>;
}

/** Most specific first: a date never ends up as part of a task's text. */
const SPECIFICITY: readonly SlotType[] = ['enum', 'date', 'duration', 'money', 'points', 'number', 'entity', 'text'];

export function fillSlots(tokens: readonly string[], slots: readonly SlotDef[]): Record<string, unknown> {
  const used = new Set<number>();
  const out: Record<string, unknown> = {};
  const ordered = [...slots].sort((a, b) => SPECIFICITY.indexOf(a.type) - SPECIFICITY.indexOf(b.type));
  for (const slot of ordered) {
    if (slot.type === 'text' || !slot.recognize) continue;
    for (let j = 0; j < tokens.length; j++) {
      if (used.has(j)) continue;
      const value = slot.recognize(tokens[j]!);
      if (value !== undefined) {
        used.add(j);
        out[slot.name] = value;
        break;
      }
    }
  }
  const text = slots.find((s) => s.type === 'text');
  if (text) {
    const rest = tokens.filter((_, i) => !used.has(i)).join(' ');
    if (rest) out[text.name] = rest;
  }
  return out;
}

/** The required slots `args` has no value for: what the card marks as missing. */
export function missingSlots(slots: readonly SlotDef[], args: Record<string, unknown>): string[] {
  return slots.filter((s) => s.required && args[s.name] === undefined).map((s) => s.name);
}
