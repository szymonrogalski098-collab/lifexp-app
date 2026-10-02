// Today's chores (owner's requests 2026-10-02). The card shows 3–4 chores drawn for
// the day, or the ones picked in its editor; a tap logs a chore for today (local
// day, G13) and marks it done, and a done chore cannot be tapped again here (the
// Chores screen still logs one as often as needed). Below: what is left to pay out.
import { Check, ClipboardCheck } from 'lucide-preact';
import { choresCardRows, choresRate, unpaidChores, type ChoreDef, type ChoreEntry } from '@/domain/chores';
import type { Profile } from '@/domain/profile';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Button } from '@/ui/components/Button';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { EmptyState, IconTile, ProgressBar } from '@/ui/components/Display';
import { Card, Section } from '@/ui/components/Layout';

interface ChoresCardProps {
  uid: string;
  profile: Profile;
  defs: readonly ChoreDef[];
  entries: readonly ChoreEntry[];
  /** Local day "YYYY-MM-DD". */
  today: string;
  onLog: (def: ChoreDef) => void;
  onEdit: () => void;
}

export function ChoresCard({ uid, profile, defs, entries, today, onLog, onEdit }: ChoresCardProps) {
  const lang = locale();
  const settings = profile.choresCard;
  const rows = choresCardRows(defs, entries, today, settings, `${uid}:${today}`);
  const defById = new Map(defs.map((def) => [def.id, def]));
  const done = rows.filter((row) => row.doneToday > 0).length;
  const unpaid = unpaidChores(entries, choresRate(profile.rateChores.zloty, profile.rateChores.points));

  return (
    <Section
      title={t('today.chores')}
      action={
        <button type="button" class="today-card__link today-card__link--button" onClick={onEdit}>
          {t('today.choresEdit')}
        </button>
      }
    >
      <Card padding="none">
        {defs.length === 0 ? (
          <EmptyState
            title={t('today.noChores')}
            action={
              <ButtonLink variant="secondary" href="#/chores/defs">
                {t('chores.defsView')}
              </ButtonLink>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('today.choresListEmpty')}
            action={
              <Button variant="secondary" onClick={onEdit}>
                {t('today.choresEdit')}
              </Button>
            }
          />
        ) : (
          <>
            <div class="today-chores__status">
              <div class="today-chores__status-text">
                <span class="today-chores__source">
                  {t(settings.mode === 'chosen' ? 'today.choresChosen' : 'today.choresRandom')}
                </span>
                <span class="today-chores__count numeric" data-testid="chores-progress">
                  {done === rows.length ? t('today.choresAllDone') : t('today.choresProgress', { done, total: rows.length })}
                </span>
              </div>
              <ProgressBar value={done / rows.length} label={t('today.choresProgressLabel')} tone="positive" />
            </div>
            <ul class="today-chores" aria-label={t('today.chores')}>
              {rows.map((row) => {
                const def = defById.get(row.choreId);
                const isDone = row.doneToday > 0;
                return (
                  <li key={row.choreId}>
                    {/* Always a button, so the check fills smoothly; done = disabled, once a day here. */}
                    <button
                      type="button"
                      class={`today-chore${isDone ? ' today-chore--done' : ''}`}
                      disabled={isDone || !def}
                      onClick={() => def && onLog(def)}
                    >
                      <IconTile tone={isDone ? 'positive' : 'default'}>
                        {row.emoji ? <span class="today-chore__emoji">{row.emoji}</span> : <ClipboardCheck />}
                      </IconTile>
                      <span class="today-chore__text">
                        <span class="today-chore__name user-text">{row.name}</span>
                        <span class="today-chore__meta numeric">
                          {isDone ? t('today.choreDone') : t('units.pointsGained', { points: row.points })}
                        </span>
                      </span>
                      <span class="today-check" aria-hidden="true">
                        <Check />
                      </span>
                      {!isDone && <span class="visually-hidden">{t('today.choresMark')}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div class="today-chores__unpaid">
          <span>{t('today.choresUnpaid')}</span>
          <span class="today-chores__unpaid-value">
            <span class="numeric" data-testid="chores-unpaid-money">
              {formatMoney(unpaid.grosze, lang)}
            </span>
            <span class="today-chores__unpaid-points numeric" data-testid="chores-unpaid-points">
              {t('units.points', { points: formatInteger(unpaid.points, lang) })}
            </span>
          </span>
        </div>
      </Card>
    </Section>
  );
}
