// Historia aktualizacji (v1 #page-update-history): every version of v1's changelog,
// newest first, in the app's language. The changelog is data (PLAN.md 2.4).
import { language, t } from '@/i18n';
import { Card } from '@/ui/components/Layout';
import changelog from './changelog-v1.json';

interface ChangelogGroup {
  version: string;
  items: { pl: string; en: string }[];
}

export function UpdatesView() {
  const lang = language.value === 'en' ? 'en' : 'pl';
  return (
    <div class="stack">
      <p class="reports-note">{t('reports.updatesIntro')}</p>
      {(changelog as ChangelogGroup[]).map((group) => (
        <Card key={group.version}>
          <h3 class="reports-version">{t('reports.version', { v: group.version })}</h3>
          <ul class="reports-changes">
            {group.items.map((item, i) => (
              <li key={i} class="reports-change">
                {item[lang]}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
