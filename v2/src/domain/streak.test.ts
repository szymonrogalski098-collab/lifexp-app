import { describe, expect, test } from 'vitest';
import { addDays } from '@/lib/dates';
import { calculateStreak, frozenDay, isFreezeAvailable } from './streak';

const TODAY = '2026-09-29';

/** "✓✓·✓" → active days from today (D0) backwards, as in the GOLDEN.md G3 table. */
function days(pattern: string): Set<string> {
  return new Set([...pattern].flatMap((mark, i) => (mark === '✓' ? [addDays(TODAY, -i)] : [])));
}

describe('G3 streak', () => {
  test.each([
    ['G3.1', '✓✓✓··', false, 3, false],
    ['G3.2', '·✓✓··', false, 2, false],
    ['G3.3', '✓·✓✓·', true, 3, true],
    ['G3.4', '✓·✓✓·', false, 1, false],
    ['G3.5', '··✓✓·', true, 0, false],
    ['G3.6', '✓·✓·✓', true, 2, true],
  ])('%s: %s, freeze available %s → %i days, freeze used %s', (_case, pattern, freeze, expected, used) => {
    expect(calculateStreak(days(pattern), TODAY, freeze)).toEqual({ days: expected, freezeUsed: used, newFreeze: used });
  });

  test('no activity at all', () => {
    expect(calculateStreak(new Set(), TODAY, true)).toEqual({ days: 0, freezeUsed: false, newFreeze: false });
  });

  test('a long streak across a month boundary', () => {
    expect(calculateStreak(days('✓'.repeat(40)), TODAY, false).days).toBe(40);
  });
});

describe('streak freeze availability', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  test('never used, or used more than 7 days ago: available', () => {
    expect(isFreezeAvailable(null, now)).toBe(true);
    expect(isFreezeAvailable('2026-09-21', now)).toBe(true);
  });

  test('used within the last 7 days: not available', () => {
    expect(isFreezeAvailable('2026-09-29', now)).toBe(false);
    expect(isFreezeAvailable('2026-09-23', now)).toBe(false);
  });
});

describe('a used freeze keeps bridging its gap (v2; v1 loses it on the next render)', () => {
  test('G3.3 after the freeze was recorded today: still 3 days, nothing new to record', () => {
    const active = days('✓·✓✓·');
    const frozen = frozenDay(active, TODAY);
    expect(frozen).toBe(addDays(TODAY, -1));
    expect(calculateStreak(active, TODAY, false, frozen)).toEqual({ days: 3, freezeUsed: true, newFreeze: false });
    // What v1 shows on its next render: the gap is not bridged any more.
    expect(calculateStreak(active, TODAY, false).days).toBe(1);
  });

  test('used yesterday before any points today: the same gap, found from the day before', () => {
    const active = days('✓✓·✓✓');
    expect(frozenDay(active, addDays(TODAY, -1))).toBe(addDays(TODAY, -2));
    expect(calculateStreak(active, TODAY, false, addDays(TODAY, -2)).days).toBe(4);
  });

  test('a week later the freeze is back for a second gap; the first stays bridged', () => {
    const active = days('✓·✓✓✓✓✓✓✓·✓');
    const frozen = addDays(TODAY, -9);
    expect(calculateStreak(active, TODAY, true, frozen)).toEqual({ days: 9, freezeUsed: true, newFreeze: true });
  });

  test('no streak on the day it was used: nothing was bridged', () => {
    expect(frozenDay(days('···✓'), addDays(TODAY, -1))).toBeNull();
    expect(frozenDay(days('✓✓'), null)).toBeNull();
  });
});
