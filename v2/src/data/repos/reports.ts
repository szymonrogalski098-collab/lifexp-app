// Top-level bugReports and bugReportsConfig/keywords (v1 bug-reports.js; stage 4).
// The rules let the reporter read their own reports and add messages or use a bonus;
// everything else is the admin's.
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { BugMessage, BugReport, BugStatus } from '@/domain/reports';
import { bugReportFromData, newBugReportData } from '../converters/reports';
import { db } from '../firebase';

type OnError = (error: unknown) => void;

const reports = () => collection(db, 'bugReports');

/** The person's own reports, live (v1 loadMyBugReports, there read once). */
export function watchMyReports(uid: string, onChange: (reports: BugReport[]) => void, onError: OnError): () => void {
  return onSnapshot(
    query(reports(), where('reporterUid', '==', uid)),
    (snap) => onChange(snap.docs.map((d) => bugReportFromData(d.id, d.data()))),
    onError,
  );
}

/** The admin's words, or null when the document does not exist yet (v1 then uses its default list). */
export async function getSpamKeywords(): Promise<string[] | null> {
  const snap = await getDoc(doc(db, 'bugReportsConfig', 'keywords'));
  if (!snap.exists()) return null;
  const words: unknown = snap.data().words;
  return Array.isArray(words) ? words.filter((w): w is string => typeof w === 'string') : [];
}

export interface SubmitReportInput {
  uid: string;
  reporterName: string;
  title: string;
  area: string;
  description: string;
  status: 'new' | 'spam';
  /** An accepted report whose extra report this one uses; null = today's report. */
  bonusReportId: string | null;
  now: Date;
}

/**
 * v1 submitBugReport(): the report, and either the day's report marked used
 * (users.lastBugReportAt) or the bonus spent. One batch here, so the report never
 * goes without its count (v1 writes them one after another).
 */
export function submitReport(input: SubmitReportInput): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(reports()), newBugReportData({ ...input, reporterUid: input.uid }));
  if (input.bonusReportId) batch.update(doc(reports(), input.bonusReportId), { bonusUsed: true });
  else batch.update(doc(db, 'users', input.uid), { lastBugReportAt: input.now.toISOString() });
  return batch.commit();
}

/** A message added to the thread with arrayUnion, so two replies at once both stay (B13; v1 rewrites the array). */
export function addReportMessage(id: string, message: BugMessage): Promise<void> {
  return updateDoc(doc(reports(), id), { messages: arrayUnion({ ...message }) });
}

// ── The admin's side (the rules allow these to the admin only) ──

/** Every report, live (v1 loadAdminBugReports, there read on each visit). */
export function watchAllReports(onChange: (reports: BugReport[]) => void, onError: OnError): () => void {
  return onSnapshot(reports(), (snap) => onChange(snap.docs.map((d) => bugReportFromData(d.id, d.data()))), onError);
}

/** v1 bugAdminAccept/Reject/Postpone/Rescue: the status, and the bonus with an acceptance. */
export function setReportStatus(id: string, status: BugStatus): Promise<void> {
  return updateDoc(doc(reports(), id), status === 'accepted' ? { status, bonusGranted: true } : { status });
}

/** v1 bugAdminDelete(). */
export function deleteReport(id: string): Promise<void> {
  return deleteDoc(doc(reports(), id));
}

/** v1 addBugKeyword/deleteBugKeyword: the whole list. */
export function saveSpamKeywords(words: readonly string[]): Promise<void> {
  return setDoc(doc(db, 'bugReportsConfig', 'keywords'), { words: [...words] });
}
