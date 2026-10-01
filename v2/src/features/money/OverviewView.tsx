// Money, the overview (docs/v2/PLAN.md 9, stage 3c; 7.6 U14; GOLDEN G5): the balance
// with what is put aside in goals, this month against the last one up to the same
// day, the limit alert, and the transactions by day — the last 30 days or a month of
// the archive. Adding and deleting move the balance in one transaction each.
import { Plus } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  archiveMonths,
  compareMonths,
  groupByDay,
  limitStatus,
  recentTxs,
  sortCategories,
  sortTxs,
  txsInMonth,
  type MoneyCategory,
  type MoneyTx,
  type TxDraft,
  type TxProblem,
} from '@/domain/money';
import type { Profile } from '@/domain/profile';
import { generalRate } from '@/domain/points';
import { locale, t } from '@/i18n';
import { addDays, formatDayKey, formatDayMonth, formatMonthKey, localDayKey, utcDayKey } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { Navigate } from '@/lib/route-match';
import { removeTransaction, saveTransaction } from '@/services/money';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState } from '@/ui/components/Display';
import { Select } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';
import { TxSheet } from './TxSheet';

/** '' = the last 30 days, otherwise "YYYY-MM". */
type Period = string;

function TxRow({ tx, color, onDelete }: { tx: MoneyTx; color: string | undefined; onDelete: (tx: MoneyTx) => void }) {
  const lang = locale();
  const income = tx.type === 'income';
  const amount = `${income ? '+' : '−'}${formatMoney(tx.grosze, lang)}`;
  const meta = [tx.note, tx.pointsCost > 0 ? t('money.pointsTaken', { points: formatInteger(tx.pointsCost, lang) }) : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <li class="money-tx">
      <span
        class={`money-tx__dot money-tx__dot--${tx.type}`}
        style={{ '--category-color': color }}
        aria-hidden="true"
      />
      <span class="money-tx__text">
        <span class="money-tx__category user-text">{tx.category || '—'}</span>
        {meta && <span class="money-tx__meta user-text">{meta}</span>}
      </span>
      <span class={`money-tx__amount numeric tone-${income ? 'positive' : 'negative'}`}>{amount}</span>
      <Button
        variant="quiet"
        onClick={() => onDelete(tx)}
        aria-label={t('money.deleteNamed', { category: tx.category, amount })}
      >
        {t('money.delete')}
      </Button>
    </li>
  );
}

function FlowRow({ label, current, previous, until }: { label: string; current: number; previous: number; until: string }) {
  const lang = locale();
  return (
    <div class="money-flow__row">
      <span class="money-flow__label">{label}</span>
      <span class="money-flow__value numeric">{formatMoney(current, lang)}</span>
      <span class="money-flow__previous">
        {t('money.previously', { amount: formatMoney(previous, lang), date: formatDayMonth(until, lang) })}
      </span>
    </div>
  );
}

interface OverviewViewProps {
  uid: string;
  profile: Profile;
  txs: readonly MoneyTx[];
  categories: readonly MoneyCategory[];
  /** Grosze; 0 = no limit. */
  limit: number;
  /** Grosze. */
  balance: number;
  path: string;
  navigate: Navigate;
}

