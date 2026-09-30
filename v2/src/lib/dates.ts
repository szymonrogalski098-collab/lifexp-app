// Calendar days as "YYYY-MM-DD" keys (docs/v2/GOLDEN.md G13). v1 uses two
// calendars and v2 keeps both until migration M4: the UTC day (dailyLog, streak,
// daily limit — v1's todayStr) and the local day (chores, tasks — dateISOLocal).
// Keys never go through Date parsing in local time, so they cannot shift.

/** v1's `todayStr()`: the UTC calendar date. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** v1's `dateISOLocal()`: the calendar date on this device. */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function keyToUtcDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** The key `days` calendar days after (or before, if negative) `key`. */
export function addDays(key: string, days: number): string {
  const date = keyToUtcDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDayKey(date);
}

/** Monday … Sunday of the week that contains `key`. */
export function weekOf(key: string): string[] {
  const mondayOffset = (keyToUtcDate(key).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(key, i - mondayOffset));
}

/** "pon." / "Mon" for a day key, independent of the device's time zone. */
export function formatWeekdayShort(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(keyToUtcDate(key));
}

/** "wtorek" / "Tuesday" for a day key, independent of the device's time zone. */
export function formatWeekdayLong(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(keyToUtcDate(key));
}

/** "wtorek, 29 września" for a day key, independent of the device's time zone. */
export function formatDayKey(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    keyToUtcDate(key),
  );
}

/** "wtorek, 29 września" for the device's current day. */
export function formatLongDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/** "12 wrz" — the day of a moment, as a person on this device sees it. */
export function formatShortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}
