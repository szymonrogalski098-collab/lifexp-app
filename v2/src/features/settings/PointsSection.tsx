// Settings → Punkty i nagrody: the daily points limit (G1) and the two rates v1
// turns points into złoty with: the general one (what points are worth, what an
// expense costs in points) and the chores one (what chores pay out).
import { useState } from 'preact/hooks';
import { DAILY_LIMIT_DEFAULT } from '@/domain/points';
import type { Profile } from '@/domain/profile';
import {
  DAILY_LIMIT_MAX,
  DAILY_LIMIT_MIN,
  RATE_CHORES_DEFAULT,
  RATE_GENERAL_DEFAULT,
  rateDraft,
  type RateDraft,
  type RateProblem,
} from '@/domain/settings';
import { locale, t } from '@/i18n';
import { formatInteger } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { saveDailyLimit, saveRate } from '@/services/settings';
import { useSettingsToast } from './toast';
import { Button } from '@/ui/components/Button';
import { MoneyField, NumberField } from '@/ui/components/Fields';
import { Card, Section } from '@/ui/components/Layout';

const RATE_PROBLEM = {
  zlotyRequired: 'settings.rateNeedZloty',
  pointsRequired: 'settings.rateNeedPoints',
  tooLarge: 'settings.rateTooLarge',
} as const;

interface RateFormProps {
  uid: string;
  kind: 'general' | 'chores';
  initial: RateDraft;
}

function RateForm({ uid, kind, initial }: RateFormProps) {
  const [draft, setDraft] = useState<RateDraft>(initial);
  const [problem, setProblem] = useState<RateProblem | null>(null);
  const { saved, failed } = useSettingsToast();
  const lang = locale();

  const set = (patch: Partial<RateDraft>) => {
    setDraft({ ...draft, ...patch });
    setProblem(null);
  };
  const submit = () => {
    const result = saveRate(uid, kind, draft);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    result.saved.catch(failed);
    saved();
  };

  const perPoint =
    draft.grosze !== null && draft.points ? formatMoney(Math.round(draft.grosze / draft.points), lang) : null;

  return (
    <form
      class="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p class="settings-note">{t(kind === 'general' ? 'settings.rateGeneralHint' : 'settings.rateChoresHint')}</p>
      <div class="settings-rate">
        <MoneyField
          size="md"
          label={t('settings.rateZloty')}
          value={draft.grosze}
          onChange={(grosze) => set({ grosze })}
          error={problem === 'zlotyRequired' ? t(RATE_PROBLEM.zlotyRequired) : null}
        />
        <NumberField
          label={t('settings.ratePoints')}
          value={draft.points}
          onChange={(points) => set({ points })}
          suffix={t('today.pointsUnit')}
          error={problem === 'pointsRequired' ? t(RATE_PROBLEM.pointsRequired) : null}
        />
      </div>
      {problem === 'tooLarge' && (
        <p class="settings-problem" role="alert">
          {t(RATE_PROBLEM.tooLarge)}
        </p>
      )}
      <p class="settings-note numeric" aria-live="polite">
        {perPoint ? t('settings.ratePerPoint', { amount: perPoint }) : ''}
      </p>
      <div>
        <Button type="submit" variant="secondary">
          {t('settings.saveRate')}
        </Button>
      </div>
    </form>
  );
}

export function PointsSection({ uid, profile }: { uid: string; profile: Profile }) {
  const [limit, setLimit] = useState<number | null>(profile.dailyLimit ?? DAILY_LIMIT_DEFAULT);
  const [limitProblem, setLimitProblem] = useState(false);
  const { saved, failed } = useSettingsToast();
  const lang = locale();

  const submitLimit = () => {
    const result = saveDailyLimit(uid, limit);
    if (!result.ok) {
      setLimitProblem(true);
      return;
    }
    result.saved.catch(failed);
    saved(t('settings.limitSaved', { limit: formatInteger(limit ?? 0, lang) }));
  };

  return (
    <>
      <Section title={t('settings.dailyLimit')}>
        <Card>
          <form
            class="stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submitLimit();
            }}
          >
            <NumberField
              label={t('settings.dailyLimitLabel')}
              value={limit}
              onChange={(value) => {
                setLimit(value);
                setLimitProblem(false);
              }}
              suffix={t('today.pointsUnit')}
              hint={t('settings.dailyLimitHint', { min: DAILY_LIMIT_MIN, max: DAILY_LIMIT_MAX })}
              error={limitProblem ? t('settings.dailyLimitRange', { min: DAILY_LIMIT_MIN, max: DAILY_LIMIT_MAX }) : null}
            />
            <div>
              <Button type="submit" variant="secondary">
                {t('settings.saveLimit')}
              </Button>
            </div>
          </form>
        </Card>
      </Section>
      <Section title={t('settings.rateGeneral')}>
        <Card>
          <RateForm uid={uid} kind="general" initial={rateDraft(profile.rateGeneral, RATE_GENERAL_DEFAULT)} />
        </Card>
      </Section>
      <Section title={t('settings.rateChores')}>
        <Card>
          <RateForm uid={uid} kind="chores" initial={rateDraft(profile.rateChores, RATE_CHORES_DEFAULT)} />
        </Card>
      </Section>
    </>
  );
}
