// A month of chores as v1 draws it (renderCalendar): Monday first, days with entries
// marked and showing their points, today ringed. Days with entries open their list.
import { calendarMonth, pointsByDay, type ChoreEntry } from '@/domain/chores';
import { locale, t } from '@/i18n';
import { formatDayMonth, formatWeekdayShort, weekOf } from '@/lib/dates';

interface ChoreCalendarProps {
  monthKey: string;
  /** The month's entries. */
  entries: readonly ChoreEntry[];
  today: string;
  selected: string | null;
  onSelect: (day: string | null) => void;
}

export function ChoreCalendar({ monthKey, entries, today, selected, onSelect }: ChoreCalendarProps) {
  const lang = locale();
  const { leadingBlanks, days } = calendarMonth(monthKey);
  const points = pointsByDay(entries);

  return (
    <div class="chores-cal">
      <div class="chores-cal__weekdays" aria-hidden="true">
        {weekOf(today).map((key) => (
          <span key={key}>{formatWeekdayShort(key, lang)}</span>
        ))}
      </div>
      <ol class="chores-cal__grid" aria-label={t('chores.calendar')}>
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <li key={`blank-${i}`} class="chores-cal__blank" aria-hidden="true" />
        ))}
        {days.map((day) => {
          const dayPoints = points.get(day);
          const date = formatDayMonth(day, lang);
          const cls = `chores-cal__day${day === today ? ' chores-cal__day--today' : ''}`;
          return (
            <li key={day}>
              {dayPoints === undefined ? (
                <span class={cls} aria-label={t('chores.dayEmpty', { date })}>
                  <span class="chores-cal__num">{Number(day.slice(8))}</span>
                </span>
              ) : (
                <button
                  type="button"
                  class={`${cls} chores-cal__day--has`}
                  aria-pressed={day === selected}
                  aria-label={t('chores.dayLabel', { date, points: dayPoints })}
                  onClick={() => onSelect(day === selected ? null : day)}
                >
                  <span class="chores-cal__num">{Number(day.slice(8))}</span>
                  <span class="chores-cal__pts numeric">{dayPoints}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
