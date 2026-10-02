// Settings → Konto: solo or supervised (v1 setAccountMode; going solo with a parent
// linked asks first, because it unlinks them) and the name LifeXP greets the person
// with (v1 saveSettings).
import { useState } from 'preact/hooks';
import type { AccountMode, Profile } from '@/domain/profile';
import { NAME_MAX, type NameProblem } from '@/domain/settings';
import { t } from '@/i18n';
import { accountModeNeedsConfirm, saveAccountMode, saveName } from '@/services/settings';
import { useSettingsToast } from './toast';
import { Button } from '@/ui/components/Button';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { SegmentedControl, TextField } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';

const MODES: readonly AccountMode[] = ['solo', 'supervised'];

function AccountModeCard({ uid, profile }: { uid: string; profile: Profile }) {
  const [confirming, setConfirming] = useState(false);
  const { saved, failed } = useSettingsToast();

  const apply = (mode: AccountMode) => {
    saveAccountMode(uid, profile, mode).catch(failed);
    saved(t('settings.accountModeSaved'));
  };
  const choose = (mode: AccountMode) => {
    if (mode === profile.accountMode) return;
    if (accountModeNeedsConfirm(profile, mode)) setConfirming(true);
    else apply(mode);
  };

  return (
    <Section title={t('settings.accountMode')}>
      <Card>
        <Stack gap="sm">
          <SegmentedControl<AccountMode>
            label={t('settings.accountMode')}
            value={profile.accountMode ?? 'solo'}
            options={MODES.map((m) => ({
              value: m,
              label: t(`setup.modes.${m}`),
            }))}
            onChange={choose}
          />
          <p class="settings-note">
            {t(
              profile.accountMode === 'supervised'
                ? 'setup.modeDescriptions.supervised'
                : 'setup.modeDescriptions.solo',
            )}
          </p>
          <p class="settings-note">{t('settings.accountModeHint')}</p>
        </Stack>
      </Card>
      <ConfirmDialog
        open={confirming}
        title={t('settings.goSoloTitle')}
        body={t('settings.goSoloBody')}
        confirmLabel={t('settings.goSolo')}
        danger
        onConfirm={() => {
          setConfirming(false);
          apply('solo');
        }}
        onCancel={() => setConfirming(false)}
      />
    </Section>
  );
}

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
    <>
      <AccountModeCard uid={uid} profile={profile} />
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
    </>
  );
}
