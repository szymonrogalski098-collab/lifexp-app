// Settings → Konto, supervised accounts only (v1 applyAccountModeVisibility): the
// parent's e-mail, verified with a code (v1 updateParentEmailUI's four states), and
// the weekly report that goes to it (v1 toggleAutoReport).
import { useEffect, useState } from 'preact/hooks';
import { parentEmailState, type CodeProblem } from '@/domain/parent-email';
import type { Profile } from '@/domain/profile';
import { t } from '@/i18n';
import { cancelParentCode, saveAutoReport, sendParentCode, verifyParentCode, type SendProblem } from '@/services/parent-email';
import { useSettingsToast } from './toast';
import { Button } from '@/ui/components/Button';
import { Switch, TextField } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';

const SEND_PROBLEM = {
  invalid: 'settings.parentEmailInvalid',
  sendFailed: 'settings.parentEmailSendFailed',
} as const satisfies Record<SendProblem, string>;

const CODE_PROBLEM = {
  noPending: 'settings.parentCodeNoPending',
  expired: 'settings.parentCodeExpired',
  invalid: 'settings.parentCodeInvalid',
} as const satisfies Record<CodeProblem, string>;

function AddressForm({ uid, profile, initial, onCancel }: { uid: string; profile: Profile; initial: string; onCancel?: () => void }) {
  const [email, setEmail] = useState(initial);
  const [problem, setProblem] = useState<SendProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const { saved } = useSettingsToast();

  const send = async () => {
    setBusy(true);
    const result = await sendParentCode(uid, profile.name, email).catch((): SendProblem => 'sendFailed');
    setBusy(false);
    setProblem(result);
    if (!result) saved(t('settings.parentCodeSent'));
  };

  return (
    <form
      class="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <TextField
        label={t('settings.parentEmailLabel')}
        type="email"
        value={email}
        onInput={(value) => {
          setEmail(value);
          setProblem(null);
        }}
        autoComplete="off"
        hint={t('settings.parentEmailHint')}
        error={problem ? t(SEND_PROBLEM[problem]) : null}
      />
      <div class="settings-actions">
        <Button type="submit" variant="primary" busy={busy}>
          {t('settings.parentSendCode')}
        </Button>
        {onCancel && (
          <Button variant="quiet" onClick={onCancel}>
            {t('settings.parentCancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function CodeForm({ uid, email }: { uid: string; email: string }) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<CodeProblem | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const { saved, failed } = useSettingsToast();

  const confirm = async () => {
    setBusy(true);
    const result = await verifyParentCode(uid, code).catch(() => 'failed' as const);
    setBusy(false);
    setProblem(result);
    if (!result) saved(t('settings.parentVerified'));
  };

  return (
    <form
      class="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <p class="settings-note">{t('settings.parentCodePending', { email })}</p>
      <TextField
        label={t('settings.parentCodeLabel')}
        value={code}
        onInput={(value) => {
          setCode(value);
          setProblem(null);
        }}
        autoComplete="one-time-code"
        maxLength={6}
        error={problem === 'failed' ? t('settings.saveFailed') : problem ? t(CODE_PROBLEM[problem]) : null}
      />
      <div class="settings-actions">
        <Button type="submit" variant="primary" busy={busy}>
          {t('settings.parentConfirm')}
        </Button>
        <Button variant="quiet" onClick={() => void cancelParentCode(uid).catch(failed)}>
          {t('settings.parentCancel')}
        </Button>
      </div>
    </form>
  );
}

export function ParentSection({ uid, profile }: { uid: string; profile: Profile }) {
  const [changing, setChanging] = useState(false);
  const { saved, failed } = useSettingsToast();
  const state = parentEmailState(profile);
  const verified = state.kind === 'verified' ? state.email : null;
  // A new code or a newly verified address ends "change the address".
  useEffect(() => setChanging(false), [state.kind, profile.parentEmail]);

  const toggleReport = (on: boolean) => {
    saveAutoReport(uid, on).catch(failed);
    saved(t(on ? 'settings.weeklyReportOn' : 'settings.weeklyReportOff'));
  };

  return (
    <>
      <Section title={t('settings.parentEmail')}>
        <Card>
          {state.kind === 'pending' ? (
            <CodeForm uid={uid} email={state.email} />
          ) : state.kind === 'verified' && !changing ? (
            <Stack gap="sm">
              <p>{t('settings.parentVerifiedTo', { email: state.email })}</p>
              <div>
                <Button variant="secondary" onClick={() => setChanging(true)}>
                  {t('settings.parentChange')}
                </Button>
              </div>
            </Stack>
          ) : (
            <Stack gap="sm">
              {state.kind === 'unverified' && <p class="settings-warning">{t('settings.parentReverify')}</p>}
              <AddressForm
                uid={uid}
                profile={profile}
                initial={state.kind === 'unverified' ? state.email : ''}
                onCancel={state.kind === 'verified' ? () => setChanging(false) : undefined}
              />
            </Stack>
          )}
        </Card>
      </Section>
      <Section title={t('settings.weeklyReport')}>
        <Card>
          <Switch
            label={t('settings.weeklyReport')}
            description={verified ? t('settings.weeklyReportTo', { email: verified }) : t('settings.weeklyReportNoEmail')}
            checked={profile.autoReport}
            onChange={toggleReport}
          />
        </Card>
      </Section>
    </>
  );
}
