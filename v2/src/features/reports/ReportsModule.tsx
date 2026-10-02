// Zgłoszenia (v1 #page-report-bug; docs/v2/PLAN.md 9, stage 4): send a bug report
// (one a day, one more for each accepted report), and follow your reports and their
// threads with the admin. What a report becomes is the admin's (stage 4e).
import { Bug, MessageCircle } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { submitAllowance, isUnread, sortReports, type BugDraft, type BugReport } from '@/domain/reports';
import { locale, t } from '@/i18n';
import { formatShortDate, utcDayKey } from '@/lib/dates';
import { loadSpamKeywords, replyToReport, sendReport } from '@/services/reports';
import { markRead, myReports, readMarks, watchMyReportsState } from '@/stores/reports';
import { account } from '@/stores/session';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { EmptyState, IconTile, Skeleton } from '@/ui/components/Display';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import { areaLabel, StatusTag } from './labels';
import { ReportSheet } from './ReportSheet';
import { ThreadSheet } from './ThreadSheet';
import './reports.css';

export default function ReportsModule() {
  const current = account.value;
  const uid = current?.user.uid;
  const [form, setForm] = useState({ open: false, key: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<readonly string[] | null>(null);
  const lastToast = useRef<number | null>(null);
  useEffect(() => (uid ? watchMyReportsState(uid) : undefined), [uid]);
  useEffect(() => {
    void loadSpamKeywords().then(setKeywords);
  }, []);

  if (!current || !uid) return null;
  const { profile } = current;
  const { reports, failed } = myReports.value;
  const mine = reports ? sortReports(reports) : undefined;
  const allowance = submitAllowance(profile.lastBugReportAt, utcDayKey(new Date()), mine ?? []);
  const lang = locale();

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const saveFailed = () => notify({ message: t('reports.saveFailed'), tone: 'negative' });

  const send = (draft: BugDraft) => {
    const result = sendReport(uid, profile, draft, mine ?? [], keywords ?? []);
    if (!result.ok) {
      if (result.problem === 'rateLimited') {
        notify({ message: t('reports.rateLimited'), tone: 'negative' });
        setForm((f) => ({ ...f, open: false }));
        return null;
      }
      return result.problem;
    }
    result.saved.catch(saveFailed);
    setForm((f) => ({ ...f, open: false }));
    notify({ message: t('reports.sent'), tone: 'positive' });
    return null;
  };

  const opened = mine?.find((r) => r.id === openId);

  return (
    <Page>
      <Stack>
        <Card>
          <div class="reports-new">
            <IconTile>
              <Bug />
            </IconTile>
            <div class="reports-new__text">
              <p class="reports-new__title">{t('reports.newTitle')}</p>
              <p class="reports-note">
                {!allowance.ok
                  ? t('reports.limitReached')
                  : allowance.useBonus
                    ? t('reports.bonusAvailable')
                    : t('reports.newHint')}
              </p>
            </div>
          </div>
          <div class="reports-new__action">
            <Button
              variant="primary"
              block
              disabled={!allowance.ok || !mine || keywords === null}
              onClick={() => setForm((f) => ({ open: true, key: f.key + 1 }))}
            >
              {t('reports.newTitle')}
            </Button>
          </div>
        </Card>

        <Section title={t('reports.mine')}>
          <Card padding={mine && mine.length > 0 ? 'none' : 'md'}>
            {!mine ? (
              failed ? (
                <p class="reports-problem" role="alert">
                  {t('reports.loadFailed')}
                </p>
              ) : (
                <Skeleton lines={3} />
              )
            ) : mine.length === 0 ? (
              <EmptyState title={t('reports.none')} />
            ) : (
              <ul class="reports-list" aria-label={t('reports.mine')}>
                {mine.map((r) => (
                  <ReportRow key={r.id} report={r} lang={lang} onOpen={() => setOpenId(r.id)} />
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </Stack>

      {form.key > 0 && (
        <ReportSheet key={form.key} open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} onSend={send} />
      )}
      {opened && (
        <ThreadSheet
          open={openId !== null}
          report={opened}
          viewerIsAdmin={false}
          onClose={() => setOpenId(null)}
          onRead={markRead}
          onReply={(text) => {
            const saved = replyToReport(opened.id, text, false);
            if (!saved) return false;
            saved.catch(saveFailed);
            return true;
          }}
        />
      )}
    </Page>
  );
}

function ReportRow({ report, lang, onOpen }: { report: BugReport; lang: string; onOpen: () => void }) {
  const unread = isUnread(report, readMarks.value[report.id], false);
  return (
    <li class="reports-list__item">
      <button type="button" class="reports-list__row" onClick={onOpen}>
        <span class="reports-list__text">
          <span class="reports-list__title user-text">{report.title}</span>
          <span class="reports-list__meta">
            {[areaLabel(report.area), report.createdAt ? formatShortDate(report.createdAt, lang) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {unread && (
            <span class="reports-unread">
              <MessageCircle aria-hidden="true" />
              {t('reports.unread')}
            </span>
          )}
        </span>
        <StatusTag status={report.status} admin={false} />
      </button>
    </li>
  );
}
