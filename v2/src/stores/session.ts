// Who is signed in and their profile, for the whole app (PLAN.md 4.5). Firebase
// is loaded after the first paint (its own chunk), so the boot screen shows at once.
import { computed, signal } from '@preact/signals';
import type { Profile, SessionUser } from '@/domain/profile';

export type ProfileState = Profile | null | 'loading' | 'error';

export type Session =
  | { status: 'loading' }
  /** Firebase could not even load (offline on a first visit, missing chunk). */
  | { status: 'failed' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: SessionUser; profile: ProfileState };

export const session = signal<Session>({ status: 'loading' });

/** The signed-in person with a loaded profile; null otherwise. Module screens only render then. */
export const account = computed(() => {
  const current = session.value;
  if (current.status !== 'signedIn' || typeof current.profile !== 'object' || current.profile === null) return null;
  return { user: current.user, profile: current.profile };
});

export async function startSession(): Promise<void> {
  let modules;
  try {
    modules = await Promise.all([import('@/data/auth'), import('@/data/repos/profile')]);
  } catch {
    session.value = { status: 'failed' };
    return;
  }
  const [{ watchAuth }, { watchProfile }] = modules;
  let stopProfile: (() => void) | null = null;

  watchAuth((user) => {
    stopProfile?.();
    stopProfile = null;
    if (!user) {
      session.value = { status: 'signedOut' };
      return;
    }
    const setProfile = (profile: ProfileState) => {
      const current = session.value;
      if (current.status === 'signedIn' && current.user.uid === user.uid) session.value = { ...current, profile };
    };
    session.value = { status: 'signedIn', user, profile: 'loading' };
    stopProfile = watchProfile(user.uid, setProfile, () => setProfile('error'));
  });
}
