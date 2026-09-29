import { describe, expect, test } from 'vitest';
import { EMULATOR_FLAG_KEY, emulatorTarget } from './emulator';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('emulator switch', () => {
  test('production hosts never use the emulator, whatever the URL says', () => {
    const storage = memoryStorage({ [EMULATOR_FLAG_KEY]: '1' });
    expect(emulatorTarget('szymonrogalski098-collab.github.io', '?emulator=1', storage)).toBeNull();
  });

  test('localhost needs ?emulator=1 once, then remembers it for the tab', () => {
    const storage = memoryStorage();
    expect(emulatorTarget('localhost', '', storage)).toBeNull();
    expect(emulatorTarget('localhost', '?emulator=1', storage)?.projectId).toBe('demo-lifexp');
    expect(emulatorTarget('127.0.0.1', '', storage)?.authPort).toBe(9099);
  });

  test('blocked storage means no emulator', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(emulatorTarget('localhost', '?emulator=1', throwing)).toBeNull();
    expect(emulatorTarget('localhost', '?emulator=1', null)).toBeNull();
  });
});
