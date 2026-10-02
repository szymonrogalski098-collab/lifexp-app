// One report and its thread (v1 bug-item, opened in place there): when, where, what,
// and the messages between the reporter and the admin, newest at the bottom. Reading
// it marks the thread read on this device.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { BugReport } from '@/domain/reports';
import { BUG_REPLY_MAX } from '@/domain/reports';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';
import { areaLabel, StatusTag } from './labels';

interface ThreadSheetProps {
  open: boolean;
  report: BugReport;
  /** Whose side "mine" is: the admin's view or the reporter's. */
  viewerIsAdmin: boolean;
  onClose: () => void;
  onRead: (report: BugReport) => void;
  /** Returns whether a message was sent. */
  onReply: (text: string) => boolean;
  /** The admin's buttons for the report, below the thread. */
  actions?: ComponentChildren;
}

export function ThreadSheet({ open, report, viewerIsAdmin, onClose, onRead, onReply, actions }: ThreadSheetProps) {
  const [reply, setReply] = useState('');
  const lang = locale();
  const lastAt = report.messages[report.messages.length - 1]?.at;
  // Opened, or a new message arrived while it is open: read.
  useEffect(() => {
    if (open) onRead(report);
  }, [open, lastAt]);

  return (
    <Sheet open={open} onClose={onClose} title={report.title || t('reports.untitled')}>
      <div class="stack">
        <p class="reports-meta">
          {[
            viewerIsAdmin && report.reporterName ? report.reporterName : null,
            areaLabel(report.area),
            report.createdAt ? formatShortDate(report.createdAt, lang) : null,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          <StatusTag status={report.status} admin={viewerIsAdmin} />
        </p>
        {report.bonusGranted && <p class="reports-note">{t('reports.bonusGranted')}</p>}
        <p class="reports-desc user-text">{report.description}</p>

        <section class="reports-thread" aria-label={t('reports.thread')}>
          {report.messages.length === 0 ? (
            <p class="reports-note">{t('reports.noMessages')}</p>
          ) : (
            <ol class="reports-messages">
              {report.messages.map((m, i) => {
                const mine = m.isAdmin === viewerIsAdmin;
                return (
                  <li key={`${m.at}-${i}`} class={`reports-message${mine ? ' reports-message--mine' : ''}`}>
                    <span class="reports-message__who">
                      {mine ? t('reports.you') : m.isAdmin ? t('reports.admin') : report.reporterName || t('reports.reporter')}
                    </span>
                    <span class="reports-message__text user-text">{m.text}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <form
          class="reports-reply"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (onReply(reply)) setReply('');
          }}
        >
          <TextField
            label={t('reports.reply')}
            value={reply}
            onInput={setReply}
            placeholder={t('reports.replyPh')}
            maxLength={BUG_REPLY_MAX}
          />
          <Button type="submit" variant="primary" disabled={!reply.trim()}>
            {t('reports.sendReply')}
          </Button>
        </form>
        {actions}
      </div>
    </Sheet>
  );
}
