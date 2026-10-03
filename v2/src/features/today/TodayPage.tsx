// Today (docs/v2/PLAN.md 9, stage 2a): the first v2 screen with real data. Same
// numbers as v1's dashboard (docs/v2/GOLDEN.md G1-G3) in the owner's reference
// layout: points hero, level, the week's streak, today's limit with logging an
// activity (stage 3e), goals, chores, shortcuts and the latest activities.
import {
  Check,
  Dices,
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
import {
  GENERATED_TYPE,
  activeDays,
  activityProblem,
  earnedPoints,
  generatorPool,
  type Activity,
  type ActivityDraft,
  type DayLog,
} from '@/domain/activity';
import { activityDraftPayload } from '@/domain/drafts';
import { choresOnCard, type ChoreDef, type ChoresCardSettings } from '@/domain/chores';
import { isModuleOn } from '@/domain/modules';
import { newAchievements } from '@/domain/achievements';
import { goalProgress } from '@/domain/goals';
import type { Profile } from '@/domain/profile';
import { DAILY_LIMIT_DEFAULT, dailyProgress, generalRate, levelOf, levelTitleIndex, pointsToGrosze, XP_PER_LEVEL } from '@/domain/points';
import { calculateStreak, frozenDay, isFreezeAvailable } from '@/domain/streak';
import { ActivityRow, formatDuration } from '@/features/shared/activity';
import { goalAmount, useCelebration } from '@/features/shared/goals';
import { locale, t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { formatLongDate, formatWeekdayShort, localDayKey, utcDayKey, weekOf } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { ensureActivityDefs, saveActivity } from '@/services/activity';
import { logChore, saveChoresCard } from '@/services/chores';
import { awardAchievements, recordFreeze } from '@/services/progress';
import { addDraft, drafts, reviewRequested } from '@/offline/queue';
import { account } from '@/stores/session';
import { today as todaySources, watchToday } from '@/stores/today';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';
import { afterModalHistory } from '@/ui/components/useModal';
import { Button } from '@/ui/components/Button';
import { EmptyState, IconTile, List, ListRow, ProgressBar, Skeleton } from '@/ui/components/Display';
import { Card, Page, Section, Stack } from '@/ui/components/Layout';
import { ActivitySheet } from './ActivitySheet';
import { ChoresCard } from './ChoresCard';
import { ChoresCardSheet } from './ChoresCardSheet';
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

/** G3 on Today's data: the streak, with a freeze used before still bridging its gap. */
function streakOf(profile: Profile, days: ReadonlyMap<string, DayLog>, todayKey: string) {
  const active = activeDays(days);
  const freezeAvailable = isFreezeAvailable(profile.streakFreezeLastUsed, new Date());
  const streak = calculateStreak(active, todayKey, freezeAvailable, frozenDay(active, profile.streakFreezeLastUsed));
  return { active, freezeAvailable, streak };
}

interface RecordProgressProps {
  uid: string;
  profile: Profile;
  days: ReadonlyMap<string, DayLog>;
  todayKey: string;
}

/**
 * G3, G4: a freeze bridging a gap today and badges earned now are recorded once, by
 * the services, after the screen showed them (v1 writes them while rendering).
 * Renders nothing.
 */
function RecordProgress({ uid, profile, days, todayKey }: RecordProgressProps) {
  const { streak } = streakOf(profile, days, todayKey);
  useEffect(() => {
    if (streak.newFreeze) recordFreeze(uid, todayKey).catch(() => {});
  }, [uid, streak.newFreeze, todayKey]);

  const todayLog = days.get(todayKey);
  const input = {
    earnedAllTime: profile.points.earnedAllTime,
    spentAllTime: profile.points.spentAllTime,
    streak: streak.days,
    pointsToday: todayLog?.pointsEarned ?? 0,
    gamingMinutesToday: todayLog?.gamingMinutes ?? 0,
    dailyLimit: profile.dailyLimit || DAILY_LIMIT_DEFAULT,
    moneyIncomeAllTime: profile.moneyIncomeAllTime,
  };
  const due = newAchievements(profile.achievements, input)
    .map((a) => a.id)
    .join(',');
  useEffect(() => {
    if (!due) return;
    awardAchievements(uid, profile.achievements, input)
      .then((added) => {
        if (added.length === 0) return;
        const list = added
          .map((a) => `${a.emoji} ${t(`achievements.${a.id}.name` as 'achievements.first_activity.name')}`)
          .join(', ');
        showToast({ message: t('today.newBadge', { list }), tone: 'positive' });
      })
      .catch(() => {});
  }, [uid, due]);
  return null;
}

function StreakCard({ profile, days, todayKey }: { profile: Profile; days: ReadonlyMap<string, DayLog>; todayKey: string }) {
  const { active, freezeAvailable, streak } = streakOf(profile, days, todayKey);
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

interface TodayCardProps {
  profile: Profile;
  day: DayLog | undefined;
  onLog: () => void;
  /** v1's "Co teraz?": the log sheet with a pick from the generator. */
  onWhatNow: () => void;
}

function TodayCard({ profile, day, onLog, onWhatNow }: TodayCardProps) {
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
      <div class="today-card__actions today-card__actions--two">
        <Button variant="primary" block onClick={onLog}>
          <Zap aria-hidden="true" />
          {t('activity.log')}
        </Button>
        <Button variant="secondary" block onClick={onWhatNow}>
          <Dices aria-hidden="true" />
          {t('generator.whatNow')}
        </Button>
      </div>
    </Card>
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

function Shortcuts({ profile }: { profile: Profile }) {
  const shown = SHORTCUTS.filter((s) => isModuleOn(s.module, profile));
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
  /** The activity sheet starts with a pick from the generator ("Co teraz?"). */
  roll?: boolean;
}

export default function TodayPage({ path, navigate }: RouteProps) {
  const current = account.value;
  const uid = current?.user.uid;
  useEffect(() => (uid ? watchToday(uid) : undefined), [uid]);

  const [sheet, setSheet] = useState<SheetState>({ open: false, key: 0 });
  const [cardEditor, setCardEditor] = useState<SheetState>({ open: false, key: 0 });
  const lastToast = useRef<number | null>(null);
  const openSheet = (roll = false) => {
    // v1 seeds the activity types on every start; v2 only when someone is about to
    // log one, so opening Today still writes nothing.
    if (uid) ensureActivityDefs(uid).catch(() => {});
    setSheet((s) => ({ open: true, key: s.key + 1, roll }));
  };
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  // #/today/activity (the "+" sheet): Today's address, with the form open on top.
  // Activities belong to "Statystyki XP" (v1 MODULE_REGISTRY): not while it is off.
  const statsOn = current ? isModuleOn('stats', current.profile) : false;
  useEffect(() => {
    if (path !== '/today/activity' || !uid) return;
    navigate('/today', { replace: true });
    if (statsOn) openSheet();
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

  const choresToday = localDayKey(new Date());
  const closeCardEditor = () => setCardEditor((s) => ({ ...s, open: false }));
  const saveCard = (settings: ChoresCardSettings) => {
    const result = saveChoresCard(uid, settings);
    if (!result.ok) return result.problem;
    result.saved.catch(() => notify({ message: t('chores.saveFailed'), tone: 'negative' }));
    closeCardEditor();
    notify({ message: t('today.cardSaved'), tone: 'positive' });
    return null;
  };

  const logChoreToday = (def: ChoreDef) => {
    const { saved, undo } = logChore(uid, def, choresToday);
    const failed = () => notify({ message: t('chores.saveFailed'), tone: 'negative' });
    saved.catch(failed);
    notify({
      message: t('chores.added', { name: def.name, points: def.points }),
      tone: 'positive',
      action: { label: t('ui.undo'), onAction: () => void undo().catch(failed) },
    });
  };

  /** Offline (v1 queueActivityDraft): the activity waits as a draft, its points estimated; the limit applies when confirmed. */
  const saveDraft = (draft: ActivityDraft) => {
    const problem = activityProblem(draft);
    if (problem) return problem;
    const def = (sources.activityDefs ?? []).find((d) => d.id === draft.type);
    const generated = draft.type === GENERATED_TYPE ? draft.generated : null;
    const name = generated?.name ?? def?.name;
    const rate = generated?.points ?? def?.points;
    if (!name || rate === undefined || !draft.type || draft.minutes === null) return 'typeRequired';
    addDraft(
      'activity',
      t('offline.sumActivity', { name, min: draft.minutes, pts: earnedPoints(draft.minutes, rate) }),
      activityDraftPayload({
        type: draft.type,
        typeName: generated?.name ?? null,
        minutes: draft.minutes,
        desc: draft.desc.trim(),
        pointsPerHour: rate,
        day: utcDayKey(new Date()),
      }),
    );
    closeSheet();
    notify({ message: t('offline.draftSaved') });
    return null;
  };

  const save = async (draft: ActivityDraft) => {
    if (!navigator.onLine) return saveDraft(draft);
    const defs = sources.activityDefs ?? [];
    const before = levelOf(profile.points.earnedAllTime).level;
    try {
      const result = await saveActivity(uid, draft, defs);
      if (!result.ok) return result.problem;
      closeSheet();
      const level = levelOf(profile.points.earnedAllTime + result.points).level;
      const name = draft.generated?.name ?? defs.find((d) => d.id === draft.type)?.name ?? '';
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

        {drafts.value.length > 0 && (
          <Card>
            <div class="today-drafts">
              <div>
                <p class="today-drafts__title">{t('offline.pending', { count: drafts.value.length })}</p>
                <p class="today-drafts__note">{t('offline.pendingNote')}</p>
              </div>
              <Button variant="secondary" onClick={() => (reviewRequested.value = true)}>
                {t('offline.review')}
              </Button>
            </div>
          </Card>
        )}

        {/* Points, level, streak and the day's limit are what "Statystyki XP" counts:
            with it off nothing earns points, so Today does not show them. */}
        {statsOn && <PointsHero profile={profile} />}
        {statsOn && <LevelCard profile={profile} />}

        {sources.days ? (
          <>
            <RecordProgress uid={uid} profile={profile} days={sources.days} todayKey={todayKey} />
            {statsOn && <StreakCard profile={profile} days={sources.days} todayKey={todayKey} />}
            {statsOn && (
              <TodayCard
                profile={profile}
                day={sources.days.get(todayKey)}
                onLog={() => openSheet()}
                onWhatNow={() => openSheet(true)}
              />
            )}
          </>
        ) : (
          statsOn && (
            <Card>
              <Skeleton lines={4} />
            </Card>
          )
        )}

        {uid && <GoalsCard uid={uid} profile={profile} />}

        {isModuleOn('chores', profile) &&
          (sources.choreDefs && sources.choreEntries ? (
            <ChoresCard
              uid={uid}
              profile={profile}
              defs={sources.choreDefs}
              entries={sources.choreEntries}
              today={choresToday}
              onLog={logChoreToday}
              onEdit={() => setCardEditor((s) => ({ open: true, key: s.key + 1 }))}
            />
          ) : (
            <Card>
              <Skeleton />
            </Card>
          ))}

        {isModuleOn('money', profile) && typeof sources.balance === 'number' && <Balance grosze={sources.balance} />}

        <Shortcuts profile={profile} />

        {statsOn &&
          (sources.recent && sources.activityNames ? (
            <RecentActivities recent={sources.recent} names={sources.activityNames} />
          ) : (
            <Card>
              <Skeleton />
            </Card>
          ))}
      </Stack>

      {cardEditor.key > 0 && sources.choreDefs && (
        <ChoresCardSheet
          key={cardEditor.key}
          open={cardEditor.open}
          defs={sources.choreDefs}
          settings={profile.choresCard}
          shownIds={choresOnCard(sources.choreDefs, profile.choresCard, `${uid}:${choresToday}`).map((d) => d.id)}
          onClose={closeCardEditor}
          onSave={saveCard}
          onManage={() => {
            closeCardEditor();
            afterModalHistory(() => navigate('/chores/defs'));
          }}
        />
      )}
      {sheet.key > 0 && (
        <ActivitySheet
          key={sheet.key}
          open={sheet.open}
          defs={sources.activityDefs}
          earnedToday={sources.days?.get(todayKey)?.pointsEarned ?? 0}
          dailyLimit={profile.dailyLimit}
          pool={generatorPool(t('generator.pool', { returnObjects: true }), sources.activityDefs ?? [])}
          rollOnOpen={sheet.roll ?? false}
          onClose={closeSheet}
          onSave={save}
        />
      )}
    </Page>
  );
}
