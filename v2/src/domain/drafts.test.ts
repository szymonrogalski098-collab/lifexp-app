import { describe, expect, test } from 'vitest';
import { activityDraftPayload, draftFromRaw, moneyDraftPayload } from './drafts';

const at = '2026-10-02T07:15:00.000Z';
const raw = (type: string, payload: unknown) => ({ id: 'd1', type, summary: 'Nauka — 45 min (~30 pkt)', payload, createdAtLocal: at });

describe('offline drafts as v1 writes them', () => {
  test('an activity', () => {
    expect(
      draftFromRaw(raw('activity', { type: 'learning', minutes: 45, desc: 'rozdział 3', ptsPerHour: 40, dateStr: '2026-10-02' })),
    ).toEqual({
      id: 'd1',
      summary: 'Nauka — 45 min (~30 pkt)',
      createdAt: new Date(at),
      kind: 'activity',
      type: 'learning',
      typeName: null,
      minutes: 45,
      desc: 'rozdział 3',
      pointsPerHour: 40,
      day: '2026-10-02',
    });
  });

  test("the generator's activity keeps its name", () => {
    const draft = draftFromRaw(
      raw('activity', { type: '__generated__', typeName: 'Spacer', minutes: 30, desc: '', ptsPerHour: 20, dateStr: '2026-10-02' }),
    );
    expect(draft).toMatchObject({ kind: 'activity', type: '__generated__', typeName: 'Spacer' });
  });

  test('a chore and a money transaction', () => {
    expect(
      draftFromRaw(
        raw('chore', { choreId: 'dishwasher', choreName: 'Zmywarka', choreEmoji: '🍽️', points: 15, oneTime: false, dateISO: '2026-10-02' }),
      ),
    ).toMatchObject({ kind: 'chore', choreId: 'dishwasher', name: 'Zmywarka', points: 15, oneTime: false, dateISO: '2026-10-02' });
    expect(
      draftFromRaw(raw('money_tx', { txType: 'expense', amount: 12.5, category: 'jedzenie', note: '', date: '2026-10-02' })),
    ).toMatchObject({ kind: 'money', txType: 'expense', grosze: 1250, category: 'jedzenie', date: '2026-10-02' });
  });

  test('gaming is recognised, so it can be discarded', () => {
    expect(draftFromRaw(raw('gaming', { game: 'Minecraft', minutes: 90, date: '2026-10-02' }))?.kind).toBe('gaming');
  });

  test('a known kind with data that does not read is never applied, only kept', () => {
    expect(draftFromRaw(raw('activity', { type: 'learning', minutes: '45' }))?.kind).toBe('other');
    expect(draftFromRaw(raw('money_tx', { txType: 'gift', amount: 5, category: 'x', date: '2026-10-02' }))?.kind).toBe('other');
    expect(draftFromRaw(raw('teleport', {}))?.kind).toBe('other');
  });

  test('not a queue entry at all', () => {
    expect(draftFromRaw(null)).toBeNull();
    expect(draftFromRaw({ type: 'activity' })).toBeNull();
  });
});

describe('drafts made in v2 read back as v1 drafts', () => {
  const entry = (type: string, payload: Record<string, unknown>) => ({ id: 'v2', type, summary: 's', payload, createdAtLocal: at });

  test('an activity, with and without a generated name', () => {
    const base = { type: 'learning', typeName: null, minutes: 45, desc: '', pointsPerHour: 40, day: '2026-10-02' };
    expect(activityDraftPayload(base)).toEqual({ type: 'learning', minutes: 45, desc: '', ptsPerHour: 40, dateStr: '2026-10-02' });
    expect(draftFromRaw(entry('activity', activityDraftPayload(base)))).toMatchObject({ kind: 'activity', ...base });
    const generated = { ...base, type: '__generated__', typeName: 'Spacer' };
    expect(draftFromRaw(entry('activity', activityDraftPayload(generated)))).toMatchObject({ typeName: 'Spacer' });
  });

  test('a money transaction in złoty', () => {
    const input = { txType: 'expense' as const, grosze: 1250, category: 'jedzenie', note: 'bułki', date: '2026-10-02' };
    expect(moneyDraftPayload(input)).toEqual({ txType: 'expense', amount: 12.5, category: 'jedzenie', note: 'bułki', date: '2026-10-02' });
    expect(draftFromRaw(entry('money_tx', moneyDraftPayload(input)))).toMatchObject({ kind: 'money', ...input });
  });
});
