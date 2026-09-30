// Statistics (docs/v2/PLAN.md 9, stage 2c), read-only: the overview at #/stats
// and the full activity history at #/stats/history, one module with two views.
import type { RouteProps } from '@/lib/route-match';
import { t } from '@/i18n';
import { account } from '@/stores/session';
import { Page, Stack } from '@/ui/components/Layout';
import { ViewSwitch } from '@/ui/components/ViewSwitch';
import { HistoryView } from './HistoryView';
import { OverviewView } from './OverviewView';
import './stats.css';

export default function StatsModule({ path }: RouteProps) {
  const current = account.value;
  if (!current) return null;
  const onHistory = path === '/stats/history';

  return (
    <Page>
      <Stack>
        <ViewSwitch
          label={t('stats.views')}
          links={[
            { href: '#/stats', label: t('stats.overview'), current: !onHistory },
            { href: '#/stats/history', label: t('stats.history'), current: onHistory },
          ]}
        />
        {onHistory ? (
          <HistoryView uid={current.user.uid} />
        ) : (
          <OverviewView uid={current.user.uid} profile={current.profile} />
        )}
      </Stack>
    </Page>
  );
}
