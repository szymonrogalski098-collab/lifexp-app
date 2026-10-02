import { describe, expect, it } from 'vitest';
import { broadcastProblem, broadcastSeconds, unseenBroadcasts, withSeen, type Broadcast } from './broadcasts';

const b = (id: string): Broadcast => ({ id, text: id, seconds: 5, createdAt: null });

describe('broadcastSeconds', () => {
  it("keeps v1's 1-30 seconds, 5 when missing or not a number", () => {
    expect(broadcastSeconds(12)).toBe(12);
    expect(broadcastSeconds(0)).toBe(5);
    expect(broadcastSeconds(undefined)).toBe(5);
    expect(broadcastSeconds('x')).toBe(5);
    expect(broadcastSeconds(90)).toBe(30);
    expect(broadcastSeconds(-3)).toBe(1);
  });
});

describe('unseenBroadcasts', () => {
  it('shows the ones not seen on this device, oldest first', () => {
    expect(unseenBroadcasts([b('c'), b('b'), b('a')], ['b']).map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('withSeen', () => {
  it('adds an id once and keeps the last 200', () => {
    expect(withSeen(['a'], 'a')).toEqual(['a']);
    const many = Array.from({ length: 200 }, (_, i) => `id${i}`);
    const after = withSeen(many, 'new');
    expect(after).toHaveLength(200);
    expect(after[0]).toBe('id1');
    expect(after[199]).toBe('new');
  });
});

describe('broadcastProblem', () => {
  it('needs some text', () => {
    expect(broadcastProblem('  ')).toBe('textRequired');
    expect(broadcastProblem('Nowa wersja!')).toBeNull();
  });
});
