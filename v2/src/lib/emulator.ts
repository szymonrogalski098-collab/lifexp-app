// Firebase emulator switch — the same rule as v1's firebase-config.js, so a test
// that signs in through v1 lands in v2 on the same emulators: only on localhost,
// turned on by ?emulator=1 and remembered for the tab in sessionStorage.
// In production it can never be enabled.

export interface EmulatorTarget {
  host: string;
  authPort: number;
  firestorePort: number;
  projectId: string;
}

export const EMULATOR_FLAG_KEY = 'lifexp-emulator';

const TARGET: EmulatorTarget = { host: '127.0.0.1', authPort: 9099, firestorePort: 8080, projectId: 'demo-lifexp' };

interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emulatorTarget(hostname: string, search: string, storage: FlagStorage | null): EmulatorTarget | null {
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return null;
  if (!storage) return null;
  try {
    if (new URLSearchParams(search).has('emulator')) storage.setItem(EMULATOR_FLAG_KEY, '1');
    return storage.getItem(EMULATOR_FLAG_KEY) === '1' ? TARGET : null;
  } catch {
    return null;
  }
}
