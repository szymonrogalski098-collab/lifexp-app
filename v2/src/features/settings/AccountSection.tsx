// Settings → Konto: the name LifeXP greets the person with (v1 saveSettings).
import { useState } from 'preact/hooks';
import type { Profile } from '@/domain/profile';
import { NAME_MAX, type NameProblem } from '@/domain/settings';
import { t } from '@/i18n';
import { saveName } from '@/services/settings';
import { useSettingsToast } from './toast';
import { Button } from '@/ui/components/Button';
import { TextField } from '@/ui/components/Fields';
import { Card, Section } from '@/ui/components/Layout';

export function AccountSection({ uid, profile }: { uid: string; profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [problem, setProblem] = useState<NameProblem | null>(null);
  const { saved, failed } = useSettingsToast();

  const submit = () => {
    const result = saveName(uid, name);
    if (!result.ok) {
      setProblem(result.problem);
      return;
    }
    result.saved.catch(failed);
    setName(name.trim());
    saved();
  };

  return (
    <Section title={t('settings.profile')}>
      <Card>
        <form
          class="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label={t('settings.name')}
            value={name}
            onInput={(value) => {
              setName(value);
              setProblem(null);
            }}
            autoComplete="given-name"
            hint={t('settings.nameHint')}
            error={problem === 'tooLong' ? t('settings.nameTooLong', { max: NAME_MAX }) : null}
          />
          <div>
            <Button type="submit" variant="primary">
              {t('settings.save')}
            </Button>
          </div>
        </form>
      </Card>
    </Section>
  );
}
