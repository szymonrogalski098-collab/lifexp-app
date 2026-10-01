// Money (docs/v2/PLAN.md 9, stage 3c): the overview at #/money, loans at
// #/money/loans and the limit and categories at #/money/settings, one module with
// three views. Opening it prepares the account as v1's
// loadMoney() does (settings and balance documents, starting categories, M2).
import { useEffect } from 'preact/hooks';
import { t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { prepareMoney } from '@/services/money';
import { money as moneyState, watchMoney } from '@/stores/money';
import { account } from '@/stores/session';
import { Skeleton } from '@/ui/components/Display';
import { Card, Page, Stack } from '@/ui/components/Layout';
import { ViewSwitch } from '@/ui/components/ViewSwitch';
import { LoansView } from './LoansView';
import { OverviewView } from './OverviewView';
import { SettingsView } from './SettingsView';
import './money.css';

export default function MoneyModule({ path, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  const incomeCounted = current ? current.profile.moneyIncomeAllTime !== null : true;
  useEffect(() => (uid ? watchMoney(uid) : undefined), [uid]);
  // Offline it cannot check the server: it tries again next time.
  useEffect(() => {
    if (uid) prepareMoney(uid, incomeCounted).catch(() => {});
  }, [uid]);

  if (!current || !uid) return null;

  const { txs, categories, limit, loans, balance, failed } = moneyState.value;
  const view = path === '/money/loans' ? 'loans' : path === '/money/settings' ? 'settings' : 'overview';
  const ready =
    view === 'loans'
      ? loans !== undefined && balance !== undefined
      : view === 'settings'
        ? categories !== undefined && limit !== undefined
        : txs !== undefined && categories !== undefined && limit !== undefined && balance !== undefined;

  return (
    <Page>
      <Stack>
        <ViewSwitch
          label={t('money.views')}
          links={[
            { href: '#/money', label: t('money.overview'), current: view === 'overview' },
            { href: '#/money/loans', label: t('money.loans'), current: view === 'loans' },
            { href: '#/money/settings', label: t('money.settings'), current: view === 'settings' },
          ]}
        />
        {failed && (
          <p class="money-error" role="alert">
            {t('money.loadFailed')}
          </p>
        )}
        {!ready ? (
          <Card>
            <Skeleton lines={5} />
          </Card>
        ) : view === 'loans' ? (
          <LoansView uid={uid} loans={loans ?? []} balance={balance ?? 0} />
        ) : view === 'settings' ? (
          <SettingsView uid={uid} categories={categories ?? []} limit={limit ?? 0} />
        ) : (
          <OverviewView
            uid={uid}
            profile={current.profile}
            txs={txs ?? []}
            categories={categories ?? []}
            limit={limit ?? 0}
            balance={balance ?? 0}
            path={path}
            navigate={navigate}
          />
        )}
      </Stack>
    </Page>
  );
}
