// How a report's place and status read on screen.
import type { BugStatus } from '@/domain/reports';
import { BUG_AREAS } from '@/domain/reports';
import { t } from '@/i18n';

export function areaLabel(area: string): string {
  return (BUG_AREAS as readonly string[]).includes(area)
    ? t(`reports.areas.${area as (typeof BUG_AREAS)[number]}`)
    : t('reports.areas.other');
}

const TONE: Record<BugStatus, string> = {
  new: 'accent',
  spam: 'neutral',
  accepted: 'positive',
  rejected: 'negative',
  postponed: 'neutral',
};

/** The reporter sees spam as "under review" (v1 statusReview); the admin as spam. */
export function StatusTag({ status, admin }: { status: BugStatus; admin: boolean }) {
  const key = status === 'spam' ? (admin ? 'spam' : 'review') : status;
  return <span class={`reports-status reports-status--${TONE[status]}`}>{t(`reports.statuses.${key}`)}</span>;
}
