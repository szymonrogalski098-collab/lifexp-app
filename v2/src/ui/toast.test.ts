import { beforeEach, describe, expect, test } from 'vitest';
import { dismissToast, showToast, toastDuration, toasts } from './toast';

describe('toast queue', () => {
  beforeEach(() => {
    toasts.value = [];
  });

  test('toasts queue in order and leave by id', () => {
    const a = showToast({ message: 'a' });
    const b = showToast({ message: 'b' });
    expect(toasts.value.map((t) => t.message)).toEqual(['a', 'b']);
    dismissToast(a);
    expect(toasts.value.map((t) => t.id)).toEqual([b]);
  });

  test('time on screen: longer with an action or an error, overridable', () => {
    expect(toastDuration({ message: 'x' })).toBe(4000);
    expect(toastDuration({ message: 'x', tone: 'negative' })).toBe(6000);
    expect(toastDuration({ message: 'x', action: { label: 'Cofnij', onAction: () => {} } })).toBe(7000);
    expect(toastDuration({ message: 'x', durationMs: 1000 })).toBe(1000);
  });
});
