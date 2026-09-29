import { describe, expect, test } from 'vitest';
import { dragProgress, FLICK_VELOCITY, releaseVelocity, settlesOpen } from './gesture';

describe('dragProgress', () => {
  test('follows the finger 1:1 relative to the drawer width', () => {
    expect(dragProgress(0, 160, 320)).toBe(0.5);
    expect(dragProgress(1, -80, 320)).toBe(0.75);
  });

  test('stays within closed..open', () => {
    expect(dragProgress(0, -50, 320)).toBe(0);
    expect(dragProgress(1, 50, 320)).toBe(1);
  });

  test('a zero-width drawer does not move', () => {
    expect(dragProgress(0.3, 100, 0)).toBe(0.3);
  });
});

describe('releaseVelocity', () => {
  test('uses only the last 100 ms of the drag', () => {
    const samples = [
      { pos: 0, t: 0 },
      { pos: 10, t: 400 }, // slow start…
      { pos: 20, t: 450 },
      { pos: 60, t: 500 }, // …fast finish: (60 - 10) / 100
    ];
    expect(releaseVelocity(samples)).toBeCloseTo(0.5);
  });

  test('no movement or no samples means no velocity', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ pos: 5, t: 10 }])).toBe(0);
  });
});

describe('settlesOpen', () => {
  test('a slow drag settles on the side of 50 %', () => {
    expect(settlesOpen(0.49, 0)).toBe(false);
    expect(settlesOpen(0.5, 0)).toBe(true);
    expect(settlesOpen(0.8, -0.1)).toBe(true);
  });

  test('a flick wins over position', () => {
    expect(settlesOpen(0.1, FLICK_VELOCITY)).toBe(true);
    expect(settlesOpen(0.9, -FLICK_VELOCITY)).toBe(false);
  });
});
