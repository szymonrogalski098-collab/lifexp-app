// Live users/{uid}: one listener for the whole session (PLAN.md 4.5), the two
// writes the streak and the badges need (stage 3e), each a transaction on the
// server's profile so two tabs record a freeze or a badge once, and the plain
// settings fields (stage 4), written as v1 settings.js writes them.
import { deleteField, doc, onSnapshot, runTransaction, updateDoc } from 'firebase/firestore';
import type { AccountMode, Language, Profile } from '@/domain/profile';
import { isFreezeAvailable } from '@/domain/streak';
import { profileFromData } from '../converters/profile';
import { db } from '../firebase';

/** `null` = the document does not exist (v1 creates it on its next start). */
export function watchProfile(
  uid: string,
  onChange: (profile: Profile | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => onChange(snap.exists() ? profileFromData(snap.data()) : null),
    onError,
  );
}

/**
 * G3: the freeze bridges a gap today (UTC day `day`). Recorded only while the
 * server's profile still has it available; resolves to whether it wrote.
 */
export function recordStreakFreeze(uid: string, day: string, now: Date): Promise<boolean> {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const lastUsed: unknown = (await tx.get(ref)).data()?.streakFreezeLastUsed;
    if (!isFreezeAvailable(typeof lastUsed === 'string' ? lastUsed : null, now)) return false;
    tx.update(ref, { streakFreezeLastUsed: day });
    return true;
  });
}

/** G4: the badges added after the ones the server has, in the order given; resolves to the ids added. */
export function addAchievements(uid: string, ids: readonly string[]): Promise<string[]> {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const raw: unknown = (await tx.get(ref)).data()?.achievements;
    const held = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    const added = ids.filter((id) => !held.includes(id));
    if (added.length > 0) tx.update(ref, { achievements: [...held, ...added] });
    return added;
  });
}

/** users/{uid} fields Settings changes, under v1's names and types. */
export interface SettingsFields {
  name?: string;
  dailyLimit?: number;
  lang?: Language;
  pointsRateGeneralZl?: number;
  pointsRateGeneralPts?: number;
  pointsRateChoresZl?: number;
  pointsRateChoresPts?: number;
  enabledModules?: string[];
  disabledModules?: string[];
  /** v1 saveOnboarding() sets it with the survey. */
  onboardingDone?: boolean;
  accountMode?: AccountMode;
}

/** One update of the given fields; others stay as they are. Queued offline like any write. */
export function updateSettings(uid: string, fields: SettingsFields): Promise<void> {
  return updateDoc(doc(db, 'users', uid), { ...fields });
}

/**
 * v1 setAccountMode() going solo with a parent linked: solo means solo, so the
 * parent's e-mail, its verification and the weekly report go (the rules give the
 * parent access only through parentEmail). One update, as in v1.
 */
export function goSoloUnlinkingParent(uid: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid), {
    accountMode: 'solo',
    autoReport: false,
    parentEmail: '',
    parentEmailVerifiedAt: deleteField(),
    pendingParentEmail: deleteField(),
    parentEmailCode: deleteField(),
    parentEmailCodeExpiry: deleteField(),
  });
}
