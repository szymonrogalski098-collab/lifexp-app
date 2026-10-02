// What the app shows before any module screen: the boot gates of v1 (core.js).
// Creating the profile and verifying the e-mail still happen in v1, so v2 hands
// those over to it (docs/v2/PLAN.md 9.1, stage 1e); the account-mode step and the
// module survey v2 asks itself (stage 4b), in v1's order.
import type { Profile, SessionUser } from '@/domain/profile';
import type { Session } from '@/stores/session';

export type Gate =
  | { kind: 'boot' }
  | { kind: 'failed'; signedIn: boolean }
  | { kind: 'login' }
  /** E-mail+password account without the code from v1's verify.html. */
  | { kind: 'verify'; email: string }
  /** No profile yet: v1 creates it. */
  | { kind: 'finishSetup' }
  /** v1's account-mode step, then its module survey, not done yet. */
  | { kind: 'setup'; step: 'accountMode' | 'modules'; user: SessionUser; profile: Profile }
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
      if (!profile.accountModeChosen) return { kind: 'setup', step: 'accountMode', user, profile };
      if (!profile.modulesChosen) return { kind: 'setup', step: 'modules', user, profile };
      return { kind: 'ready', user, profile };
    }
  }
}
