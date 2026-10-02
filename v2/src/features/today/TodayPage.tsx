// Today (docs/v2/PLAN.md 9, stage 2a): the first v2 screen with real data. Same
// numbers as v1's dashboard (docs/v2/GOLDEN.md G1-G3) in the owner's reference
// layout: points hero, level, the week's streak, today's limit with logging an
// activity (stage 3e), goals, chores, shortcuts and the latest activities.
import {
  Check,
  ClipboardCheck,
  Flame,
  Gamepad2,
  type LucideIcon,
  NotebookPen,
  Sparkles,
  Target,
  Wallet,
  Zap,
} from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { activeDays, type Activity, type ActivityDraft, type DayLog } from '@/domain/activity';
import { choresRate, todayChores, unpaidChores, type ChoreDef, type ChoreEntry } from '@/domain/chores';
import { goalProgress } from '@/domain/goals';
import type { Profile } from '@/domain/profile';
import { dailyProgress, generalRate, levelOf, levelTitleIndex, pointsToGrosze, XP_PER_LEVEL } from '@/domain/points';
import { calculateStreak, isFreezeAvailable } from '@/domain/streak';
import { ActivityRow, formatDuration } from '@/features/shared/activity';
import { goalAmount, useCelebration } from '@/features/shared/goals';
import { locale, t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { formatLongDate, formatWeekdayShort, localDayKey, utcDayKey, weekOf } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { ensureActivityDefs, saveActivity } from '@/services/activity';
import { logChore } from '@/services/chores';
import { account } from '@/stores/session';
import { today as todaySources, watchToday } from '@/stores/today';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { Button } from '@/ui/components/Button';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { EmptyState, IconTile, List, ListRow, ProgressBar, Skeleton } from '@/ui/components/Display';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import { ActivitySheet } from './ActivitySheet';
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

function TodayCard({ profile, day, onLog }: { profile: Profile; day: DayLog | undefined; onLog: () => void }) {
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
      <div class="today-card__actions">
        <Button variant="primary" block onClick={onLog}>
          <Zap aria-hidden="true" />
          {t('activity.log')}
        </Button>
      </div>
    </Card>
  );
}

interface ChoresCardProps {
  profile: Profile;
  defs: readonly ChoreDef[];
  entries: readonly ChoreEntry[];
  /** A tap on a chore logs it for today (owner's request 2026-10-02). */
  onLog: (def: ChoreDef) => void;
}

/** The reference's "Today's duties": v1's chore definitions, marked when logged today (local day, G8). */
function ChoresCard({ profile, defs, entries, onLog }: ChoresCardProps) {
  const rows = todayChores(defs, entries, localDayKey(new Date()));
  const unpaid = unpaidChores(entries, choresRate(profile.rateChores.zloty, profile.rateChores.points));
  const done = rows.filter((row) => row.doneToday > 0).length;
  const defById = new Map(defs.map((def) => [def.id, def]));
  return (
    <Section
      title={t('today.chores')}
      action={
        <span class="today-chores__head">
          {rows.length > 0 && (
            <span class="today-card__meta" data-testid="chores-progress">
              {t('today.choresProgress', { done, total: rows.length })}
            </span>
          )}
          <a class="today-card__link" href="#/chores/defs">
            {t('today.choresEdit')}
          </a>
        </span>
      }
    >
      <Card padding="none">
        {rows.length === 0 ? (
          <EmptyState
            title={t('today.noChores')}
            action={
              <ButtonLink variant="secondary" href="#/chores/defs">
                {t('chores.defsView')}
              </ButtonLink>
            }
          />
        ) : (
          <List label={t('today.chores')}>
            {rows.map((row) => {
              const def = defById.get(row.choreId);
              return (
                <ListRow
                  key={row.choreId}
                  onClick={def ? () => onLog(def) : undefined}
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
              );
            })}
          </List>
        )}
        <div class="today-chores__unpaid">
          <span>{t('today.choresUnpaid')}</span>
          <span class="today-chores__unpaid-value">
            <span class="numeric" data-testid="chores-unpaid-money">
              {formatMoney(unpaid.grosze, locale())}
            </span>
            <span class="today-chores__unpaid-points numeric" data-testid="chores-unpaid-points">
              {t('units.points', { points: formatInteger(unpaid.points, locale()) })}
            </span>
          </span>
        </div>
      </Card>
    </Section>
  );
}

