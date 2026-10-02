// Settings → Moduły (v1 renderModuleSettings / toggleModule): each switch applies at
// once, nothing is asked and no data is touched; a module turned back on shows
// everything it had. Tasks, Goals and Today are always there.
import { Bot, ChartLine, ClipboardCheck, Gamepad2, NotebookPen, Wallet, type LucideIcon } from 'lucide-preact';
import { OPTIONAL_MODULES, isModuleOn, type OptionalModule } from '@/domain/modules';
import type { Profile } from '@/domain/profile';
import { t } from '@/i18n';
import { saveModule } from '@/services/settings';
import { useSettingsToast } from './toast';
import { IconTile } from '@/ui/components/Display';
import { Switch } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';

const ICONS: Record<OptionalModule, LucideIcon> = {
  chores: ClipboardCheck,
  money: Wallet,
  notes: NotebookPen,
  stats: ChartLine,
  games: Gamepad2,
  aichat: Bot,
};

export function ModulesSection({ uid, profile }: { uid: string; profile: Profile }) {
  const { saved, failed } = useSettingsToast();

  const toggle = (id: OptionalModule, on: boolean) => {
    saveModule(uid, profile, id, on).catch(failed);
    saved(t('settings.moduleToggled'));
  };

  return (
    <Section title={t('settings.yourModules')}>
      <Card>
        <Stack gap="sm">
          <p class="settings-note">{t('settings.modulesHint')}</p>
          <div class="settings-switches">
            {OPTIONAL_MODULES.map((id) => {
              const Icon = ICONS[id];
              return (
                <Switch
                  key={id}
                  label={t(`settings.moduleNames.${id}`)}
                  description={t(`settings.moduleDescriptions.${id}`)}
                  checked={isModuleOn(id, profile)}
                  onChange={(on) => toggle(id, on)}
                  leading={
                    <IconTile>
                      <Icon />
                    </IconTile>
                  }
                />
              );
            })}
          </div>
        </Stack>
      </Card>
    </Section>
  );
}
