// Money as integer grosze (docs/v2/PLAN.md 4.6): 12,50 zł = 1250. Floats never
// hold amounts, so 0.1 + 0.2 problems cannot creep into balances. Converting to
// v1's złoty numbers happens at the Firestore boundary, not here.

const GROSZE_PER_ZLOTY = 100;

/**
 * What a person typed into an amount field → grosze, or null if it is not a
 * valid non-negative amount with at most two decimals.
 * Accepts "12", "12,5", "12.50", "1 234,56" (spaces and NBSP as thousands separators).
 */
export function parseMoneyInput(text: string): number | null {
  const compact = text.replace(/[\s\u00a0\u202f]/g, '').replace(/zł$/i, '');
  const match = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(compact);
  if (!match) return null;
  const zloty = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const grosze = zloty * GROSZE_PER_ZLOTY + Number(fraction);
  return Number.isSafeInteger(grosze) ? grosze : null;
}

/** 1250 → "12,50" — the editable form of an amount (no currency, no grouping). */
export function formatMoneyInput(grosze: number): string {
  const sign = grosze < 0 ? '-' : '';
  const abs = Math.abs(grosze);
  const zloty = Math.floor(abs / GROSZE_PER_ZLOTY);
  const rest = String(abs % GROSZE_PER_ZLOTY).padStart(2, '0');
  return `${sign}${zloty},${rest}`;
}

/** 123456 → "1234,56 zł" in Polish, "PLN 1,234.56" in English. */
export function formatMoney(grosze: number, locale = 'pl-PL', currency = 'PLN'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(grosze / GROSZE_PER_ZLOTY);
}

/** v1 stores złoty as numbers (e.g. 12.5); this is the only way in. */
export function groszeFromZloty(zloty: number): number {
  return Math.round(zloty * GROSZE_PER_ZLOTY);
}

/** …and the only way back out, for writes v1 must read. */
export function zlotyFromGrosze(grosze: number): number {
  return grosze / GROSZE_PER_ZLOTY;
}
