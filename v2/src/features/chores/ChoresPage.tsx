// Chores (docs/v2/PLAN.md 9, stage 3b; GOLDEN G8): what this or last month earned,
// the month's calendar with each day's entries, what is left to pay out (and paying
// it into Money), the payout history, and logging a chore from the list. Documents
// keep v1's shape, so both versions show the same calendar and history.
import { Plus } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  choresRate,
  dayEntries,
  entriesInMonth,
  entryDay,
  monthEarnings,
  monthKeyOf,
  monthKeys,
  payoutHistory,
  unpaidChores,
  type ChoreDef,
  type ChoreEntry,
} from '@/domain/chores';
import { formatInteger } from '@/lib/format';
import { locale, t } from '@/i18n';
import { addDays, formatDayMonth, formatMonthKey, formatShortDate, localDayKey } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { RouteProps } from '@/lib/route-match';
import { deleteChoreEntry, logChore, settleChores } from '@/services/chores';
import { chores as choresState, watchChores } from '@/stores/chores';
import { account } from '@/stores/session';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EmptyState, List, ListRow, Skeleton } from '@/ui/components/Display';
import { SegmentedControl } from '@/ui/components/Fields';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import { ChoreCalendar } from './ChoreCalendar';
import { LogChoreSheet } from './LogChoreSheet';
import './chores.css';

type Month = 'current' | 'prev';

