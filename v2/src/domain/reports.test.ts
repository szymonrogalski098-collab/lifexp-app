import { describe, expect, it } from 'vitest';
import {
  adminActions,
  keywordProblem,
  reportsInTab,
  spamHoursLeft,
  staleSpam,
  availableBonus,
  bugProblem,
  isUnread,
  looksLikeSpam,
  reportedToday,
  sortReports,
  submitAllowance,
  type BugReport,
} from './reports';

const report = (patch: Partial<BugReport> = {}): BugReport => ({
  id: 'r1',
  reporterUid: 'u1',
  reporterName: 'Ola',
  title: 'Saldo',
  area: 'money',
  description: 'Saldo pokazuje złą kwotę',
  status: 'new',
  messages: [],
  createdAt: new Date('2026-10-01T10:00:00Z'),
  bonusGranted: false,
  bonusUsed: false,
  ...patch,
});

describe('bugProblem', () => {
  it('asks for a title, a place and a description, in that order', () => {
    expect(bugProblem({ title: ' ', area: '', description: '' })).toBe('titleRequired');
    expect(bugProblem({ title: 'Saldo', area: '', description: '' })).toBe('areaRequired');
    expect(bugProblem({ title: 'Saldo', area: 'money', description: '  ' })).toBe('descRequired');
    expect(bugProblem({ title: 'Saldo', area: 'money', description: 'Zła kwota' })).toBeNull();
  });
});

describe('looksLikeSpam', () => {
  it('is spam when none of the words is in the description, in any case', () => {
    expect(looksLikeSpam('Saldo POKAZUJE zero', ['pokazuje'])).toBe(false);
    expect(looksLikeSpam('hej hej', ['pokazuje', 'błąd'])).toBe(true);
  });

  it('is never spam without words', () => {
    expect(looksLikeSpam('hej', [])).toBe(false);
  });
});

describe('the daily report and the bonus', () => {
  const today = '2026-10-02';

  it('counts the calendar day of the last report, not 24 hours', () => {
    expect(reportedToday(null, today)).toBe(false);
    expect(reportedToday('2026-10-02T00:05:00.000Z', today)).toBe(true);
    expect(reportedToday('2026-10-01T23:59:00.000Z', today)).toBe(false);
  });

  it("takes an accepted report's unused bonus", () => {
    expect(availableBonus([report(), report({ id: 'r2', bonusGranted: true, bonusUsed: true })])).toBeNull();
    expect(availableBonus([report(), report({ id: 'r3', bonusGranted: true })])?.id).toBe('r3');
  });

  it("allows today's report, then a bonus, then nothing", () => {
    const bonus = report({ id: 'r3', bonusGranted: true });
    expect(submitAllowance('2026-10-01T09:00:00Z', today, [bonus])).toEqual({ ok: true, useBonus: null });
    expect(submitAllowance('2026-10-02T09:00:00Z', today, [bonus])).toEqual({ ok: true, useBonus: bonus });
    expect(submitAllowance('2026-10-02T09:00:00Z', today, [report()])).toEqual({ ok: false });
  });
});

describe('isUnread', () => {
  const fromAdmin = report({ messages: [{ text: 'Dzięki', isAdmin: true, at: '2026-10-02T10:00:00.000Z' }] });

  it("is unread for the reporter when the admin wrote last and this device has not seen it", () => {
    expect(isUnread(fromAdmin, undefined, false)).toBe(true);
    expect(isUnread(fromAdmin, '2026-10-02T09:00:00.000Z', false)).toBe(true);
    expect(isUnread(fromAdmin, '2026-10-02T10:00:00.000Z', false)).toBe(false);
  });

  it('is never unread for whoever wrote last, or without messages', () => {
    expect(isUnread(fromAdmin, undefined, true)).toBe(false);
    expect(isUnread(report(), undefined, false)).toBe(false);
  });
});

describe('sortReports', () => {
  it('lists the newest first and undated ones last', () => {
    const sorted = sortReports([
      report({ id: 'old', createdAt: new Date('2026-09-01') }),
      report({ id: 'none', createdAt: null }),
      report({ id: 'new', createdAt: new Date('2026-10-01') }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['new', 'old', 'none']);
  });
});

describe("the admin's side", () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);

  it('puts each status in its tab, accepted and rejected in History', () => {
    const all = [
      report({ id: 'n', status: 'new' }),
      report({ id: 's', status: 'spam' }),
      report({ id: 'p', status: 'postponed' }),
      report({ id: 'a', status: 'accepted' }),
      report({ id: 'r', status: 'rejected' }),
    ];
    expect(reportsInTab(all, 'new').map((r) => r.id)).toEqual(['n']);
    expect(reportsInTab(all, 'spam').map((r) => r.id)).toEqual(['s']);
    expect(reportsInTab(all, 'postponed').map((r) => r.id)).toEqual(['p']);
    expect(reportsInTab(all, 'history').map((r) => r.id)).toEqual(['a', 'r']);
  });

  it('counts the hours spam has left and finds spam past 12 hours', () => {
    expect(spamHoursLeft(report({ status: 'spam', createdAt: at(2.5) }), now)).toBe(10);
    expect(spamHoursLeft(report({ status: 'spam', createdAt: at(13) }), now)).toBe(0);
    const reports = [
      report({ id: 'old', status: 'spam', createdAt: at(13) }),
      report({ id: 'fresh', status: 'spam', createdAt: at(1) }),
      report({ id: 'kept', status: 'new', createdAt: at(30) }),
    ];
    expect(staleSpam(reports, now).map((r) => r.id)).toEqual(['old']);
  });

  it("offers v1's actions for each status", () => {
    expect(adminActions('spam')).toEqual(['rescue', 'delete']);
    expect(adminActions('new')).toEqual(['accept', 'reject', 'postpone', 'delete']);
    expect(adminActions('postponed')).toEqual(['accept', 'reject', 'delete']);
    expect(adminActions('accepted')).toEqual(['delete']);
  });

  it('takes a new word only', () => {
    expect(keywordProblem('  ', ['błąd'])).toBe('empty');
    expect(keywordProblem('BŁĄD', ['błąd'])).toBe('exists');
    expect(keywordProblem('saldo', ['błąd'])).toBeNull();
  });
});
