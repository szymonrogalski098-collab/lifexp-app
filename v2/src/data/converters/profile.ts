// users/{uid} → Profile. Tolerates every shape found in production
// (docs/v2/INVENTORY.md): missing accountMode/enabledModules/lang, empty
// strings. Read-only: it never writes a "fixed" document back (PLAN.md 5.1).
import type { DocumentData } from 'firebase/firestore';
import type { Profile } from '@/domain/profile';

/** v1's name for a profile without one (index.html, core.js). */
export const DEFAULT_NAME = 'Użytkownik';

export function profileFromData(data: DocumentData): Profile {
  const name = typeof data.name === 'string' && data.name.trim() !== '' ? data.name : DEFAULT_NAME;
  return {
    name,
    email: typeof data.email === 'string' ? data.email : '',
    emailVerified: data.emailVerified === true,
    // v1 gates on `=== undefined` (core.js), so any stored value counts as chosen.
    accountModeChosen: data.accountMode !== undefined,
    modulesChosen: data.enabledModules !== undefined,
    lang: data.lang === 'pl' || data.lang === 'en' ? data.lang : null,
  };
}
