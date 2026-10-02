// bugReports/{id} ↔ BugReport (v1 bug-reports.js). createdAt is a Timestamp, the
// messages' times ISO strings (docs/v2/PLAN.md 5.3); anything else is read leniently.
import type { DocumentData } from 'firebase/firestore';
import type { BugMessage, BugReport, BugStatus } from '@/domain/reports';
import { dateOrNull, stringOr } from './fields';

const STATUSES: readonly BugStatus[] = ['new', 'spam', 'accepted', 'rejected', 'postponed'];

function messageFromData(value: unknown): BugMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.text !== 'string') return null;
  return { text: data.text, isAdmin: data.isAdmin === true, at: stringOr(data.at) };
}

export function bugReportFromData(id: string, data: DocumentData): BugReport {
  const status = STATUSES.includes(data.status) ? (data.status as BugStatus) : 'new';
  return {
    id,
    reporterUid: stringOr(data.reporterUid),
    reporterName: stringOr(data.reporterName),
    title: stringOr(data.title),
    area: stringOr(data.area, 'other'),
    description: stringOr(data.description),
    status,
    messages: Array.isArray(data.messages) ? data.messages.flatMap((m: unknown) => messageFromData(m) ?? []) : [],
    createdAt: dateOrNull(data.createdAt),
    bonusGranted: data.bonusGranted === true,
    bonusUsed: data.bonusUsed === true,
  };
}

/** A new report as v1 submitBugReport() writes it. */
export function newBugReportData(input: {
  reporterUid: string;
  reporterName: string;
  title: string;
  area: string;
  description: string;
  status: 'new' | 'spam';
  now: Date;
}): DocumentData {
  const { reporterUid, reporterName, title, area, description, status, now } = input;
  return { reporterUid, reporterName, title, area, description, status, messages: [], createdAt: now };
}
