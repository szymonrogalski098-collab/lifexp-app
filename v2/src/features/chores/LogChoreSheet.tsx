// Logging a chore (v1 openChoreSheet + askYesterday): pick one from the list; if it
// is already logged today and not yesterday, the same sheet asks "today or
// yesterday?" (PLAN.md 7.5: never a sheet opened from a sheet).
import { useState } from 'preact/hooks';
import type { ChoreDef } from '@/domain/chores';
import { locale, t } from '@/i18n';
import { formatDayMonth } from '@/lib/dates';
import { Button } from '@/ui/components/Button';
import { EmptyState, List, ListRow } from '@/ui/components/Display';
import { Card } from '@/ui/components/Layout';
import { Sheet } from '@/ui/components/Sheet';

interface LogChoreSheetProps {
  open: boolean;
  defs: readonly ChoreDef[];
  yesterday: string;
  onClose: () => void;
  /** 'today' logs at once; 'ask' → the sheet asks, then calls onLog with the chosen day. */
  decide: (def: ChoreDef) => 'today' | 'ask';
  onLog: (def: ChoreDef, when: 'today' | 'yesterday') => void;
}

export function LogChoreSheet({ open, defs, yesterday, onClose, decide, onLog }: LogChoreSheetProps) {
  const [asking, setAsking] = useState<ChoreDef | null>(null);

  const pick = (def: ChoreDef) => {
    if (decide(def) === 'ask') setAsking(def);
    else onLog(def, 'today');
  };

  return (
    <Sheet open={open} onClose={onClose} title={t(asking ? 'chores.whenTitle' : 'chores.sheetTitle')}>
      {asking ? (
        <div class="stack chores-when">
          <p>{t('chores.whenText', { name: asking.name, date: formatDayMonth(yesterday, locale()) })}</p>
          <div class="chores-when__actions">
            <Button variant="secondary" size="lg" block onClick={() => onLog(asking, 'today')}>
              {t('chores.today')}
            </Button>
            <Button variant="primary" size="lg" block onClick={() => onLog(asking, 'yesterday')}>
              {t('chores.yesterday')}
            </Button>
          </div>
        </div>
      ) : defs.length === 0 ? (
        <EmptyState title={t('chores.sheetEmpty')} />
      ) : (
        <div class="stack">
          <p class="chores-sheet__hint">{t('chores.sheetHint')}</p>
          <Card padding="none">
            <List label={t('chores.sheetTitle')}>
              {defs.map((def) => (
                <ListRow
                  key={def.id}
                  leading={
                    <span class="chores-emoji" aria-hidden="true">
                      {def.emoji}
                    </span>
                  }
                  title={def.name}
                  meta={def.oneTime ? t('chores.oneTime') : undefined}
                  value={t('units.pointsGained', { points: def.points })}
                  valueTone="positive"
                  onClick={() => pick(def)}
                />
              ))}
            </List>
          </Card>
        </div>
      )}
    </Sheet>
  );
}
