// What the app shows before any module screen: the boot gates of v1 (core.js),
// read-only. Whatever v1 does by writing to the profile (creating it, marking the
// e-mail verified, the account-mode step, the module survey) happens in v1, so
// v2 hands those cases over to it (docs/v2/PLAN.md 9.1, stage 1e).
import type { Profile, SessionUser } from '@/domain/profile';
import type { Session } from '@/stores/session';

export type Gate =
  | { kind: 'boot' }
  | { kind: 'failed'; signedIn: boolean }
  | { kind: 'login' }
  /** E-mail+password account without the code from v1's verify.html. */
  | { kind: 'verify'; email: string }
  /** No profile yet, or v1's account-mode step or module survey not done. */
  | { kind: 'finishSetup' }
  | { kind: 'ready'; user: SessionUser; profile: Profile };

export function sessionGate(session: Session): Gate {
  switch (session.status) {
    case 'loading':
      return { kind: 'boot' };
    case 'failed':
      return { kind: 'failed', signedIn: false };
    case 'signedOut':
      return { kind: 'login' };
    case 'signedIn': {
      const { user, profile } = session;
      if (profile === 'loading') return { kind: 'boot' };
      if (profile === 'error') return { kind: 'failed', signedIn: true };
      if (profile === null) return { kind: 'finishSetup' };
      // v1 trusts either flag; when only Auth has it, v1 copies it on its next start.
      if (!profile.emailVerified && !user.emailVerified) return { kind: 'verify', email: user.email };
      if (!profile.accountModeChosen || !profile.modulesChosen) return { kind: 'finishSetup' };
      return { kind: 'ready', user, profile };
    }
  }
}
