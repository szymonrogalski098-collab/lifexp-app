// The statistics overview: all-time totals, points and gaming for the last 7 days,
// the most frequent activities and the facts — v1's stats page and the stats part
// of its dashboard (docs/v2/GOLDEN.md G14). Nothing here writes.
import { Lightbulb } from 'lucide-preact';
import { useEffect } from 'preact/hooks';
import type { Profile } from '@/domain/profile';
import { generalRate } from '@/domain/points';
import {
  statsFacts,
  statsWeeks,
  sumGaming,
  TOP_COUNT,
  topActivities,
  type StatsDay,
  type StatsFact,
  type TopActivity,
} from '@/domain/stats';
import { locale, t } from '@/i18n';
import { formatDayKey, formatWeekdayLong, formatWeekdayShort, utcDayKey } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { stats as statsSources, watchStats } from '@/stores/stats';
import { BarChart, type BarDatum } from '@/ui/components/BarChart';
import { EmphasisText, EmptyState, IconTile, List, ListRow, Metric, Skeleton } from '@/ui/components/Display';
import { Card, Section } from '@/ui/components/Layout';
import { formatDuration } from '@/features/shared/activity';

function Totals({ profile, gamingMinutes }: { profile: Profile; gamingMinutes: number | undefined }) {
  const lang = locale();
  return (
    <Card>
      <div class="stats-totals">
        <Metric label={t('stats.totalEarned')} value={formatInteger(profile.points.earnedAllTime, lang)} />
        <Metric label={t('stats.totalSpent')} value={formatInteger(profile.points.spentAllTime, lang)} />
        <Metric
          label={t('stats.gamingWeek')}
          value={gamingMinutes === undefined ? '…' : formatDuration(gamingMinutes)}
        />
      </div>
    </Card>
  );
}

function bars(
  week: readonly StatsDay[],
  todayKey: string,
  pick: (day: StatsDay) => number,
  unit: (n: number) => string,
): BarDatum[] {
  const lang = locale();
  return week.map((day) => {
    const value = pick(day);
    const title = formatDayKey(day.key, lang);
    const valueLabel = unit(value);
    return {
      key: day.key,
      label: formatWeekdayShort(day.key, lang),
      value,
      valueText: formatInteger(value, lang),
      title,
      valueLabel,
      description: t('stats.dayValue', { day: title, value: valueLabel }),
      current: day.key === todayKey,
    };
  });
}

function WeekChart({ title, data }: { title: string; data: BarDatum[] }) {
  return (
    <Section title={title}>
      <Card>
        <BarChart label={title} data={data} />
      </Card>
    </Section>
  );
}

function TopList({ top, names }: { top: readonly TopActivity[]; names: ReadonlyMap<string, string> }) {
  return (
    <Section title={t('stats.top')} action={<span class="stats-note">{t('stats.topNote')}</span>}>
      <Card padding="none">
        {top.length === 0 ? (
          <EmptyState title={t('stats.noTop')} />
        ) : (
          <List label={t('stats.top')}>
            {top.slice(0, TOP_COUNT).map((group, i) => (
              <ListRow
                key={group.type}
                leading={
                  <IconTile>
                    <span class="stats-rank numeric">{i + 1}</span>
                  </IconTile>
                }
                // v1 names the group by its definition, else shows the raw id.
                title={names.get(group.type) ?? group.type}
                meta={t('stats.topCount', { count: group.count })}
                value={t('units.pointsGained', { points: group.points })}
                valueTone="positive"
              />
            ))}
          </List>
        )}
      </Card>
    </Section>
  );
}

function factText(fact: StatsFact, names: ReadonlyMap<string, string>): string {
  const lang = locale();
  switch (fact.kind) {
    case 'favoriteActivity':
      return t('stats.fact.favoriteActivity', { name: names.get(fact.type) ?? fact.type, count: fact.count });
    case 'moreThisWeek':
      return t('stats.fact.moreThisWeek', { diff: fact.diff, cur: fact.cur, prev: fact.prev });
    case 'moreLastWeek':
      return t('stats.fact.moreLastWeek', { diff: fact.diff });
    case 'sameAsLastWeek':
      return t('stats.fact.sameAsLastWeek', { cur: fact.cur });
    case 'weekMoney':
      return t('stats.fact.weekMoney', { amount: formatMoney(fact.grosze, lang) });
    case 'gamedMoreThisWeek':
      return t('stats.fact.gamedMoreThisWeek', { diff: formatDuration(fact.minutes) });
    case 'gamedLessThisWeek':
      return t('stats.fact.gamedLessThisWeek', { diff: formatDuration(fact.minutes) });
    case 'bestDay':
      return t('stats.fact.bestDay', { day: formatWeekdayLong(fact.day, lang), points: fact.points });
  }
}

function Facts({ facts, names }: { facts: readonly StatsFact[]; names: ReadonlyMap<string, string> }) {
  // v1 hides the card when there is nothing to say.
  if (facts.length === 0) return null;
  return (
    <Section title={t('stats.facts')}>
      <Card>
        <ul class="stats-facts" aria-label={t('stats.facts')}>
          {facts.map((fact) => (
            <li key={fact.kind} class="stats-fact">
              <Lightbulb aria-hidden="true" />
              <p>
                <EmphasisText text={factText(fact, names)} />
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

function Loading() {
  return (
    <Card>
      <Skeleton lines={4} />
    </Card>
  );
}

export function OverviewView({ uid, profile }: { uid: string; profile: Profile }) {
  useEffect(() => watchStats(uid), [uid]);
  const sources = statsSources.value;
  const todayKey = utcDayKey(new Date());
  const weeks = sources.days ? statsWeeks(sources.days, todayKey) : undefined;
  const top = sources.latest ? topActivities(sources.latest) : undefined;
  const pointsUnit = (n: number) => t('units.points', { points: n });

  return (
    <>
      {sources.failed && (
        <p class="stats-error" role="alert">
          {t('stats.loadFailed')}
        </p>
      )}

      <Totals profile={profile} gamingMinutes={weeks && sumGaming(weeks.thisWeek)} />

      {weeks ? (
        <>
          <WeekChart
            title={t('stats.pointsChart')}
            data={bars(weeks.thisWeek, todayKey, (d) => d.points, pointsUnit)}
          />
          <WeekChart
            title={t('stats.gamingChart')}
            data={bars(weeks.thisWeek, todayKey, (d) => d.gamingMinutes, formatDuration)}
          />
        </>
      ) : (
        <Loading />
      )}

      {top && sources.activityNames ? <TopList top={top} names={sources.activityNames} /> : <Loading />}

      {weeks && top && sources.activityNames && (
        <Facts
          facts={statsFacts(weeks, top, generalRate(profile.rateGeneral.zloty, profile.rateGeneral.points))}
          names={sources.activityNames}
        />
      )}
    </>
  );
}
