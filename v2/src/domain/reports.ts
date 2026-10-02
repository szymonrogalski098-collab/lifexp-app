// Bug reports (v1 bug-reports.js; docs/v2/PLAN.md 9, stage 4): one a day, plus one
// more for each accepted report; a report whose description has none of the admin's
// words goes to Spam; a thread of messages per report. Top-level `bugReports`, so
// the admin sees everyone's.

/** v1 BUG_AREAS, in v1's order. */
export const BUG_AREAS = ['dashboard', 'money', 'chores', 'history', 'stats', 'settings', 'other'] as const;
export type BugArea = (typeof BUG_AREAS)[number];

export type BugStatus = 'new' | 'spam' | 'accepted' | 'rejected' | 'postponed';

/** v1 input#bug-title and textarea#bug-desc maxlength, and the reply box. */
export const BUG_TITLE_MAX = 80;
export const BUG_DESC_MAX = 400;
export const BUG_REPLY_MAX = 500;

/** v1 BUG_SPAM_TTL_MS: spam nobody rescued goes after 12 hours. */
export const BUG_SPAM_TTL_MS = 12 * 60 * 60 * 1000;

/** v1's list when bugReportsConfig/keywords does not exist yet. */
export const DEFAULT_SPAM_KEYWORDS: readonly string[] = [
  'błąd',
  'nie działa',
  'bug',
  'error',
  'powinno',
  'pokazuje',
  'strona',
  'zakładka',
  'przycisk',
  'punkty',
  'saldo',
  'zapis',
  'wyświetla',
  'crash',
  'literówka',
];

export interface BugMessage {
  text: string;
  /** Written by the admin; otherwise by the person who reported. */
  isAdmin: boolean;
  /** ISO time, as v1 writes it. */
  at: string;
}

export interface BugReport {
  id: string;
  reporterUid: string;
  reporterName: string;
  title: string;
  area: string;
  description: string;
  status: BugStatus;
  messages: readonly BugMessage[];
  /** null when missing. */
  createdAt: Date | null;
  /** Accepted: gives the reporter one more report beyond the daily one. */
  bonusGranted: boolean;
  bonusUsed: boolean;
}

export interface BugDraft {
  title: string;
  area: BugArea | '';
  description: string;
}

export type BugProblem = 'titleRequired' | 'areaRequired' | 'descRequired';

/** v1 submitBugReport(): a title, a place and a description, in that order. */
export function bugProblem(draft: BugDraft): BugProblem | null {
  if (!draft.title.trim()) return 'titleRequired';
  if (!draft.area) return 'areaRequired';
  if (!draft.description.trim()) return 'descRequired';
  return null;
}

/** v1 bugLooksLikeSpam(): none of the words in the description (any case); no words, no spam. */
export function looksLikeSpam(description: string, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return false;
  const text = description.toLowerCase();
  return !keywords.some((word) => text.includes(word.toLowerCase()));
}

/** v1 bugReportedToday(): the calendar day of the last report (UTC, as v1 todayStr) is today. */
export function reportedToday(lastBugReportAt: string | null, todayUtc: string): boolean {
  return lastBugReportAt !== null && lastBugReportAt.slice(0, 10) === todayUtc;
}

/** v1 bugAvailableBonus(): an accepted report whose extra report is not used yet. */
export function availableBonus(mine: readonly BugReport[]): BugReport | null {
  return mine.find((r) => r.bonusGranted && !r.bonusUsed) ?? null;
}

export type SubmitAllowance = { ok: true; useBonus: BugReport | null } | { ok: false };

/** v1 isBugSubmitBlocked(): today's report is used and no bonus is left. A bonus is spent only once today's is. */
export function submitAllowance(lastBugReportAt: string | null, todayUtc: string, mine: readonly BugReport[]): SubmitAllowance {
  if (!reportedToday(lastBugReportAt, todayUtc)) return { ok: true, useBonus: null };
  const bonus = availableBonus(mine);
  return bonus ? { ok: true, useBonus: bonus } : { ok: false };
}

/** v1 bugIsUnread(): the last message is from the other side and came after what this device saw. */
export function isUnread(report: BugReport, seenAt: string | undefined, viewerIsAdmin: boolean): boolean {
  const last = report.messages[report.messages.length - 1];
  if (!last || last.isAdmin === viewerIsAdmin) return false;
  return !seenAt || last.at > seenAt;
}

/** Newest first, as v1 lists them; a report without a date last. */
export function sortReports(reports: readonly BugReport[]): BugReport[] {
  return [...reports].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}
