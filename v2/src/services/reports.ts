// Bug reports (v1 bug-reports.js; docs/v2/PLAN.md 9, stage 4): sending one within the
// daily limit or with a bonus, classified against the admin's words, and replying in
// its thread. Single writes: the screen goes on and reports a failed `saved`.
import { addReportMessage, getSpamKeywords, submitReport } from '@/data/repos/reports';
import type { Profile } from '@/domain/profile';
import {
  BUG_REPLY_MAX,
  DEFAULT_SPAM_KEYWORDS,
  bugProblem,
  looksLikeSpam,
  submitAllowance,
  type BugDraft,
  type BugProblem,
  type BugReport,
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
