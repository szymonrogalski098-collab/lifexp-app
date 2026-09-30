// Pieces shared by the screens that list activities (Today, History).
import { Zap } from 'lucide-preact';
import { activityName, type Activity } from '@/domain/activity';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { splitMinutes } from '@/lib/format';
import { IconTile, ListRow } from '@/ui/components/Display';

/** "45 min", "2 h", "1 h 5 min". */
export function formatDuration(minutes: number): string {
  const { hours, minutes: rest } = splitMinutes(minutes);
  if (hours === 0) return t('units.minutes', { m: rest });
  return rest === 0 ? t('units.hours', { h: hours }) : t('units.hoursMinutes', { h: hours, m: rest });
}

/** One logged activity as v1's activityRowHTML() shows it: name, duration · day · note, points. */
export function ActivityRow({ activity, names }: { activity: Activity; names: ReadonlyMap<string, string> }) {
  return (
    <ListRow
      leading={
        <IconTile tone="positive">
          <Zap />
        </IconTile>
      }
      title={activityName(activity, names)}
      meta={[formatDuration(activity.duration), formatShortDate(activity.at, locale()), activity.desc]
        .filter(Boolean)
        .join(' · ')}
      value={t('units.pointsGained', { points: activity.points })}
      valueTone="positive"
    />
  );
}
