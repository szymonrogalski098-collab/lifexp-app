// Zgłoszenia, the admin's view (v1 "Panel admina"): every report by tab (new, spam,
// postponed, history), each opened in its thread with v1's buttons; spam nobody
// rescued goes after 12 hours, checked when the admin looks; and the spam filter's
// words. A deletion is asked first: a report cannot be restored (only its reporter
// may create it, firestore.rules).
import { MessageCircle } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ADMIN_TABS,
  adminActions,
  isUnread,
  reportsInTab,
  sortReports,
  spamHoursLeft,
  type AdminAction,
  type AdminTab,
  type BugReport,
  type KeywordProblem,
} from '@/domain/reports';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { actOnReport, addKeyword, deleteStaleSpam, loadKeywordsAsAdmin, removeKeyword, replyToReport } from '@/services/reports';
import { allReports, markRead, readMarks, watchAllReportsState } from '@/stores/reports';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState, Skeleton } from '@/ui/components/Display';
import { SegmentedControl, TextField } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';
import { areaLabel, StatusTag } from './labels';
import { ThreadSheet } from './ThreadSheet';

const ACTION_TOAST: Record<AdminAction, 'reports.didAccept' | 'reports.didReject' | 'reports.didPostpone' | 'reports.didRescue' | 'reports.didDelete'> = {
  accept: 'reports.didAccept',
  reject: 'reports.didReject',
  postpone: 'reports.didPostpone',
  rescue: 'reports.didRescue',
  delete: 'reports.didDelete',
};

function Keywords({ notify, failed }: { notify: (input: ToastInput) => void; failed: () => void }) {
  const [words, setWords] = useState<readonly string[] | null>(null);
  const [word, setWord] = useState('');
  const [problem, setProblem] = useState<KeywordProblem | null>(null);
  useEffect(() => {
    void loadKeywordsAsAdmin()
      .then(setWords)
      .catch(() => setWords([]));
  }, []);

  if (!words) return <Skeleton lines={2} />;
  const add = () => {
    const result = addKeyword(word, words);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    result.saved.catch(failed);
    setWords(result.words);
    setWord('');
    notify({ message: t('reports.keywordAdded'), tone: 'positive' });
  };
  const remove = (w: string) => {
    const result = removeKeyword(w, words);
    result.saved.catch(failed);
    setWords(result.words);
    notify({
      message: t('reports.keywordDeleted', { word: w }),
      action: {
        label: t('ui.undo'),
        onAction: () => {
          setWords(words);
          void result.undo().catch(failed);
        },
      },
    });
  };

  return (
    <div class="stack">
      <p class="reports-note">{t('reports.keywordsInfo')}</p>
      <ul class="reports-keywords" aria-label={t('reports.keywordsTitle')}>
        {words.map((w) => (
          <li key={w} class="reports-keyword">
            <span class="user-text">{w}</span>
            <button type="button" class="reports-keyword__remove" onClick={() => remove(w)} aria-label={t('reports.keywordRemoveNamed', { word: w })}>
              {t('settings.delete')}
            </button>
          </li>
        ))}
      </ul>
      <form
        class="reports-reply"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextField
          label={t('reports.keywordNew')}
          value={word}
          onInput={(value) => {
            setWord(value);
            setProblem(null);
          }}
          maxLength={40}
          error={problem === 'exists' ? t('reports.keywordExists') : problem === 'empty' ? t('reports.keywordEmpty') : null}
        />
        <Button type="submit" variant="secondary">
          {t('reports.keywordAdd')}
        </Button>
      </form>
    </div>
  );
}

