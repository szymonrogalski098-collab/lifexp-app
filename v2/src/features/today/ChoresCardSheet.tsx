// The editor of Today's chore card ("Edytuj listę"): 3–4 chores drawn every day,
// or the chores ticked here, every day. Switching to "Wybrane" starts from what the
// card shows now. Adding and removing chores themselves happens on the chore list.
import { useState } from 'preact/hooks';
import type { ChoreDef, ChoresCardSettings } from '@/domain/chores';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { Checkbox, SegmentedControl } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

interface ChoresCardSheetProps {
  open: boolean;
  defs: readonly ChoreDef[];
  settings: ChoresCardSettings;
  /** What the card shows today, the starting point of a new "Wybrane" list. */
  shownIds: readonly string[];
  onClose: () => void;
  /** Resolves to a problem to show, or null when saved. */
  onSave: (settings: ChoresCardSettings) => 'noneChosen' | null;
  onManage: () => void;
}

export function ChoresCardSheet({ open, defs, settings, shownIds, onClose, onSave, onManage }: ChoresCardSheetProps) {
  const [mode, setMode] = useState(settings.mode);
  const [ids, setIds] = useState<readonly string[]>(
    settings.mode === 'chosen' ? settings.ids.filter((id) => defs.some((d) => d.id === id)) : shownIds,
  );
  const [problem, setProblem] = useState<'noneChosen' | null>(null);

  const toggle = (id: string, checked: boolean) => {
    setIds(checked ? [...ids, id] : ids.filter((x) => x !== id));
    setProblem(null);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('today.cardTitle')}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => setProblem(onSave(mode === 'chosen' ? { mode, ids } : { mode: 'random', ids: [] }))}
        >
          {t('today.cardSave')}
        </Button>
      }
    >
      <div class="stack today-card-sheet">
        <SegmentedControl<ChoresCardSettings['mode']>
          label={t('today.cardMode')}
          value={mode}
          options={[
            { value: 'random', label: t('today.cardRandom') },
            { value: 'chosen', label: t('today.cardChosen') },
          ]}
          onChange={(next) => {
            setMode(next);
            setProblem(null);
          }}
        />
        <p class="today-card-sheet__hint">{t(mode === 'random' ? 'today.cardRandomHint' : 'today.cardChosenHint')}</p>
        {mode === 'chosen' && (
          <fieldset class="today-card-sheet__picks">
            <legend class="visually-hidden">{t('today.cardPick')}</legend>
            {defs.map((def) => (
              <Checkbox
                key={def.id}
                label={def.name}
                checked={ids.includes(def.id)}
                onChange={(checked) => toggle(def.id, checked)}
                leading={
                  def.emoji ? (
                    <span class="today-chore__emoji" aria-hidden="true">
                      {def.emoji}
                    </span>
                  ) : undefined
                }
                meta={t('units.pointsGained', { points: def.points })}
              />
            ))}
          </fieldset>
        )}
        {problem && (
          <p class="today-card-sheet__problem" role="alert">
            {t('today.cardNoneChosen')}
          </p>
        )}
        <Button variant="quiet" onClick={onManage}>
          {t('today.cardManage')}
        </Button>
      </div>
    </Sheet>
  );
}
