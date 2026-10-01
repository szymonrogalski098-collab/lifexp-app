// Money (docs/v2/PLAN.md 9, stage 3c): the overview at #/money and loans at
// #/money/loans, one module with two views. Opening it prepares the account as v1's
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
  const onLoans = path === '/money/loans';
  const ready = onLoans
    ? loans !== undefined && balance !== undefined
    : txs !== undefined && categories !== undefined && limit !== undefined && balance !== undefined;

  return (
    <Page>
      <Stack>
        <ViewSwitch
          label={t('money.views')}
          links={[
            { href: '#/money', label: t('money.overview'), current: !onLoans },
            { href: '#/money/loans', label: t('money.loans'), current: onLoans },
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
        ) : onLoans ? (
          <LoansView uid={uid} loans={loans ?? []} balance={balance ?? 0} />
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
