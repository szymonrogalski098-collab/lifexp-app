// First run (v1 openAccountModeStep + openOnboarding; docs/v2/PLAN.md 9, stage 4b):
// solo or supervised, then the modules, everything ticked so that saving without a
// change hides nothing. Each step writes the profile; the next one follows from it.
// Loaded on demand, like the login page, so Firebase stays out of the first chunk.
import { Bot, ChartLine, ClipboardCheck, Gamepad2, NotebookPen, Wallet, type LucideIcon } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { OPTIONAL_MODULES, type OptionalModule } from '@/domain/modules';
import type { AccountMode } from '@/domain/profile';
import { t } from '@/i18n';
import { chooseAccountMode, finishModuleSurvey } from '@/services/settings';
import { Button } from '@/ui/components/Button';
import { IconTile } from '@/ui/components/Display';
import { Switch } from '@/ui/components/Fields';
import './auth.css';

const ICONS: Record<OptionalModule, LucideIcon> = {
  chores: ClipboardCheck,
  money: Wallet,
  notes: NotebookPen,
  stats: ChartLine,
  games: Gamepad2,
  aichat: Bot,
};

const MODES: readonly AccountMode[] = ['solo', 'supervised'];

interface SetupPageProps {
  step: 'accountMode' | 'modules';
  uid: string;
  onSignOut: () => void;
}

function AccountModeStep({ uid }: { uid: string }) {
  const [mode, setMode] = useState<AccountMode | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <h1 class="auth__title">{t('setup.modeTitle')}</h1>
      <p class="auth__intro">{t('setup.changeLater')}</p>
      <fieldset class="setup-choices">
        <legend class="visually-hidden">{t('setup.modeTitle')}</legend>
        {MODES.map((m) => (
          <label key={m} class="setup-choice">
            <input
              type="radio"
              name="account-mode"
              class="setup-choice__input"
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            <span class="setup-choice__title">{t(`setup.modes.${m}`)}</span>
            <span class="setup-choice__body">{t(`setup.modeDescriptions.${m}`)}</span>
          </label>
        ))}
      </fieldset>
      {failed && (
        <p class="auth__error" role="alert">
          {t('setup.saveFailed')}
        </p>
      )}
      <div class="auth__actions">
        <Button
          variant="primary"
          size="lg"
          block
          disabled={mode === null}
          onClick={() => {
            if (!mode) return;
            setFailed(false);
            chooseAccountMode(uid, mode).catch(() => setFailed(true));
          }}
        >
          {t('setup.continue')}
        </Button>
      </div>
    </>
  );
}

function ModulesStep({ uid }: { uid: string }) {
  const [on, setOn] = useState<readonly OptionalModule[]>(OPTIONAL_MODULES);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <h1 class="auth__title">{t('setup.modulesTitle')}</h1>
      <p class="auth__intro">{t('setup.modulesIntro')}</p>
      <div class="setup-modules">
        {OPTIONAL_MODULES.map((id) => {
          const Icon = ICONS[id];
          return (
            <Switch
              key={id}
              label={t(`settings.moduleNames.${id}`)}
              description={t(`settings.moduleDescriptions.${id}`)}
              checked={on.includes(id)}
              onChange={(checked) => setOn(checked ? [...on, id] : on.filter((m) => m !== id))}
              leading={
                <IconTile>
                  <Icon />
                </IconTile>
              }
            />
          );
        })}
      </div>
      {failed && (
        <p class="auth__error" role="alert">
          {t('setup.saveFailed')}
        </p>
      )}
      <div class="auth__actions">
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => {
            setFailed(false);
            finishModuleSurvey(uid, on).catch(() => setFailed(true));
          }}
        >
          {t('setup.start')}
        </Button>
      </div>
    </>
  );
}

export default function SetupPage({ step, uid, onSignOut }: SetupPageProps) {
  return (
    <main class="auth">
      <div class="auth__panel">
        <p class="auth__wordmark">{t('app.name')}</p>
        {step === 'accountMode' ? <AccountModeStep uid={uid} /> : <ModulesStep uid={uid} />}
        <div class="setup-signout">
          <Button variant="quiet" block onClick={onSignOut}>
            {t('nav.signOut')}
          </Button>
        </div>
      </div>
    </main>
  );
}
