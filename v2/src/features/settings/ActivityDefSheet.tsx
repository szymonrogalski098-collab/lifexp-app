// A new or changed activity type in a sheet (v1 Settings → Aktywności): name, points
// per hour, and v1's icon and colour presets. v2 does not draw v1's icons (PLAN.md
// 7.1), so they are picked by name; v1 shows them in its lists. Changing a type is
// v2 only (v1 adds and deletes).
import { useState } from 'preact/hooks';
import {
  ACTIVITY_COLORS,
  ACTIVITY_ICONS,
  ACTIVITY_NAME_MAX,
  ACTIVITY_POINTS_MAX,
  NEW_ACTIVITY_DEF,
  activityDefDraft,
  type ActivityDef,
  type ActivityDefDraft,
  type ActivityDefProblem,
} from '@/domain/activity';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { Button } from '@/ui/components/Button';
import { NumberField, Select, TextField } from '@/ui/components/Fields';
import { Sheet } from '@/ui/components/Sheet';

const FORM_ID = 'activity-def-form';

const PROBLEM_KEY = {
  nameRequired: 'settings.activityNeedName',
  pointsRequired: 'settings.activityNeedPoints',
  pointsTooMany: 'settings.activityPointsTooMany',
} as const;

/** v1's icon ids → their names in i18n. */
const ICON_NAMES = {
  'ti-book': 'book',
  'ti-code': 'code',
  'ti-run': 'run',
  'ti-school': 'school',
  'ti-book-2': 'book2',
  'ti-music': 'music',
  'ti-palette': 'palette',
  'ti-language': 'language',
  'ti-bike': 'bike',
  'ti-dumbbell': 'dumbbell',
  'ti-pencil': 'pencil',
  'ti-brain': 'brain',
} as const satisfies Record<(typeof ACTIVITY_ICONS)[number], string>;

/** v1's colours → their names in i18n. */
const COLOR_NAMES = {
  '#6c63ff': 'violet',
  '#4ecca3': 'green',
  '#ffd700': 'gold',
  '#ff6b6b': 'red',
  '#8a8fa8': 'gray',
  '#ff9f43': 'orange',
  '#00d2d3': 'teal',
  '#feca57': 'yellow',
} as const satisfies Record<(typeof ACTIVITY_COLORS)[number], string>;

function iconName(icon: string): string {
  return Object.hasOwn(ICON_NAMES, icon)
    ? t(`settings.activityIconNames.${ICON_NAMES[icon as keyof typeof ICON_NAMES]}`)
    : t('settings.activityIconOther');
}

export function colorName(color: string): string {
  return Object.hasOwn(COLOR_NAMES, color)
    ? t(`settings.activityColorNames.${COLOR_NAMES[color as keyof typeof COLOR_NAMES]}`)
    : t('settings.activityColorOther');
}

/** v1's colours as radios, each a swatch with its name; a colour from outside them stays first. */
function ColorPicker({ value, onChange, extra }: { value: string; onChange: (color: string) => void; extra?: string | null }) {
  const colors = [...(extra && !(ACTIVITY_COLORS as readonly string[]).includes(extra) ? [extra] : []), ...ACTIVITY_COLORS];
  return (
    <fieldset class="settings-colors">
      <legend class="ui-field__label">{t('settings.activityColor')}</legend>
      <div class="settings-colors__options">
        {colors.map((color) => (
          <label key={color} class="settings-colors__option">
            <input
              class="settings-colors__input"
              type="radio"
              name="activity-color"
              value={color}
              checked={color === value}
              onChange={() => onChange(color)}
            />
            <span class="settings-swatch" style={{ '--swatch': color }} aria-hidden="true" />
            <span class="settings-colors__name">{colorName(color)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface ActivityDefSheetProps {
  open: boolean;
  /** The type being changed; absent for a new one. */
  def?: ActivityDef;
  onClose: () => void;
  /** Returns a problem to show, or null when saved. */
  onSave: (draft: ActivityDefDraft) => ActivityDefProblem | null;
}

export function ActivityDefSheet({ open, def, onClose, onSave }: ActivityDefSheetProps) {
  const [draft, setDraft] = useState<ActivityDefDraft>(def ? activityDefDraft(def) : NEW_ACTIVITY_DEF);
  const [problem, setProblem] = useState<ActivityDefProblem | null>(null);
  const set = (patch: Partial<ActivityDefDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const error = (...kinds: ActivityDefProblem[]) =>
    problem && kinds.includes(problem) ? t(PROBLEM_KEY[problem], { max: formatInteger(ACTIVITY_POINTS_MAX, locale()) }) : null;
  const icons = [
    ...(def?.icon && !(ACTIVITY_ICONS as readonly string[]).includes(def.icon) ? [def.icon] : []),
    ...ACTIVITY_ICONS,
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(def ? 'settings.activityEdit' : 'settings.activityNew')}
      footer={
        <Button type="submit" form={FORM_ID} variant="primary" size="lg" block>
          {t(def ? 'settings.activitySave' : 'settings.activityAdd')}
        </Button>
      }
    >
      <form
        id={FORM_ID}
        class="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setProblem(onSave(draft));
        }}
      >
        <TextField
          label={t('settings.activityName')}
          value={draft.name}
          onInput={(name) => set({ name })}
          placeholder={t('settings.activityNamePh')}
          maxLength={ACTIVITY_NAME_MAX}
          error={error('nameRequired')}
        />
        <NumberField
          label={t('settings.activityPoints')}
          value={draft.points}
          onChange={(points) => set({ points })}
          suffix={t('settings.perHour')}
          hint={t('settings.activityPointsHint')}
          error={error('pointsRequired', 'pointsTooMany')}
        />
        <Select<string>
          label={t('settings.activityIcon')}
          value={draft.icon}
          options={icons.map((icon) => ({ value: icon, label: iconName(icon) }))}
          onChange={(icon) => set({ icon })}
          hint={t('settings.activityIconHint')}
        />
        <ColorPicker value={draft.color} onChange={(color) => set({ color })} extra={def?.color} />
      </form>
    </Sheet>
  );
}
