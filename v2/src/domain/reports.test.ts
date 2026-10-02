import { describe, expect, it } from 'vitest';
import {
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
