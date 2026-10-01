// Pieces shared by the screens that list activities (Today, History).
import { Zap } from 'lucide-preact';
import { activityName, type Activity } from '@/domain/activity';
import { locale, t } from '@/i18n';
import { formatShortDate } from '@/lib/dates';
import { splitMinutes } from '@/lib/format';
import { Button } from '@/ui/components/Button';
import { IconTile, ListRow } from '@/ui/components/Display';

/** "45 min", "2 h", "1 h 5 min". */
export function formatDuration(minutes: number): string {
  const { hours, minutes: rest } = splitMinutes(minutes);
  if (hours === 0) return t('units.minutes', { m: rest });
  return rest === 0 ? t('units.hours', { h: hours }) : t('units.hoursMinutes', { h: hours, m: rest });
}

interface ActivityRowProps {
  activity: Activity;
  names: ReadonlyMap<string, string>;
  /** Shows "Delete" (G11); the caller confirms first. */
  onDelete?: (activity: Activity) => void;
}

/** One logged activity as v1's activityRowHTML() shows it: name, duration · day · note, points. */
export function ActivityRow({ activity, names, onDelete }: ActivityRowProps) {
  const name = activityName(activity, names);
  return (
    <ListRow
      leading={
        <IconTile tone="positive">
          <Zap />
        </IconTile>
      }
      title={name}
      meta={[formatDuration(activity.duration), formatShortDate(activity.at, locale()), activity.desc]
        .filter(Boolean)
        .join(' · ')}
      value={t('units.pointsGained', { points: activity.points })}
      valueTone="positive"
      trailing={
        onDelete && (
          <Button variant="quiet" onClick={() => onDelete(activity)} aria-label={t('activity.deleteNamed', { name })}>
            {t('activity.delete')}
          </Button>
        )
      }
    />
  );
}
