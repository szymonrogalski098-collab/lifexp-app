// Bug reports (v1 bug-reports.js; docs/v2/PLAN.md 9, stage 4): sending one within the
// daily limit or with a bonus, classified against the admin's words, and replying in
// its thread. Single writes: the screen goes on and reports a failed `saved`.
import {
  addReportMessage,
  deleteReport,
  getSpamKeywords,
  saveSpamKeywords,
  setReportStatus,
  submitReport,
} from '@/data/repos/reports';
import type { Profile } from '@/domain/profile';
import {
  BUG_REPLY_MAX,
  DEFAULT_SPAM_KEYWORDS,
  bugProblem,
  keywordProblem,
  looksLikeSpam,
  staleSpam,
  submitAllowance,
  type AdminAction,
  type BugDraft,
  type BugProblem,
  type BugReport,
  type BugStatus,
  type KeywordProblem,
} from '@/domain/reports';
import { utcDayKey } from '@/lib/dates';

/** v1 loadBugKeywords(): the admin's words, else v1's default list (also when the server cannot be asked). */
export async function loadSpamKeywords(): Promise<readonly string[]> {
  try {
    return (await getSpamKeywords()) ?? DEFAULT_SPAM_KEYWORDS;
  } catch {
    return DEFAULT_SPAM_KEYWORDS;
  }
}

export type SendReportResult =
  | { ok: true; spam: boolean; saved: Promise<void> }
  | { ok: false; problem: BugProblem | 'rateLimited' };

/** v1 submitBugReport(). `mine` are the person's reports (for a bonus), `keywords` the spam filter's words. */
export function sendReport(
  uid: string,
  profile: Profile,
  draft: BugDraft,
  mine: readonly BugReport[],
  keywords: readonly string[],
  now = new Date(),
): SendReportResult {
  const problem = bugProblem(draft);
  if (problem) return { ok: false, problem };
  const allowance = submitAllowance(profile.lastBugReportAt, utcDayKey(now), mine);
  if (!allowance.ok) return { ok: false, problem: 'rateLimited' };
  const description = draft.description.trim();
  const spam = looksLikeSpam(description, keywords);
  const saved = submitReport({
    uid,
    reporterName: profile.name,
    title: draft.title.trim(),
    area: draft.area,
    description,
    status: spam ? 'spam' : 'new',
    bonusReportId: allowance.useBonus?.id ?? null,
    now,
  });
  return { ok: true, spam, saved };
}

/** v1 sendBugReply(): a message in the report's thread; empty text sends nothing. */
export function replyToReport(id: string, text: string, isAdmin: boolean, now = new Date()): Promise<void> | null {
  const trimmed = text.trim().slice(0, BUG_REPLY_MAX);
  if (!trimmed) return null;
  return addReportMessage(id, { text: trimmed, isAdmin, at: now.toISOString() });
}

// ── The admin's side ──

const STATUS_AFTER: Record<Exclude<AdminAction, 'delete'>, BugStatus> = {
  accept: 'accepted',
  reject: 'rejected',
  postpone: 'postponed',
  rescue: 'new',
};

/** v1's admin buttons: a new status (accepting also grants the bonus), or the report deleted. */
export function actOnReport(id: string, action: AdminAction): Promise<void> {
  return action === 'delete' ? deleteReport(id) : setReportStatus(id, STATUS_AFTER[action]);
}

/** v1 loadAdminBugReports(): spam nobody rescued within 12 hours is deleted when the admin looks. */
export async function deleteStaleSpam(reports: readonly BugReport[], now = new Date()): Promise<number> {
  const stale = staleSpam(reports, now);
  await Promise.all(stale.map((r) => deleteReport(r.id).catch(() => undefined)));
  return stale.length;
}

/**
 * v1 loadBugKeywords() for the admin: the list, and the default list written down when
 * there is none yet (only the admin may write it).
 */
export async function loadKeywordsAsAdmin(): Promise<readonly string[]> {
  const words = await getSpamKeywords();
  if (words) return words;
  await saveSpamKeywords(DEFAULT_SPAM_KEYWORDS).catch(() => undefined);
  return DEFAULT_SPAM_KEYWORDS;
}

/** v1 addBugKeyword(). Resolves to the new list. */
export function addKeyword(
  word: string,
  words: readonly string[],
): { ok: true; words: string[]; saved: Promise<void> } | { ok: false; problem: KeywordProblem } {
  const problem = keywordProblem(word, words);
  if (problem) return { ok: false, problem };
  const next = [...words, word.trim()];
  return { ok: true, words: next, saved: saveSpamKeywords(next) };
}

/** v1 deleteBugKeyword() (there after asking; here with undo, D8). */
export function removeKeyword(word: string, words: readonly string[]): { words: string[]; saved: Promise<void>; undo: () => Promise<void> } {
  const next = words.filter((w) => w !== word);
  return { words: next, saved: saveSpamKeywords(next), undo: () => saveSpamKeywords(words) };
}