export function AdminReportsView() {
  const [tab, setTab] = useState<AdminTab>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BugReport | null>(null);
  const lastToast = useRef<number | null>(null);
  /** Stale spam already sent for deletion, so each goes once (the first answer may come from the cache). */
  const cleaned = useRef(new Set<string>());
  const lang = locale();
  useEffect(() => watchAllReportsState(), []);

  const { reports, failed: loadFailed } = allReports.value;
  // As v1 does when the panel loads: whatever spam is past 12 hours goes.
  useEffect(() => {
    if (!reports) return;
    const fresh = reports.filter((r) => !cleaned.current.has(r.id));
    for (const r of fresh) cleaned.current.add(r.id);
    void deleteStaleSpam(fresh);
  }, [reports]);

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const failed = () => notify({ message: t('reports.saveFailed'), tone: 'negative' });

  const act = (report: BugReport, action: AdminAction) => {
    if (action === 'delete') {
      setDeleting(report);
      return;
    }
    actOnReport(report.id, action).catch(failed);
    notify({ message: t(ACTION_TOAST[action]), tone: 'positive' });
  };

  const sorted = reports ? sortReports(reports) : undefined;
  const shown = sorted ? reportsInTab(sorted, tab) : undefined;
  const opened = sorted?.find((r) => r.id === openId);
  const now = new Date();

  return (
    <Stack>
      <SegmentedControl<AdminTab>
        label={t('reports.adminTabs')}
        value={tab}
        options={ADMIN_TABS.map((id) => ({
          value: id,
          label: sorted ? `${t(`reports.tabs.${id}`)} (${reportsInTab(sorted, id).length})` : t(`reports.tabs.${id}`),
        }))}
        onChange={setTab}
      />
      <Card padding={shown && shown.length > 0 ? 'none' : 'md'}>
        {!shown ? (
          loadFailed ? (
            <p class="reports-problem" role="alert">
              {t('reports.loadFailed')}
            </p>
          ) : (
            <Skeleton lines={3} />
          )
        ) : shown.length === 0 ? (
          <EmptyState title={t('reports.noneInTab')} />
        ) : (
          <ul class="reports-list" aria-label={t(`reports.tabs.${tab}`)}>
            {shown.map((r) => (
              <li key={r.id} class="reports-list__item">
                <button type="button" class="reports-list__row" onClick={() => setOpenId(r.id)}>
                  <span class="reports-list__text">
                    <span class="reports-list__title user-text">{r.title}</span>
                    <span class="reports-list__meta user-text">
                      {[r.reporterName, areaLabel(r.area), r.createdAt ? formatShortDate(r.createdAt, lang) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {r.status === 'spam' && (
                      <span class="reports-list__meta">{t('reports.spamExpires', { h: spamHoursLeft(r, now) })}</span>
                    )}
                    {isUnread(r, readMarks.value[r.id], true) && (
                      <span class="reports-unread">
                        <MessageCircle aria-hidden="true" />
                        {t('reports.unread')}
                      </span>
                    )}
                  </span>
                  <StatusTag status={r.status} admin />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Section title={t('reports.keywordsTitle')}>
        <Card>
          <Keywords notify={notify} failed={failed} />
        </Card>
      </Section>

      {opened && (
        <ThreadSheet
          open={openId !== null}
          report={opened}
          viewerIsAdmin
          onClose={() => setOpenId(null)}
          onRead={markRead}
          onReply={(text) => {
            const saved = replyToReport(opened.id, text, true);
            if (!saved) return false;
            saved.catch(failed);
            return true;
          }}
          actions={
            <div class="reports-actions">
              {adminActions(opened.status).map((action) => (
                <Button
                  key={action}
                  variant={action === 'accept' ? 'primary' : action === 'delete' ? 'quiet' : 'secondary'}
                  onClick={() => act(opened, action)}
                >
                  {t(`reports.actions.${action}`)}
                </Button>
              ))}
            </div>
          }
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={t('reports.confirmDelete')}
        body={deleting?.title ?? ''}
        confirmLabel={t('settings.delete')}
        danger
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          setOpenId(null);
          if (!target) return;
          actOnReport(target.id, 'delete').catch(failed);
          notify({ message: t('reports.didDelete') });
        }}
        onCancel={() => setDeleting(null)}
      />
    </Stack>
  );
}