/** PLAN.md 7.6: the goals and what is still missing; each opens the Goals screen. */
function GoalsCard({ uid, profile }: { uid: string; profile: Profile }) {
  const lang = locale();
  const pointsTotal = profile.points.total;
  useCelebration(uid, profile.goals, pointsTotal);
  return (
    <Section
      title={t('today.goals')}
      action={
        <a class="today-card__link" href="#/goals">
          {t('today.goalsOpen')}
        </a>
      }
    >
      <Card padding="none">
        {profile.goals.length === 0 ? (
          <List label={t('today.goals')}>
            <ListRow
              leading={
                <IconTile>
                  <Target />
                </IconTile>
              }
              title={t('today.goalsEmpty')}
              meta={t('today.goalsEmptyMeta')}
              href="#/goals"
            />
          </List>
        ) : (
          <ul class="today-goals" aria-label={t('today.goals')}>
            {profile.goals.map((goal) => {
              const progress = goalProgress(goal, pointsTotal);
              return (
                <li key={goal.id}>
                  <a class="today-goal" href="#/goals">
                    <span class="today-goal__top">
                      <span class="today-goal__name user-text">{goal.name}</span>
                      <span class={`today-goal__missing numeric tone-${progress.reached ? 'positive' : 'default'}`}>
                        {progress.reached
                          ? t('goals.reached')
                          : t('goals.missing', { amount: goalAmount(goal.type, progress.missing, lang) })}
                      </span>
                    </span>
                    <ProgressBar
                      value={progress.share}
                      label={t('goals.progress', {
                        current: goalAmount(goal.type, progress.current, lang),
                        target: goalAmount(goal.type, goal.target, lang),
                        percent: Math.floor(progress.share * 100),
                      })}
                      tone={progress.reached ? 'positive' : 'default'}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
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
    <Section
      title={t('today.recent')}
      action={
        <a class="today-card__link" href="#/stats/history">
          {t('today.recentAll')}
        </a>
      }
    >
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

/** The sheet stays mounted while it closes (exit animation); `key` gives each opening a fresh form. */
interface SheetState {
  open: boolean;
  key: number;
}

export default function TodayPage({ path, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchToday(uid) : undefined), [uid]);

  const [sheet, setSheet] = useState<SheetState>({ open: false, key: 0 });
  const lastToast = useRef<number | null>(null);
  const openSheet = () => {
    // v1 seeds the activity types on every start; v2 only when someone is about to
    // log one, so opening Today still writes nothing.
    if (uid) ensureActivityDefs(uid).catch(() => {});
    setSheet((s) => ({ open: true, key: s.key + 1 }));
  };
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  // #/today/activity (the "+" sheet): Today's address, with the form open on top.
  useEffect(() => {
    if (path !== '/today/activity' || !uid) return;
    navigate('/today', { replace: true });
    openSheet();
  }, [path, uid]);

  if (!current || !uid) return null;

  const { profile } = current;
  const sources = todaySources.value;
  const todayKey = utcDayKey(new Date());
  const firstName = profile.name.split(/\s+/)[0] ?? profile.name;

  const notify = (input: ToastInput) => {
    if (lastToast.current !== null) dismissToast(lastToast.current);
    lastToast.current = showToast(input);
  };

  const logChoreToday = (def: ChoreDef) => {
    const { saved, undo } = logChore(uid, def, localDayKey(new Date()));
    const failed = () => notify({ message: t('chores.saveFailed'), tone: 'negative' });
    saved.catch(failed);
    notify({
      message: t('chores.added', { name: def.name, points: def.points }),
      tone: 'positive',
      action: { label: t('ui.undo'), onAction: () => void undo().catch(failed) },
    });
  };

  const save = async (draft: ActivityDraft) => {
    const defs = sources.activityDefs ?? [];
    const before = levelOf(profile.points.earnedAllTime).level;
    try {
      const result = await saveActivity(uid, draft, defs);
      if (!result.ok) return result.problem;
      closeSheet();
      const level = levelOf(profile.points.earnedAllTime + result.points).level;
      const name = defs.find((d) => d.id === draft.type)?.name ?? '';
      notify(
        level > before
          ? {
              message: t('activity.levelUp', {
                points: result.points,
                level,
                title: t(`today.levelTitle.${levelTitleIndex(level)}` as 'today.levelTitle.1'),
              }),
              tone: 'positive',
            }
          : { message: t('activity.earned', { points: result.points, name }), tone: 'positive' },
      );
    } catch {
      notify({ message: t('activity.saveFailed'), tone: 'negative' });
    }
    return null;
  };

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
            <TodayCard profile={profile} day={sources.days.get(todayKey)} onLog={openSheet} />
          </>
        ) : (
          <Card>
            <Skeleton lines={4} />
          </Card>
        )}

        {uid && <GoalsCard uid={uid} profile={profile} />}

        {moduleOn(profile, 'chores') &&
          (sources.choreDefs && sources.choreEntries ? (
            <ChoresCard profile={profile} defs={sources.choreDefs} entries={sources.choreEntries} onLog={logChoreToday} />
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

      {sheet.key > 0 && (
        <ActivitySheet
          key={sheet.key}
          open={sheet.open}
          defs={sources.activityDefs}
          earnedToday={sources.days?.get(todayKey)?.pointsEarned ?? 0}
          dailyLimit={profile.dailyLimit}
          onClose={closeSheet}
          onSave={save}
        />
      )}
    </Page>
  );
}
