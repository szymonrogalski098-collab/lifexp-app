/** 12450 → "12 450" (pl) / "12,450" (en): whole numbers such as points. */
export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** Minutes → whole hours and the rest, for "1 h 5 min"-style labels (v1 formatMinutes). */
export function splitMinutes(minutes: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
