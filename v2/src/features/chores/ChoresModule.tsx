// Chores (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8): the month at #/chores and the list
// of chores at #/chores/defs, one module with two views. Opening it gives an account
// without a single definition v1's list (v1 ensureChoreDefsSeeded).
import { useEffect } from 'preact/hooks';
import { choresRate } from '@/domain/chores';
import { t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { ensureChoreDefs } from '@/services/chores';
import { chores as choresState, watchChores } from '@/stores/chores';
import { account } from '@/stores/session';
import { Skeleton } from '@/ui/components/Display';
import { Card, Page, Stack } from '@/ui/components/Layout';
import { ViewSwitch } from '@/ui/components/ViewSwitch';
import { DefsView } from './DefsView';
import { MonthView } from './MonthView';
import './chores.css';

export default function ChoresModule({ path, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchChores(uid) : undefined), [uid]);
  // Offline it cannot tell an empty account from an empty cache: it tries again next time.
  useEffect(() => {
    if (uid) ensureChoreDefs(uid).catch(() => {});
  }, [uid]);

  if (!current || !uid) return null;

  const { defs, entries, payouts, failed } = choresState.value;
  const onDefs = path === '/chores/defs';
  const rate = choresRate(current.profile.rateChores.zloty, current.profile.rateChores.points);

  return (
    <Page>
      <Stack>
        <ViewSwitch
          label={t('chores.views')}
          links={[
            { href: '#/chores', label: t('chores.overview'), current: !onDefs },
            { href: '#/chores/defs', label: t('chores.defsView'), current: onDefs },
          ]}
        />
        {failed && (
          <p class="chores-error" role="alert">
            {t('chores.loadFailed')}
          </p>
        )}
        {!defs || !entries ? (
          <Card>
            <Skeleton lines={5} />
          </Card>
        ) : onDefs ? (
          <DefsView uid={uid} defs={defs} />
        ) : (
          <MonthView
            uid={uid}
            rate={rate}
            defs={defs}
            entries={entries}
            payouts={payouts}
            path={path}
            navigate={navigate}
          />
        )}
      </Stack>
    </Page>
  );
}
