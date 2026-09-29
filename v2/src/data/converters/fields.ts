// Field readers shared by the converters. Firestore data from v1 is loosely typed
// (docs/v2/INVENTORY.md: int and float for the same field, empty strings, missing
// fields), so every value is checked once here and never trusted downstream.
import { Timestamp } from 'firebase/firestore';

/** A finite number, or `fallback` for anything else (missing, string, NaN). */
export function numberOr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A finite number, or null. */
export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A string, or `fallback`. */
export function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** A non-empty string, or null (v1 stores "" for "none"). */
export function nonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** A "YYYY-MM-DD" day key, or null. */
export function dayKeyOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** A Firestore Timestamp (or v1's rare ISO string) as a Date, or null. */
export function dateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
