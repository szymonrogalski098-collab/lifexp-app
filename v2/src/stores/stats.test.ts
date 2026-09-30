import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Activity } from '@/domain/activity';

const activity = (n: number): Activity => ({
  id: `a${n}`,
  type: 'custom_type',
  typeName: null,
  desc: `wpis ${n}`,
  duration: 15,
  points: n,
  at: new Date('2026-09-30T10:00:00Z'),
});

// The data layer, replaced: pages come from `pages`, one per next() call.
const pages: { activities: Activity[]; hasMore: boolean }[] = [];
let failNext = false;
const next = vi.fn(() => {
  if (failNext) {
    failNext = false;
    return Promise.reject(new Error('offline'));
  }
  return Promise.resolve(pages.shift() ?? { activities: [], hasMore: false });
});
const stopNames = vi.fn();

vi.mock('@/data/repos/history', () => ({
  activityPager: () => ({ next }),
  countActivities: () => Promise.resolve(20),
}));
vi.mock('@/data/repos/today', () => ({
  watchActivityDefNames: (_uid: string, onChange: (names: Map<string, string>) => void) => {
    onChange(new Map([['custom_type', 'Własna']]));
    return stopNames;
  },
}));

const { history, openHistory } = await import('./stats');

/** Lets the dynamic imports and promise chains settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  pages.length = 0;
  failNext = false;
  next.mockClear();
  stopNames.mockClear();
});

let handle: ReturnType<typeof openHistory> | null = null;
afterEach(() => handle?.stop());

describe('history pages', () => {
  test('the first page on open, the next on request, appended in order', async () => {
    pages.push(
      { activities: [activity(1), activity(2)], hasMore: true },
      { activities: [activity(3)], hasMore: false },
    );
    handle = openHistory('uid');
    expect(history.value.loading).toBe(true);
    await settle();
    expect(history.value).toMatchObject({ loading: false, hasMore: true, failed: false, total: 20 });
    expect(history.value.activities.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(history.value.activityNames.get('custom_type')).toBe('Własna');

    handle.more();
    handle.more(); // ignored while the page is loading
    await settle();
    expect(next).toHaveBeenCalledTimes(2);
    expect(history.value.activities.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(history.value.hasMore).toBe(false);

    handle.more(); // nothing left
    await settle();
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('a failed page keeps what was loaded, and "more" retries it', async () => {
    pages.push({ activities: [activity(1)], hasMore: true }, { activities: [activity(2)], hasMore: false });
    handle = openHistory('uid');
    await settle();
    failNext = true;
    handle.more();
    await settle();
    expect(history.value).toMatchObject({ failed: true, loading: false });
    expect(history.value.activities).toHaveLength(1);

    handle.more();
    await settle();
    expect(history.value.failed).toBe(false);
    expect(history.value.activities.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  test('stop() ends the definitions listener', async () => {
    pages.push({ activities: [activity(1)], hasMore: false });
    handle = openHistory('uid');
    await settle();
    handle.stop();
    expect(stopNames).toHaveBeenCalledTimes(1);
    handle = null;
  });
});
