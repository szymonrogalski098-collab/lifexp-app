// Logging an activity (v1 #page-log-activity, GOLDEN G1): what, how long, a note.
// Below the time the sheet says what will be credited, already cut to what is left
// of today's limit, as v1's preview does. Saving waits for the server, which checks
// the limit again; the sheet stays open until it answers. "Losuj" is v1's "Co
// teraz?" generator in the same sheet: it picks from v1's pool and the person's own
// activities and fills in the type (never a sheet opened from a sheet, PLAN.md 7.5).
import { useState } from 'preact/hooks';
import { Dices } from 'lucide-preact';
import {
  ACTIVITY_MIN_MINUTES,
  GENERATED_TYPE,
  creditActivity,
  pickActivity,
  type ActivityDef,
  type ActivityDraft,
  type ActivityProblem,
  type GeneratorPick,
} from '@/domain/activity';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { Button } from '@/ui/components/Button';
import { Skeleton } from '@/ui/components/Display';
import { FilterChip, NumberField, Select, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

type Problem = ActivityProblem | 'dailyLimit';

/** One tap for the usual lengths; any other goes in the field. */
const QUICK_MINUTES = [15, 30, 45, 60, 90, 120] as const;

interface ActivitySheetProps {
  open: boolean;
  /** undefined = still loading. */
  defs: readonly ActivityDef[] | undefined;
  /** Points of the UTC day so far. */
  earnedToday: number;
  dailyLimit: number | null;
  /** The generator's pool (v1's activities, then the person's). */
  pool: readonly GeneratorPick[];
  /** Opened from "Co teraz?": the sheet starts with a pick. */
  rollOnOpen: boolean;
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<Problem | null>;
}

/** The draft for a pick: its definition, or the pool's own activity under v1's generated type. */
function draftFor(pick: GeneratorPick | null, draft: ActivityDraft): ActivityDraft {
  if (!pick) return draft;
  return pick.defId
    ? { ...draft, type: pick.defId, generated: null }
    : { ...draft, type: GENERATED_TYPE, generated: { name: pick.name, points: pick.points } };
}

export function ActivitySheet({ open, defs, earnedToday, dailyLimit, pool, rollOnOpen, onClose, onSave }: ActivitySheetProps) {
  const empty: ActivityDraft = { type: null, minutes: null, desc: '', generated: null };
  const [draft, setDraft] = useState<ActivityDraft>(() => (rollOnOpen ? draftFor(pickActivity(pool), empty) : empty));
  const [picked, setPicked] = useState<string | null>(() =>
    rollOnOpen && draft.type ? (draft.generated?.name ?? defs?.find((d) => d.id === draft.type)?.name ?? null) : null,
  );
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  const lang = locale();

  const set = (patch: Partial<ActivityDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setProblem(await onSave(draft));
    } finally {
      setSaving(false);
    }
  };

  const roll = () => {
    const pick = pickActivity(pool);
    if (!pick) return;
    setDraft(draftFor(pick, draft));
    setPicked(pick.name);
    setProblem(null);
  };

  const rate =
    draft.type === GENERATED_TYPE ? draft.generated?.points : defs?.find((d) => d.id === draft.type)?.points;
  const credit =
    rate !== undefined && draft.minutes !== null && draft.minutes >= ACTIVITY_MIN_MINUTES
      ? creditActivity(draft.minutes, rate, earnedToday, dailyLimit)
      : null;
  const preview = !credit
    ? undefined
    : credit.points === 0
      ? t('activity.limitReached', { limit: formatInteger(credit.limit, lang) })
      : credit.points < credit.earned
        ? t('activity.willEarnCapped', {
            points: formatInteger(credit.points, lang),
            earned: formatInteger(credit.earned, lang),
            limit: formatInteger(credit.limit, lang),
          })
        : t('activity.willEarn', { points: formatInteger(credit.points, lang) });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('activity.sheetTitle')}
      footer={
        <div class="activity-sheet__footer">
          {problem === 'dailyLimit' && (
            <p class="activity-sheet__problem" role="alert">
              {t('activity.dailyLimit')}
            </p>
          )}
          <Button
            type="submit"
            form="activity-form"
            variant="primary"
            size="lg"
            block
            busy={saving}
            disabled={saving || !defs || defs.length === 0}
          >
            {t('activity.log')}
          </Button>
        </div>
      }
    >
      {!defs ? (
        <Skeleton lines={3} />
      ) : defs.length === 0 ? (
        <p class="activity-sheet__note">{t('activity.noDefs')}</p>
      ) : (
        <form
          id="activity-form"
          class="stack"
          // Our messages (translated, next to the field) instead of the browser's bubbles.
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div class="activity-sheet__roll">
            <p class="activity-sheet__roll-text" aria-live="polite">
              {picked ? t('generator.picked', { name: picked }) : t('generator.hint')}
            </p>
            <Button variant="secondary" onClick={roll}>
              <Dices aria-hidden="true" />
              {t('generator.roll')}
            </Button>
          </div>
          <Select<string>
            label={t('activity.type')}
            value={draft.type ?? ''}
            options={[
              { value: '', label: t('activity.choose') },
              ...(draft.type === GENERATED_TYPE && draft.generated
                ? [
                    {
                      value: GENERATED_TYPE,
                      label: t('activity.option', { name: draft.generated.name, points: draft.generated.points }),
                    },
                  ]
                : []),
              ...defs.map((d) => ({ value: d.id, label: t('activity.option', { name: d.name, points: d.points }) })),
            ]}
            onChange={(type) => {
              set({ type: type || null, generated: type === GENERATED_TYPE ? draft.generated : null });
              setPicked(null);
            }}
            error={problem === 'typeRequired' ? t('activity.needType') : null}
          />
          <div class="stack activity-sheet__time">
            <NumberField
              label={t('activity.minutes')}
              value={draft.minutes}
              onChange={(minutes) => set({ minutes })}
              suffix={t('activity.minutesUnit')}
              error={problem === 'minMinutes' ? t('activity.needMinutes', { min: ACTIVITY_MIN_MINUTES }) : null}
            />
            <div class="activity-sheet__chips" role="group" aria-label={t('activity.quickMinutes')}>
              {QUICK_MINUTES.map((m) => (
                <FilterChip
                  key={m}
                  label={t('units.minutes', { m })}
                  selected={draft.minutes === m}
                  onToggle={() => set({ minutes: m })}
                />
              ))}
            </div>
            {/* Under the quick picks, so they sit right below the field; read out when it changes. */}
            <p class={`activity-sheet__preview${credit?.points === 0 ? ' activity-sheet__preview--none' : ''}`} aria-live="polite">
              {preview}
            </p>
          </div>
          <TextField
            label={t('activity.desc')}
            value={draft.desc}
            onInput={(desc) => set({ desc })}
            placeholder={t('activity.descPh')}
          />
        </form>
      )}
    </Sheet>
  );
}
