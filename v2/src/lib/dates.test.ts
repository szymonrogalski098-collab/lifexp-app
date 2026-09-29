import { describe, expect, test } from 'vitest';
import { addDays, formatWeekdayShort, localDayKey, utcDayKey, weekOf } from './dates';

describe('day keys', () => {
  test('the UTC day is v1 todayStr: after 22:00 UTC it is already tomorrow in Poland, not in UTC', () => {
    expect(utcDayKey(new Date('2026-09-29T23:30:00Z'))).toBe('2026-09-29');
  });

  test('the local day follows the device', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  test('adding days crosses months, years and leap days', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28'); // DST change in Europe: still one day
  });

  test('a week runs Monday to Sunday', () => {
    expect(weekOf('2026-09-29')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weekOf('2026-10-04')[0]).toBe('2026-09-28'); // Sunday belongs to the week before
  });

  test('weekday names do not depend on the time zone', () => {
    expect(formatWeekdayShort('2026-09-28', 'en-GB')).toBe('Mon');
  });
});
