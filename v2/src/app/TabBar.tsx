// Phone tab bar (docs/v2/PLAN.md 7.4, D10; the owner's reference style): Today,
// Chores, "+", Money, Menu. Every icon has its label next to it (D9); only "+" is a
// bare glyph, with an accessible name. The other modules live in the menu it opens.
import { Menu, Plus } from 'lucide-preact';
import type { Ref } from 'preact';
import type { ModuleChoice } from '@/domain/modules';
import { t } from '@/i18n';
import { isPlainClick } from './links';
import { featureHref, featurePath, tabItems, type FeatureDef, type ModuleId } from './registry';

interface TabBarProps {
  activeId: ModuleId;
  /** A tab whose module is off gives its place to the next module on (registry tabItems). */
  modules: ModuleChoice;
  onSelect: (path: string) => void;
  onAdd: () => void;
  onMenu: () => void;
  menuOpen: boolean;
  /** Focus returns here when the menu closes. */
  menuButtonRef: Ref<HTMLButtonElement>;
}

export function TabBar({ activeId, modules, onSelect, onAdd, onMenu, menuOpen, menuButtonRef }: TabBarProps) {
  const tabs = tabItems(modules);
  const tab = (feature: FeatureDef) => {
    const Icon = feature.icon;
    return (
      <a
        key={feature.id}
        class="tabbar__item"
        href={featureHref(feature)}
        aria-current={feature.id === activeId ? 'page' : undefined}
        onClick={(e) => {
          if (!isPlainClick(e)) return;
          e.preventDefault();
          onSelect(featurePath(feature));
        }}
      >
        <Icon class="tabbar__icon" aria-hidden="true" />
        <span class="tabbar__label">{t(feature.labelKey)}</span>
      </a>
    );
  };

  return (
    <nav class="tabbar" aria-label={t('nav.tabBar')}>
      {tabs.slice(0, 2).map(tab)}
      <button type="button" class="tabbar__add" aria-label={t('nav.add')} onClick={onAdd}>
        <Plus aria-hidden="true" />
      </button>
      {tabs.slice(2).map(tab)}
      <button
        ref={menuButtonRef}
        type="button"
        class="tabbar__item"
        aria-expanded={menuOpen}
        aria-controls="app-nav"
        onClick={onMenu}
      >
        <Menu class="tabbar__icon" aria-hidden="true" />
        <span class="tabbar__label">{t('nav.menu')}</span>
      </button>
    </nav>
  );
}
