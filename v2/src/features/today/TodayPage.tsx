// Today (docs/v2/PLAN.md 9, stage 2a): the first v2 screen with real data, read
// only. Same numbers as v1's dashboard (docs/v2/GOLDEN.md G1-G3) in the owner's
// reference layout: points hero, level, the week's streak, today's limit,
// shortcuts and the latest activities. Nothing here writes.
import {
  Check,
  ClipboardCheck,
  Flame,
  Gamepad2,
  type LucideIcon,
  NotebookPen,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-preact';
import { useEffect } from 'preact/hooks';
import { activeDays, type Activity, type DayLog } from '@/domain/activity';
import { choresRate, todayChores, unpaidChores, type ChoreDef, type ChoreEntry } from '@/domain/chores';
import type { Profile } from '@/domain/profile';
import { dailyProgress, generalRate, levelOf, levelTitleIndex, pointsToGrosze, XP_PER_LEVEL } from '@/domain/points';
import { calculateStreak, isFreezeAvailable } from '@/domain/streak';
import { ActivityRow, formatDuration } from '@/features/shared/activity';
import { locale, t } from '@/i18n';
import { formatLongDate, formatWeekdayShort, localDayKey, utcDayKey, weekOf } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { account } from '@/stores/session';
import { today as todaySources, watchToday } from '@/stores/today';
import { EmptyState, IconTile, List, ListRow, ProgressBar, Skeleton } from '@/ui/components/Display';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import './today.css';

function PointsHero({ profile }: { profile: Profile }) {
  const total = profile.points.total;
  const rate = generalRate(profile.rateGeneral.zloty, profile.rateGeneral.points);
  return (
    <section class="today-hero" aria-label={t('today.points')}>
      <div class="today-hero__text">
        <p class="today-hero__label">{t('today.points')}</p>
        <p class="today-hero__value">
          <span class="numeric" data-testid="points-total">
            {formatInteger(total, locale())}
          </span>{' '}
          <span class="today-hero__unit">{t('today.pointsUnit')}</span>
        </p>
        <p class="today-hero__worth numeric">
          {t('today.worth', { amount: formatMoney(pointsToGrosze(total, rate), locale()) })}
        </p>
      </div>
      <span class="today-hero__badge" aria-hidden="true">
        <Zap />
      </span>
    </section>
  );
}

function LevelCard({ profile }: { profile: Profile }) {
  const { level, intoLevel } = levelOf(profile.points.earnedAllTime);
  const title = t(`today.levelTitle.${levelTitleIndex(level)}` as 'today.levelTitle.1');
  return (
    <Card>
      <div class="today-row">
        <div>
          <p class="today-card__title" data-testid="level">
            {t('today.level', { n: level })}
          </p>
          <p class="today-card__meta">{title}</p>
        </div>
        <p class="today-card__meta numeric">{t('today.levelXp', { cur: intoLevel, max: XP_PER_LEVEL })}</p>
      </div>
      <div class="today-card__bar">
        <ProgressBar value={intoLevel / XP_PER_LEVEL} label={t('today.levelProgress')} />
      </div>
    </Card>
  );
}

function StreakCard({ profile, days, todayKey }: { profile: Profile; days: ReadonlyMap<string, DayLog>; todayKey: string }) {
  const active = activeDays(days);
  const freezeAvailable = isFreezeAvailable(profile.streakFreezeLastUsed, new Date());
  const streak = calculateStreak(active, todayKey, freezeAvailable);
  const lang = locale();
  return (
    <Card>
      <div class="today-row">
        <div class="today-row__start">
          <IconTile tone="warning">
            <Flame />
          </IconTile>
          <p class="today-card__title">{t('today.streak')}</p>
        </div>
        <p class="today-card__meta" data-testid="streak">
          {streak.days > 0 ? t('today.streakDays', { count: streak.days }) : t('today.streakNone')}
        </p>
      </div>
      <ol class="today-week" aria-label={t('today.thisWeek')}>
        {weekOf(todayKey).map((key) => {
          const day = formatWeekdayShort(key, lang);
          const done = active.has(key);
          const state = done ? 'done' : key === todayKey ? 'today' : key > todayKey ? 'future' : 'missed';
          return (
            <li key={key} class={`today-week__day today-week__day--${state}`}>
              <span class="today-week__mark" aria-hidden="true">
                {done && <Check />}
              </span>
              <span class="today-week__label" aria-hidden="true">
                {day}
              </span>
              <span class="visually-hidden">{t(done ? 'today.dayActive' : 'today.dayEmpty', { day })}</span>
            </li>
          );
        })}
      </ol>
      {(streak.freezeUsed || (freezeAvailable && streak.days > 0)) && (
        <p class="today-card__note">{t(streak.freezeUsed ? 'today.freezeUsed' : 'today.freezeAvailable')}</p>
      )}
    </Card>
  );
}

function TodayCard({ profile, day }: { profile: Profile; day: DayLog | undefined }) {
  const progress = dailyProgress(day?.pointsEarned ?? 0, profile.dailyLimit);
  return (
    <Card>
      <div class="today-split">
        <div>
          <p class="today-card__meta">{t('today.todayPoints')}</p>
          <p class="today-card__number numeric" data-testid="today-points">
            {formatInteger(progress.earned, locale())}
          </p>
          <p class="today-card__meta">{t('today.ofLimit', { limit: progress.limit })}</p>
        </div>
        <div>
          <p class="today-card__meta">{t('today.gaming')}</p>
          <p class="today-card__number numeric" data-testid="gaming">
            {formatDuration(day?.gamingMinutes ?? 0)}
          </p>
        </div>
      </div>
      <div class="today-card__bar">
        <ProgressBar value={progress.ratio} label={t('today.limitProgress')} tone="positive" />
      </div>
    </Card>
  );
}

interface ChoresCardProps {
  profile: Profile;
  defs: readonly ChoreDef[];
  entries: readonly ChoreEntry[];
}

/** The reference's "Today's duties": v1's chore definitions, marked when logged today (local day, G8). */
function ChoresCard({ profile, defs, entries }: ChoresCardProps) {
  const rows = todayChores(defs, entries, localDayKey(new Date()));
  const unpaid = unpaidChores(entries, choresRate(profile.rateChores.zloty, profile.rateChores.points));
  const done = rows.filter((row) => row.doneToday > 0).length;
  return (
    <Section
      title={t('today.chores')}
      action={
        rows.length > 0 && (
          <span class="today-card__meta" data-testid="chores-progress">
            {t('today.choresProgress', { done, total: rows.length })}
          </span>
        )
      }
    >
      <Card padding="none">
        {rows.length === 0 ? (
          <EmptyState title={t('today.noChores')} />
        ) : (
          <List label={t('today.chores')}>
            {rows.map((row) => (
              <ListRow
                key={row.choreId}
                leading={
                  <IconTile>{row.emoji ? <span class="today-chore__emoji">{row.emoji}</span> : <ClipboardCheck />}</IconTile>
                }
                title={row.name}
                meta={
                  row.doneToday > 1
                    ? t('today.choreDoneTimes', { count: row.doneToday })
                    : row.doneToday === 1
                      ? t('today.choreDone')
                      : undefined
                }
                value={t('units.pointsGained', { points: row.points })}
                trailing={
                  <span class={`today-check${row.doneToday > 0 ? ' today-check--done' : ''}`} aria-hidden="true">
                    {row.doneToday > 0 && <Check />}
                  </span>
                }
              />
            ))}
          </List>
        )}
        <div class="today-chores__unpaid">
          <span>{t('today.choresUnpaid')}</span>
          <span class="numeric" data-testid="chores-unpaid">
            {t('today.choresUnpaidValue', {
              points: formatInteger(unpaid.points, locale()),
              amount: formatMoney(unpaid.grosze, locale()),
            })}
          </span>
        </div>
      </Card>
    </Section>
  );
}

interface Shortcut {
  /** v1 module id in users.enabledModules. */
  module: string;
  href: string;
  icon: LucideIcon;
  labelKey: 'nav.games' | 'nav.notes' | 'nav.money' | 'nav.exus';
}

const SHORTCUTS: readonly Shortcut[] = [
  { module: 'games', href: '#/games', icon: Gamepad2, labelKey: 'nav.games' },
  { module: 'notes', href: '#/notes', icon: NotebookPen, labelKey: 'nav.notes' },
  { module: 'money', href: '#/money', icon: Wallet, labelKey: 'nav.money' },
  { module: 'aichat', href: '#/exus', icon: Sparkles, labelKey: 'nav.exus' },
];

function moduleOn(profile: Profile, module: string): boolean {
  return profile.enabledModules === null || profile.enabledModules.includes(module);
}

function Shortcuts({ profile }: { profile: Profile }) {
  const shown = SHORTCUTS.filter((s) => moduleOn(profile, s.module));
  if (shown.length === 0) return null;
  return (
    <Section title={t('today.quick')}>
      <ul class="today-shortcuts">
        {shown.map(({ href, icon: Icon, labelKey }) => (
          <li key={href}>
            <a class="today-shortcut" href={href}>
              <IconTile>
                <Icon />
              </IconTile>
              <span class="today-shortcut__label">{t(labelKey)}</span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RecentActivities({ recent, names }: { recent: readonly Activity[]; names: ReadonlyMap<string, string> }) {
  return (
    <Section title={t('today.recent')}>
      <Card padding="none">
        {recent.length === 0 ? (
          <EmptyState title={t('today.noRecent')} />
        ) : (
          <List label={t('today.recent')}>
            {recent.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} names={names} />
            ))}
          </List>
        )}
      </Card>
    </Section>
  );
}

function Balance({ grosze }: { grosze: number }) {
  return (
    <a class="today-balance" href="#/money">
      <IconTile>
        <Wallet />
      </IconTile>
      <span class="today-balance__label">{t('today.balance')}</span>
      <span class="today-balance__value numeric" data-testid="balance">
        {formatMoney(grosze, locale())}
      </span>
    </a>
  );
}

export default function TodayPage() {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchToday(uid) : undefined), [uid]);
  if (!current) return null;

  const { profile } = current;
  const sources = todaySources.value;
  const todayKey = utcDayKey(new Date());
  const firstName = profile.name.split(/\s+/)[0] ?? profile.name;

  return (
    <Page>
      <Stack>
        <header class="today-greeting">
          <p class="today-greeting__date">{formatLongDate(new Date(), locale())}</p>
          <h2 class="today-greeting__hello">{t('today.greeting', { name: firstName })}</h2>
        </header>

        {sources.failed && <p class="today-error" role="alert">{t('today.loadFailed')}</p>}

        <PointsHero profile={profile} />
        <LevelCard profile={profile} />

        {sources.days ? (
          <>
            <StreakCard profile={profile} days={sources.days} todayKey={todayKey} />
            <TodayCard profile={profile} day={sources.days.get(todayKey)} />
          </>
        ) : (
          <Card>
            <Skeleton lines={4} />
          </Card>
        )}

        {moduleOn(profile, 'chores') &&
          (sources.choreDefs && sources.choreEntries ? (
            <ChoresCard profile={profile} defs={sources.choreDefs} entries={sources.choreEntries} />
          ) : (
            <Card>
              <Skeleton />
            </Card>
          ))}

        {moduleOn(profile, 'money') && typeof sources.balance === 'number' && <Balance grosze={sources.balance} />}

        <Shortcuts profile={profile} />

        {sources.recent && sources.activityNames ? (
          <RecentActivities recent={sources.recent} names={sources.activityNames} />
        ) : (
          <Card>
            <Skeleton />
          </Card>
        )}
      </Stack>
    </Page>
  );
}
