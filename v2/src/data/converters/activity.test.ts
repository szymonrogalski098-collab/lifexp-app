import { Timestamp } from 'firebase/firestore';
import { describe, expect, test } from 'vitest';
import { activeDays, activityName } from '@/domain/activity';
import { activityDefName, activityFromData, dayLogFromData } from './activity';

describe('activity converters', () => {
  test('an activity as v1 writes it (desc is usually an empty string)', () => {
    const at = new Date('2026-09-29T08:00:00Z');
    expect(
      activityFromData('a1', { type: 'learning', duration: 60, points: 40, desc: '', timestamp: Timestamp.fromDate(at) }),
    ).toEqual({ id: 'a1', type: 'learning', typeName: null, desc: '', duration: 60, points: 40, at });
  });

  test('an entry without a timestamp is skipped', () => {
    expect(activityFromData('a2', { type: 'x', points: 5 })).toBeNull();
  });

  test('day logs default missing counters to 0', () => {
    expect(dayLogFromData({ pointsEarned: 95 })).toEqual({ pointsEarned: 95, gamingMinutes: 0 });
  });

  test('definitions without a name have none', () => {
    expect(activityDefName({ name: 'Nauka', icon: 'ti-book' })).toBe('Nauka');
    expect(activityDefName({ name: '' })).toBeNull();
  });
});

describe('activity names (v1 activityRowHTML)', () => {
  const base = { id: 'a', desc: '', duration: 30, points: 10, at: new Date() };
  const names = new Map([['learning', 'Nauka']]);

  test('saved name, then definition, then the raw id', () => {
    expect(activityName({ ...base, type: 'learning', typeName: 'Własna' }, names)).toBe('Własna');
    expect(activityName({ ...base, type: 'learning', typeName: null }, names)).toBe('Nauka');
    expect(activityName({ ...base, type: '__generated__', typeName: null }, names)).toBe('__generated__');
  });
});

describe('active days', () => {
  test('only days with points count', () => {
    const days = new Map([
      ['2026-09-29', { pointsEarned: 10, gamingMinutes: 0 }],
      ['2026-09-28', { pointsEarned: 0, gamingMinutes: 90 }],
    ]);
    expect(activeDays(days)).toEqual(new Set(['2026-09-29']));
  });
});