function DayEntries({ day, entries, onDelete }: { day: string; entries: ChoreEntry[]; onDelete: (e: ChoreEntry) => void }) {
  const title = t('chores.dayEntries', { date: formatDayMonth(day, locale()) });
  return (
    <div class="chores-day">
      <h3 class="chores-day__title">{title}</h3>
      <ul class="chores-day__list" aria-label={title}>
        {entries.map((entry) => (
          <li key={entry.id} class="chores-day__entry">
            <span class="chores-emoji" aria-hidden="true">
              {entry.emoji}
            </span>
            <span class="chores-day__name user-text">{entry.name}</span>
            <span class="chores-day__points numeric">{t('units.pointsGained', { points: entry.points })}</span>
            <Button variant="quiet" onClick={() => onDelete(entry)} aria-label={t('chores.deleteNamed', { name: entry.name })}>
              {t('chores.delete')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChoresPage({ path, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchChores(uid) : undefined), [uid]);

  const [month, setMonth] = useState<Month>('current');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const [confirming, setConfirming] = useState(false);
  const [settling, setSettling] = useState(false);
  const lastToast = useRef<number | null>(null);

  const { defs, entries, payouts, failed } = choresState.value;
  const today = localDayKey(new Date());
  const yesterday = addDays(today, -1);
  const months = monthKeys(today);

  // #/chores/new (the "+" sheet): the Chores address, with the list open on top.
  useEffect(() => {
    if (path !== '/chores/new') return;
    navigate('/chores', { replace: true });
    setSheet((s) => ({ open: true, key: s.key + 1 }));
  }, [path]);

  if (!current || !uid) return null;

  const rate = choresRate(current.profile.rateChores.zloty, current.profile.rateChores.points);
  const lang = locale();
  const monthKey = month === 'current' ? months.cur : months.prev;

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };
  const saveFailed = () => notify({ message: t('chores.saveFailed'), tone: 'negative' });

  const log = (def: ChoreDef, when: 'today' | 'yesterday') => {
    const day = when === 'today' ? today : yesterday;
    logChore(uid, def, day).saved.catch(saveFailed);
    setSheet((s) => ({ ...s, open: false }));
    // Show the month and day the entry went to (v1 addChore).
    setMonth(monthKeyOf(day) === months.cur ? 'current' : 'prev');
    setSelectedDay(day);
    notify({ message: t('chores.added', { name: def.name, points: def.points }), tone: 'positive' });
  };

  const remove = (entry: ChoreEntry) => {
    const { saved, undo } = deleteChoreEntry(uid, entry);
    saved.catch(saveFailed);
    notify({
      message: t('chores.deleted'),
      action: { label: t('ui.undo'), onAction: () => void undo().catch(saveFailed) },
    });
  };

  const settle = () => {
    if (!entries) return;
    setConfirming(false);
    setSettling(true);
    settleChores(uid, entries, rate, t('chores.incomeCategory'))
      .then((paid) => {
        if (paid) notify({ message: t('chores.settled', { amount: formatMoney(paid.grosze, lang) }), tone: 'positive' });
      })
      .catch(() => notify({ message: t('chores.settleFailed'), tone: 'negative' }))
      .finally(() => setSettling(false));
  };

  if (!defs || !entries) {
    return (
      <Page>
        {failed && (
          <p class="chores-error" role="alert">
            {t('chores.loadFailed')}
          </p>
        )}
        <Card>
          <Skeleton lines={5} />
        </Card>
      </Page>
    );
  }

  const monthEntries = entriesInMonth(entries, monthKey);
  const earned = monthEarnings(entries, monthKey, rate);
  const unpaid = unpaidChores(entries, rate);
  const selected = selectedDay && selectedDay.startsWith(monthKey) ? selectedDay : null;
  const selectedEntries = selected ? dayEntries(monthEntries, selected) : [];

  return (
    <Page>
      <Stack>
        {failed && (
          <p class="chores-error" role="alert">
            {t('chores.loadFailed')}
          </p>
        )}

        <SegmentedControl<Month>
          label={t('chores.month')}
          value={month}
          options={[
            { value: 'current', label: t('chores.current') },
            { value: 'prev', label: t('chores.prev') },
          ]}
          onChange={(next) => {
            setMonth(next);
            setSelectedDay(null);
          }}
        />

        <Card>
          <div class="chores-summary">
            <div>
              <p class="chores-summary__label">
                {t('chores.monthEarnings')} · <span class="chores-summary__month">{formatMonthKey(monthKey, lang)}</span>
              </p>
              <p class="chores-summary__value numeric" data-testid="month-points">
                {t('units.points', { points: formatInteger(earned.points, lang) })}
              </p>
              <p class="chores-summary__money numeric" data-testid="month-money">
                {formatMoney(earned.grosze, lang)}
              </p>
            </div>
            {month === 'current' && (
              <Button variant="primary" onClick={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}>
                <Plus aria-hidden="true" />
                {t('chores.add')}
              </Button>
            )}
          </div>
          <p class="chores-summary__rate">{t('chores.rate', { amount: formatMoney(Math.round(rate * 100), lang) })}</p>
        </Card>

        <Section title={t('chores.calendar')}>
          <Card>
            <ChoreCalendar
              monthKey={monthKey}
              entries={monthEntries}
              today={today}
              selected={selected}
              onSelect={setSelectedDay}
            />
            {selected && selectedEntries.length > 0 ? (
              <DayEntries key={selected} day={selected} entries={selectedEntries} onDelete={remove} />
            ) : (
              <p class="chores-cal__hint">{t('chores.pickDay')}</p>
            )}
          </Card>
        </Section>

        <Card>
          <div class="chores-unpaid">
            <div>
              <p class="chores-summary__label">{t('chores.outstanding')}</p>
              <p class="chores-unpaid__note">{t('chores.outstandingNote')}</p>
            </div>
            <p class="chores-unpaid__value numeric" data-testid="unpaid">
              {t('today.choresUnpaidValue', {
                points: formatInteger(unpaid.points, lang),
                amount: formatMoney(unpaid.grosze, lang),
              })}
            </p>
          </div>
          <div class="chores-unpaid__action">
            <Button
              variant="primary"
              block
              busy={settling}
              disabled={unpaid.points === 0 || settling}
              onClick={() => setConfirming(true)}
            >
              {t('chores.settle')}
            </Button>
          </div>
        </Card>

        <Section title={t('chores.history')}>
          <Card padding="none">
            {!payouts ? (
              <Skeleton lines={2} />
            ) : payouts.length === 0 ? (
              <EmptyState title={t('chores.noPayouts')} />
            ) : (
              <List label={t('chores.history')}>
                {payoutHistory(payouts).map((p) => (
                  <ListRow
                    key={p.id}
                    title={formatMoney(p.grosze, lang)}
                    meta={[
                      p.createdAt ? formatShortDate(p.createdAt, lang) : '',
                      p.fromISO && p.toISO
                        ? t('chores.payoutPeriod', {
                            from: formatDayMonth(p.fromISO, lang),
                            to: formatDayMonth(p.toISO, lang),
                          })
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={t('units.points', { points: formatInteger(p.points, lang) })}
                  />
                ))}
              </List>
            )}
          </Card>
        </Section>
      </Stack>

      <ConfirmDialog
        open={confirming}
        title={t('chores.settleTitle', { amount: formatMoney(unpaid.grosze, lang) })}
        body={t('chores.settleBody', { points: formatInteger(unpaid.points, lang) })}
        confirmLabel={t('chores.settle')}
        onConfirm={settle}
        onCancel={() => setConfirming(false)}
      />

      {sheet.key > 0 && (
        <LogChoreSheet
          key={sheet.key}
          open={sheet.open}
          defs={defs}
          yesterday={yesterday}
          onClose={() => setSheet((s) => ({ ...s, open: false }))}
          decide={(def) => entryDay(def.id, entries, today, yesterday)}
          onLog={log}
        />
      )}
    </Page>
  );
}
