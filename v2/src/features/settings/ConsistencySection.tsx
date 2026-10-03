// Settings → Spójność danych (docs/v2/PLAN.md 5.5 point 4): one tap reads the account
// from the server and sets each counter against what its history adds up to. It
// shows differences and changes nothing, so there is nothing to confirm or undo.
import { CircleCheck, TriangleAlert } from 'lucide-preact';
import { useState } from 'preact/hooks';
import type { Profile } from '@/domain/profile';
import type { BalanceParts, Check, DayDifference, Reconciliation } from '@/domain/reconcile';
import { locale, t } from '@/i18n';
import { formatDayKey } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { checkConsistency } from '@/services/reconcile';
import { Button } from '@/ui/components/Button';
import { IconTile, List, ListRow } from '@/ui/components/Display';
import { Card, Section, Stack } from '@/ui/components/Layout';

/** The newest days listed when more differ. */
const DAYS_SHOWN = 30;

/** Negative with the minus sign, as everywhere in the app (Intl writes a hyphen). */
function amount(unit: Check['unit'], value: number): string {
  if (value < 0) return `−${amount(unit, -value)}`;
  return unit === 'grosze' ? formatMoney(value, locale()) : t('units.points', { points: formatInteger(value, locale()) });
}

/** "+10 pkt", "−5,00 zł" (the minus sign, as everywhere in the app); 0 without a sign. */
function signed(unit: Check['unit'], value: number): string {
  if (value === 0) return amount(unit, 0);
  return `${value > 0 ? '+' : '−'}${amount(unit, Math.abs(value))}`;
}

function CheckItem({ check }: { check: Check }) {
  const Icon = check.ok ? CircleCheck : TriangleAlert;
  return (
    <li class="settings-check">
      <div class="settings-check__head">
        <IconTile tone={check.ok ? 'positive' : 'warning'}>
          <Icon />
        </IconTile>
        <span class="settings-check__title">{t(`settings.checks.${check.id}`)}</span>
        <span class={`settings-check__status tone-${check.ok ? 'positive' : 'warning'}`}>
          {check.ok ? t('settings.checkOk') : t('settings.checkOff')}
        </span>
      </div>
      {check.id === 'days' ? (
        <p class="settings-note">
          {check.ok ? t('settings.daysOk') : t('settings.daysOff', { count: check.actual })}
        </p>
      ) : (
        <dl class="settings-check__values">
          <div>
            <dt>{t(`settings.checkFrom.${check.id}`)}</dt>
            <dd class="numeric">{amount(check.unit, check.expected)}</dd>
          </div>
          <div>
            <dt>{check.id === 'balance' ? t('settings.checkBalanceNow') : t('settings.checkOnAccount')}</dt>
            <dd class="numeric">{amount(check.unit, check.actual)}</dd>
          </div>
          {!check.ok && (
            <div>
              <dt>{t('settings.checkDifference')}</dt>
              <dd class="numeric">{signed(check.unit, check.actual - check.expected)}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}

function Days({ days }: { days: readonly DayDifference[] }) {
  const shown = [...days].reverse().slice(0, DAYS_SHOWN);
  return (
    <Section title={t('settings.daysTitle')}>
      <Card padding="none">
        <List label={t('settings.daysTitle')}>
          {shown.map((d) => (
            <ListRow
              key={d.day}
              title={formatDayKey(d.day, locale())}
              meta={t('settings.dayMeta', { expected: amount('points', d.expected), actual: amount('points', d.actual) })}
              value={signed('points', d.actual - d.expected)}
            />
          ))}
        </List>
      </Card>
      <p class="settings-note">
        {t('settings.daysNote')}
        {days.length > shown.length && ` ${t('settings.daysShown', { shown: shown.length, all: days.length })}`}
      </p>
    </Section>
  );
}

function Balance({ parts, expected }: { parts: BalanceParts; expected: number }) {
  const money = (grosze: number) => amount('grosze', grosze);
  return (
    <Section title={t('settings.balanceTitle')}>
      <Card padding="none">
        <List label={t('settings.balanceTitle')}>
          <ListRow title={t('settings.balanceTransactions')} value={money(parts.transactions)} />
          <ListRow title={t('settings.balanceGoals')} value={signed('grosze', -parts.inGoals)} />
          <ListRow title={t('settings.balanceLoans')} value={signed('grosze', parts.loans)} />
          <ListRow title={t('settings.balanceExpected')} value={money(expected)} />
        </List>
      </Card>
      <p class="settings-note">{t('settings.balanceNote')}</p>
      {parts.unrecordedPayouts > 0 && (
        <p class="settings-note">{t('settings.unrecordedPayouts', { amount: money(parts.unrecordedPayouts) })}</p>
      )}
    </Section>
  );
}

function Results({ result }: { result: Reconciliation }) {
  const balance = result.checks.find((c) => c.id === 'balance');
  return (
    <div class="settings-results">
      <Section title={t('settings.consistencyChecks')}>
        <Card>
          <ul class="settings-checks" aria-label={t('settings.consistencyChecks')}>
            {result.checks.map((check) => (
              <CheckItem key={check.id} check={check} />
            ))}
          </ul>
        </Card>
      </Section>
      {result.days.length > 0 && <Days days={result.days} />}
      {balance && <Balance parts={result.balance} expected={balance.expected} />}
    </div>
  );
}

export function ConsistencySection({ uid }: { uid: string; profile: Profile }) {
  const [result, setResult] = useState<Reconciliation | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'failed'>('idle');
  const run = () => {
    setStatus('running');
    checkConsistency(uid).then(
      (next) => {
        setResult(next);
        setStatus('idle');
      },
      () => setStatus('failed'),
    );
  };
  const issues = result ? result.checks.filter((c) => !c.ok).length : 0;

  return (
    <>
      <Card>
        <Stack gap="sm">
          <p class="settings-note">{t('settings.consistencyNote')}</p>
          <div>
            <Button onClick={run} busy={status === 'running'}>
              {t('settings.consistencyRun')}
            </Button>
          </div>
          {status === 'failed' && (
            <p class="settings-problem" role="alert">
              {t('settings.consistencyFailed')}
            </p>
          )}
          <p class={`settings-verdict tone-${issues === 0 ? 'positive' : 'warning'}`} role="status">
            {result && (issues === 0 ? t('settings.consistencyAllOk') : t('settings.consistencyIssues', { count: issues }))}
          </p>
        </Stack>
      </Card>
      {result && <Results result={result} />}
    </>
  );
}
