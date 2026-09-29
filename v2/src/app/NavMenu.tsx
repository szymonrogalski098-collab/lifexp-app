// Menu content (docs/v2/PLAN.md 7.4): text only, generated from the registry.
// Right-hand metadata ("2 po terminie") arrives with the modules' data (stage 2+).
import { t } from '@/i18n';
import { featureHref, navItems, type FeatureDef, type ModuleId } from './registry';

interface NavMenuProps {
  activeId: ModuleId;
  onSelect: (path: string) => void;
}

export function NavMenu({ activeId, onSelect }: NavMenuProps) {
  const item = (feature: FeatureDef) => (
    <li key={feature.id}>
      <a
        class="nav__link"
        href={featureHref(feature)}
        aria-current={feature.id === activeId ? 'page' : undefined}
        onClick={(e) => {
          // Let the browser handle "open in new tab" and similar.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onSelect(feature.paths[0]);
        }}
      >
        <span class="nav__label">{t(feature.labelKey)}</span>
      </a>
    </li>
  );

  return (
    <div class="nav">
      <p class="nav__wordmark">{t('app.name')}</p>
      <button
        type="button"
        class="nav__exus"
        aria-current={activeId === 'exus' ? 'page' : undefined}
        onClick={() => onSelect('/exus')}
      >
        {t('nav.askExus')}
      </button>
      <ul class="nav__list">{navItems('main').map(item)}</ul>
      <hr class="nav__divider" />
      <ul class="nav__list">{navItems('secondary').map(item)}</ul>
    </div>
  );
}
