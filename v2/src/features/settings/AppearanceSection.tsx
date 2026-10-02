// Settings → Wygląd: the theme (family and mode, kept on this device as before) and
// the language, which v1 keeps in the profile so it follows the person to other
// devices (core.js applyLang). v1's font choice does not come over: v2 ships one
// font (PLAN.md 7.2).
import type { Language, Profile } from '@/domain/profile';
import { language, setLanguage, t, V1_LANG_STORAGE_KEY } from '@/i18n';
import { FAMILY_MODES, THEME_FAMILIES, type ModePreference, type ThemeFamily } from '@/lib/theme';
import { saveLanguage } from '@/services/settings';
import { setThemePreference, themePreference } from '@/stores/theme';
import { showToast } from '@/ui/toast';
import { SegmentedControl } from '@/ui/components/Fields';
import { Card, Section, Stack } from '@/ui/components/Layout';

const LANGUAGES: readonly Language[] = ['pl', 'en'];

export function AppearanceSection({ uid }: { uid: string; profile: Profile }) {
  const theme = themePreference.value;
  const modes = FAMILY_MODES[theme.family];

  const chooseLanguage = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem(V1_LANG_STORAGE_KEY, lang);
    } catch {
      // Storage blocked: the profile still carries the choice.
    }
    saveLanguage(uid, lang).catch(() => showToast({ message: t('settings.saveFailed'), tone: 'negative' }));
  };

  return (
    <>
      <Section title={t('settings.theme')}>
        <Card>
          <Stack gap="sm">
            <SegmentedControl<ThemeFamily>
              label={t('settings.family')}
              value={theme.family}
              options={THEME_FAMILIES.map((f) => ({ value: f, label: t(`settings.families.${f}`) }))}
              onChange={(family) => setThemePreference({ family, mode: FAMILY_MODES[family][0] })}
            />
            {modes.length > 1 ? (
              <SegmentedControl<ModePreference>
                label={t('settings.mode')}
                value={theme.mode}
                options={modes.map((m) => ({ value: m, label: t(`settings.modes.${m}`) }))}
                onChange={(mode) => setThemePreference({ family: theme.family, mode })}
              />
            ) : (
              <p class="settings-note">{t('settings.onlyDark')}</p>
            )}
            <p class="settings-note">{t('settings.themeDevice')}</p>
          </Stack>
        </Card>
      </Section>
      <Section title={t('settings.language')}>
        <Card>
          <Stack gap="sm">
            <SegmentedControl<Language>
              label={t('settings.language')}
              value={language.value}
              options={LANGUAGES.map((l) => ({ value: l, label: t(`settings.languages.${l}`) }))}
              onChange={chooseLanguage}
            />
            <p class="settings-note">{t('settings.languageEverywhere')}</p>
          </Stack>
        </Card>
      </Section>
    </>
  );
}
