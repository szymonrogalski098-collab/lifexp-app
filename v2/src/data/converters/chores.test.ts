import { describe, expect, test } from 'vitest';
import { choreDefFromData, choreEntryFromData } from './chores';

describe('chore converters', () => {
  test('a seeded definition as v1 writes it', () => {
    expect(
      choreDefFromData('room_deep', { name: 'Pokój (dokładnie)', emoji: '🧹', desc: '', points: 30, oneTime: false, order: 0 }),
    ).toEqual({ id: 'room_deep', name: 'Pokój (dokładnie)', emoji: '🧹', points: 30, oneTime: false, order: 0 });
  });

  test('a definition missing fields gets v1-compatible defaults', () => {
    expect(choreDefFromData('x', {})).toEqual({ id: 'x', name: 'x', emoji: '', points: 0, oneTime: false, order: 0 });
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
    ).toEqual({ id: 'e1', choreId: 'trash_segregated', name: 'Śmieci', emoji: '🗑️', points: 10, dateISO: '2026-09-30' });
  });

  test('an entry without a day is skipped', () => {
    expect(choreEntryFromData('e2', { choreId: 'a', points: 5 })).toBeNull();
  });
});
