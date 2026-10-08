// The parent's e-mail on a supervised account (v1 settings.js, "na razie jak v1";
// docs/v2/PLAN.md 9, stage 4): a 6-digit code goes to the address, and the address
// counts once the code is typed back within 10 minutes. The weekly report goes only
// to a verified address.

/** v1: Date.now() + 10 * 60 * 1000. */
export const PARENT_CODE_TTL_MS = 10 * 60 * 1000;

export type ParentEmailState =
  | { kind: 'none' }
  /** A code was sent to this address and waits to be typed. */
  | { kind: 'pending'; email: string }
  | { kind: 'verified'; email: string }
  /** Saved before v1 verified addresses: not trusted until verified again. */
  | { kind: 'unverified'; email: string };

/** v1 updateParentEmailUI(), in its order: a pending code wins. */
export function parentEmailState(profile: {
  parentEmail: string;
  parentEmailVerifiedAt: string | null;
  pendingParentEmail: string | null;
}): ParentEmailState {
  if (profile.pendingParentEmail) return { kind: 'pending', email: profile.pendingParentEmail };
  if (profile.parentEmail && profile.parentEmailVerifiedAt) return { kind: 'verified', email: profile.parentEmail };
  if (profile.parentEmail) return { kind: 'unverified', email: profile.parentEmail };
  return { kind: 'none' };
}

/** v1 /\S+@\S+\.\S+/ on the trimmed address. */
export function parentEmailProblem(email: string): 'invalid' | null {
  return /\S+@\S+\.\S+/.test(email.trim()) ? null : 'invalid';
}

/** v1: Math.floor(100000 + Math.random() * 900000), six digits. */
export function newParentCode(random: () => number = Math.random): string {
  return Math.floor(100000 + random() * 900000).toString();
}

export interface StoredCode {
  pendingParentEmail: string | null;
  parentEmailCode: string | null;
  /** ms since epoch. */
  parentEmailCodeExpiry: number | null;
}

export type CodeProblem = 'noPending' | 'expired' | 'invalid';

/** v1 verifyParentEmailCode(), its checks in its order, on the server's copy of the code. */
export function parentCodeProblem(input: string, stored: StoredCode, now: number): CodeProblem | null {
  if (!stored.parentEmailCode || !stored.pendingParentEmail) return 'noPending';
  if (stored.parentEmailCodeExpiry === null || now > stored.parentEmailCodeExpiry) return 'expired';
  return input.trim() === stored.parentEmailCode ? null : 'invalid';
}