export function OverviewView({ uid, profile, txs, categories, limit, balance, path, navigate }: OverviewViewProps) {
  const [period, setPeriod] = useState<Period>('');
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const [deleting, setDeleting] = useState<MoneyTx | null>(null);
  const lastToast = useRef<number | null>(null);

  // #/money/new (the "+" sheet): the Money address, with the form open on top.
  useEffect(() => {
    if (path !== '/money/new') return;
    navigate('/money', { replace: true });
    setSheet((s) => ({ open: true, key: s.key + 1 }));
  }, [path]);

  const lang = locale();
  const rate = generalRate(profile.rateGeneral.zloty, profile.rateGeneral.points);

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };

  const today = localDayKey(new Date());
  const sorted = sortTxs(txs);
  const months = archiveMonths(sorted);
  const shownPeriod = months.includes(period) ? period : '';
  const shown = shownPeriod ? txsInMonth(sorted, shownPeriod) : recentTxs(sorted, addDays(today, -30));
  const colors = new Map(categories.map((c: MoneyCategory) => [c.name, c.color]));
  const month = compareMonths(sorted, today);
  const overLimit = limitStatus(sorted, today.slice(0, 7), limit);

  const save = async (draft: TxDraft): Promise<TxProblem | null> => {
    try {
      const result = await saveTransaction(uid, draft, categories, rate);
      if (!result.ok) return result.problem;
      setSheet((s) => ({ ...s, open: false }));
      notify({
        message:
          result.pointsCost > 0
            ? t('money.savedWithPoints', { points: formatInteger(result.pointsCost, lang) })
            : t('money.saved'),
        tone: 'positive',
      });
    } catch {
      notify({ message: t('money.saveFailed'), tone: 'negative' });
    }
    return null;
  };

  const remove = () => {
    const tx = deleting;
    setDeleting(null);
    if (!tx) return;
    removeTransaction(uid, tx)
      .then((result) =>
        notify(
          result.ok
            ? { message: t('money.deleted') }
            : { message: t('money.deleteWouldGoNegative'), tone: 'negative' },
        ),
      )
      .catch(() => notify({ message: t('money.saveFailed'), tone: 'negative' }));
  };

  return (
    <>
      <Card>
        <div class="money-hero">
          <div>
            <p class="money-hero__label">{t('money.balance')}</p>
            <p class="money-hero__value numeric" data-testid="money-balance">
              {formatMoney(balance, lang)}
            </p>
            {profile.savedInGoals > 0 && (
              <p class="money-hero__goals" data-testid="money-in-goals">
                {t('money.inGoals', { amount: formatMoney(profile.savedInGoals, lang) })}
              </p>
            )}
          </div>
          <Button variant="primary" onClick={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}>
            <Plus aria-hidden="true" />
            {t('money.add')}
          </Button>
        </div>
      </Card>

      {overLimit.exceeded && (
        <p class="money-alert" data-testid="money-limit">
          {t('money.limitExceeded', {
            spent: formatMoney(overLimit.spent, lang),
            limit: formatMoney(overLimit.limit, lang),
          })}
        </p>
      )}

      <Section title={t('money.thisMonth', { month: formatMonthKey(today.slice(0, 7), lang) })}>
        <Card>
          <div class="money-flow">
            <FlowRow
              label={t('money.expenses')}
              current={month.current.expense}
              previous={month.previous.expense}
              until={month.previousUntil}
            />
            <FlowRow
              label={t('money.incomes')}
              current={month.current.income}
              previous={month.previous.income}
              until={month.previousUntil}
            />
          </div>
        </Card>
      </Section>

      <Section title={t('money.transactions')}>
        <Stack>
          <Select<Period>
            label={t('money.period')}
            value={shownPeriod}
            options={[
              { value: '', label: t('money.last30') },
              ...months.map((mk) => ({ value: mk, label: formatMonthKey(mk, lang) })),
            ]}
            onChange={setPeriod}
          />
          {shown.length === 0 ? (
            <Card>
              <EmptyState title={t('money.noTx')} />
            </Card>
          ) : (
            groupByDay(shown).map((day) => {
              const title = formatDayKey(day.date, lang);
              return (
                <div key={day.date} class="money-day">
                  <h3 class="money-day__title">{title}</h3>
                  <Card padding="none">
                    <ul class="money-day__list" aria-label={title}>
                      {day.txs.map((tx) => (
                        <TxRow key={tx.id} tx={tx} color={colors.get(tx.category)} onDelete={setDeleting} />
                      ))}
                    </ul>
                  </Card>
                </div>
              );
            })
          )}
        </Stack>
      </Section>

      <ConfirmDialog
        open={deleting !== null}
        title={t('money.deleteTitle')}
        body={
          deleting?.pointsCost
            ? t('money.deleteBodyPoints', { points: formatInteger(deleting.pointsCost, lang) })
            : t('money.deleteBody')
        }
        confirmLabel={t('money.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />

      {sheet.key > 0 && (
        <TxSheet
          key={sheet.key}
          open={sheet.open}
          categories={sortCategories(categories)}
          balance={balance}
          rate={rate}
          pointsTotal={profile.points.total}
          today={utcDayKey(new Date())}
          onClose={() => setSheet((s) => ({ ...s, open: false }))}
          onSave={save}
        />
      )}
    </>
  );
}
