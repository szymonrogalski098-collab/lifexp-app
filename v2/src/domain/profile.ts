// What v2 needs to know about the signed-in person. Grows module by module;
// everything here is read from users/{uid} through data/converters/profile.ts.

export type Language = 'pl' | 'en';

/** The Firebase Auth side of the account. */
export interface SessionUser {
  uid: string;
  email: string;
  displayName: string | null;
  /** Firebase trusts Google accounts; email+password accounts verify with a code in v1. */
  emailVerified: boolean;
}

/** users/{uid} as v2 reads it. */
export interface Profile {
  name: string;
  email: string;
  emailVerified: boolean;
  /** v1 asks solo/supervised once (accountMode); until then the account is not set up. */
  accountModeChosen: boolean;
  /** v1's first-run module survey (enabledModules) is done. */
  modulesChosen: boolean;
  lang: Language | null;
}
