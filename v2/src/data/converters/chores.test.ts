import { describe, expect, test } from 'vitest';
import { choreDefData, choreDefFromData, choreEntryFromData, newChoreEntryData } from './chores';

describe('chore converters', () => {
  test('a seeded definition as v1 writes it', () => {
    expect(
      choreDefFromData('room_deep', { name: 'Pokój (dokładnie)', emoji: '🧹', desc: '', points: 30, oneTime: false, order: 0 }),
    ).toEqual({ id: 'room_deep', name: 'Pokój (dokładnie)', desc: '', emoji: '🧹', points: 30, oneTime: false, order: 0 });
  });

  test('a definition is written back in the same shape, without its id', () => {
    const data = { name: 'Kwiaty', desc: 'salon', emoji: '🪴', points: 12, oneTime: true, order: 8 };
    expect(choreDefData(choreDefFromData('abc', data))).toEqual(data);
  });

  test('a definition missing fields gets v1-compatible defaults', () => {
    expect(choreDefFromData('x', {})).toEqual({ id: 'x', name: 'x', desc: '', emoji: '', points: 0, oneTime: false, order: 0 });
  });

  test('an entry keeps its own copy of the name and emoji', () => {
    expect(
      choreEntryFromData('e1', {
        choreId: 'trash_segregated',
        choreName: 'Śmieci',
        choreEmoji: '🗑️',
        points: 10,
        dateISO: '2026-09-30',
        monthKey: '2026-09',
      }),
    ).toEqual({
      id: 'e1',
      choreId: 'trash_segregated',
      name: 'Śmieci',
      emoji: '🗑️',
      points: 10,
      dateISO: '2026-09-30',
      monthKey: '2026-09',
      createdAt: null,
    });
  });

  test('a missing monthKey comes from the day', () => {
    expect(choreEntryFromData('e3', { choreId: 'a', points: 5, dateISO: '2026-08-31' })?.monthKey).toBe('2026-08');
  });

  test('a new entry is written in v1 addChore()\'s shape', () => {
    const now = new Date('2026-09-30T08:00:00Z');
    const def = { id: 'dishwasher', name: 'Zmywarka', desc: '', emoji: '🍽️', points: 15, oneTime: false, order: 7 };
    expect(newChoreEntryData(def, '2026-09-29', now)).toEqual({
      choreId: 'dishwasher',
      choreName: 'Zmywarka',
      choreEmoji: '🍽️',
      points: 15,
      dateISO: '2026-09-29',
      monthKey: '2026-09',
      createdAt: now,
    });
  });

  test('an entry without a day is skipped', () => {
    expect(choreEntryFromData('e2', { choreId: 'a', points: 5 })).toBeNull();
  });
});
