// Settings (v1 Settings; docs/v2/PLAN.md 9, stage 4): a list of sections, each on its
// own address (#/settings/<section>), so Back returns to the list. The list says
// what each section is set to now. Settings that belong to one module stay there
// (chores in Obowiązki, the limit and categories in Pieniądze); the list links to them.
import { Blocks, ClipboardCheck, Palette, Trophy, UserRound, Wallet, Zap } from 'lucide-preact';
import { OPTIONAL_MODULES, isModuleOn } from '@/domain/modules';
import type { Profile } from '@/domain/profile';
import { DAILY_LIMIT_DEFAULT } from '@/domain/points';
import { language, locale, t } from '@/i18n';
import type { RouteProps } from '@/lib/route-match';
import { formatInteger } from '@/lib/format';
import { account } from '@/stores/session';
import { themePreference } from '@/stores/theme';
import { ButtonLink } from '@/ui/components/ButtonLink';
import { EmptyState, IconTile, List, ListRow } from '@/ui/components/Display';
import { Card, Page, Section } from '@/ui/components/Layout';
import { AccountSection } from './AccountSection';
import { ActivitiesSection } from './ActivitiesSection';
import { AppearanceSection } from './AppearanceSection';
import { ModulesSection } from './ModulesSection';
import { PointsSection } from './PointsSection';
import './settings.css';

const SECTIONS = {
  modules: ModulesSection,
  appearance: AppearanceSection,
  account: AccountSection,
  points: PointsSection,
  activities: ActivitiesSection,
} as const;

type SectionId = keyof typeof SECTIONS;

function isSection(id: string): id is SectionId {
  return Object.hasOwn(SECTIONS, id);
}

function Home({ profile }: { profile: Profile }) {
  const theme = themePreference.value;
  const appearance = [
    t(`settings.families.${theme.family}`),
    t(`settings.modes.${theme.mode}`),
    t(`settings.languages.${language.value}`),
  ].join(' · ');
  return (
    <Page>
      <Section title={t('settings.app')}>
        <Card padding="none">
          <List label={t('settings.app')}>
            <ListRow
              leading={
                <IconTile>
                  <Blocks />
                </IconTile>
              }
              title={t('settings.modules')}
              meta={t('settings.modulesMeta', {
                on: OPTIONAL_MODULES.filter((id) => isModuleOn(id, profile)).length,
                all: OPTIONAL_MODULES.length,
              })}
              href="#/settings/modules"
            />
            <ListRow
              leading={
                <IconTile>
                  <Palette />
                </IconTile>
              }
              title={t('settings.appearance')}
              meta={appearance}
              href="#/settings/appearance"
            />
            <ListRow
              leading={
                <IconTile>
                  <UserRound />
                </IconTile>
              }
              title={t('settings.account')}
              meta={profile.name}
              href="#/settings/account"
            />
            <ListRow
              leading={
                <IconTile>
                  <Trophy />
                </IconTile>
              }
              title={t('settings.points')}
              meta={t('settings.pointsMeta', { limit: formatInteger(profile.dailyLimit ?? DAILY_LIMIT_DEFAULT, locale()) })}
              href="#/settings/points"
            />
            <ListRow
              leading={
                <IconTile>
                  <Zap />
                </IconTile>
              }
              title={t('settings.activities')}
              meta={t('settings.activitiesMeta')}
              href="#/settings/activities"
            />
          </List>
        </Card>
      </Section>
      <Section title={t('settings.inModules')}>
        <Card padding="none">
          <List label={t('settings.inModules')}>
            <ListRow
              leading={
                <IconTile>
                  <ClipboardCheck />
                </IconTile>
              }
              title={t('nav.chores')}
              meta={t('settings.choresMeta')}
              href="#/chores/defs"
            />
            <ListRow
              leading={
                <IconTile>
                  <Wallet />
                </IconTile>
              }
              title={t('nav.money')}
              meta={t('settings.moneyMeta')}
              href="#/money/settings"
            />
          </List>
        </Card>
      </Section>
    </Page>
  );
}

export default function SettingsModule({ params }: RouteProps) {
  const current = account.value;
  if (!current) return null;
  const id = params.section;
  if (!id) return <Home profile={current.profile} />;

  const back = (
    <div class="settings-back">
      <ButtonLink variant="quiet" href="#/settings">
        ‹ {t('nav.settings')}
      </ButtonLink>
    </div>
  );
  if (!isSection(id)) {
    return (
      <Page>
        {back}
        <Card>
          <EmptyState title={t('settings.notFound')} />
        </Card>
      </Page>
    );
  }
  const Body = SECTIONS[id];
  return (
    <Page>
      {back}
      <h2 class="settings-title">{t(`settings.${id}`)}</h2>
      <Body uid={current.user.uid} profile={current.profile} />
    </Page>
  );
}
