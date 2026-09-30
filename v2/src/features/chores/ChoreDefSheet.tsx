// A new chore in a sheet (PLAN.md 7.6; v1 Settings → "Zarządzaj obowiązkami"): name,
// optional description, points, one of v1's emoji or none, and whether it disappears
// after being logged once. Checked by domain/chores, as v1 checks it.
import { useState } from 'preact/hooks';
import {
  CHORE_DESC_MAX,
  CHORE_EMOJIS,
  CHORE_NAME_MAX,
  CHORE_POINTS_MAX,
  type ChoreDefDraft,
  type ChoreDefProblem,
} from '@/domain/chores';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { Button } from '@/ui/components/Button';
import { NumberField, SegmentedControl, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

const FORM_ID = 'chore-def-form';

const PROBLEM_KEY = {
  nameRequired: 'chores.needName',
  pointsRequired: 'chores.needPoints',
  pointsTooMany: 'chores.pointsTooMany',
} as const;

type Kind = 'repeat' | 'once';

/** v1's emoji grid as radios, "none" first; the chosen one in the legend. */
function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  return (
    <fieldset class="chores-emojis">
      <legend class="ui-field__label">
        {t('chores.emoji')}: <span class="chores-emojis__current">{value || t('chores.noEmoji')}</span>
      </legend>
      <div class="chores-emojis__options">
        {['', ...CHORE_EMOJIS].map((emoji) => (
          <label key={emoji || 'none'} class="chores-emojis__option">
            <input
              class="chores-emojis__input"
              type="radio"
              name="chore-emoji"
              value={emoji}
              checked={emoji === value}
              onChange={() => onChange(emoji)}
            />
            <span class="chores-emojis__tile" aria-hidden="true">
              {emoji || '–'}
            </span>
            <span class="visually-hidden">{emoji || t('chores.noEmoji')}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface ChoreDefSheetProps {
  open: boolean;
  onClose: () => void;
  /** Returns a problem to show, or null when saved. */
  onSave: (draft: ChoreDefDraft) => ChoreDefProblem | null;
}

export function ChoreDefSheet({ open, onClose, onSave }: ChoreDefSheetProps) {
  const [draft, setDraft] = useState<ChoreDefDraft>({ name: '', desc: '', emoji: '', points: null, oneTime: false });
  const [problem, setProblem] = useState<ChoreDefProblem | null>(null);
  const set = (patch: Partial<ChoreDefDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (...kinds: ChoreDefProblem[]) =>
    problem && kinds.includes(problem) ? t(PROBLEM_KEY[problem], { max: formatInteger(CHORE_POINTS_MAX, locale()) }) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('chores.newDef')}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" size="lg" block>
          {t('chores.add')}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        class="stack"
        // Our messages (translated, next to the field) instead of the browser's bubbles.
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setProblem(onSave(draft));
        }}
      >
        <TextField
          label={t('chores.name')}
          value={draft.name}
          onInput={(name) => set({ name })}
          placeholder={t('chores.namePh')}
          maxLength={CHORE_NAME_MAX}
          error={error('nameRequired')}
        />
        <TextField
          label={t('chores.desc')}
          value={draft.desc}
          onInput={(desc) => set({ desc })}
          maxLength={CHORE_DESC_MAX}
        />
        <NumberField
          label={t('chores.points')}
          value={draft.points}
          onChange={(points) => set({ points })}
          suffix={t('chores.pointsUnit')}
          error={error('pointsRequired', 'pointsTooMany')}
        />
        <EmojiPicker value={draft.emoji} onChange={(emoji) => set({ emoji })} />
        <div class="stack chores-kind">
          <SegmentedControl<Kind>
            label={t('chores.kind')}
            value={draft.oneTime ? 'once' : 'repeat'}
            options={[
              { value: 'repeat', label: t('chores.repeat') },
              { value: 'once', label: t('chores.once') },
            ]}
            onChange={(kind) => set({ oneTime: kind === 'once' })}
          />
          <p class="chores-sheet__hint">{t(draft.oneTime ? 'chores.onceHint' : 'chores.repeatHint')}</p>
        </div>
      </form>
    </Sheet>
  );
}
