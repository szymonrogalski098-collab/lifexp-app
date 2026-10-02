// Zgłoszenia i aktualizacje (v1's bug hub; docs/v2/PLAN.md 9, stage 4): the bug
// reports, the admin's messages to everyone (admin only) and the history of updates,
// three views of one screen.
import { useEffect } from 'preact/hooks';
import { t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { admin, checkAdmin } from '@/stores/admin';
import { account } from '@/stores/session';
import { Page, Stack } from '@/ui/components/Layout';
import { ViewPanel, ViewSwitch } from '@/ui/components/ViewSwitch';
import { BroadcastsView } from './BroadcastsView';
import { ReportsView } from './ReportsView';
import { UpdatesView } from './UpdatesView';
import './reports.css';

export default function ReportsModule({ path }: RouteProps) {
  const uid = account.value?.user.uid;
  useEffect(() => {
    if (uid) checkAdmin(uid);
  }, [uid]);
  const isAdmin = admin.value.uid === uid && admin.value.isAdmin === true;

  const view = path === '/reports/updates' ? 'updates' : path === '/reports/broadcasts' && isAdmin ? 'broadcasts' : 'reports';
  const links = [
    { href: '#/reports', label: t('reports.viewReports'), current: view === 'reports' },
    ...(isAdmin ? [{ href: '#/reports/broadcasts', label: t('reports.viewBroadcasts'), current: view === 'broadcasts' }] : []),
    { href: '#/reports/updates', label: t('reports.viewUpdates'), current: view === 'updates' },
  ];

  return (
    <Page>
      <Stack>
        <ViewSwitch label={t('reports.views')} links={links} />
        <ViewPanel index={links.findIndex((l) => l.current)}>
          {view === 'updates' ? <UpdatesView /> : view === 'broadcasts' ? <BroadcastsView /> : <ReportsView />}
        </ViewPanel>
      </Stack>
    </Page>
  );
}
