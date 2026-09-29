import { useEffect } from 'preact/hooks';
import { t } from '@/i18n';
import { AppShell } from './AppShell';
import { ComingSoonPage } from './ComingSoonPage';
import { DEFAULT_PATH, resolveRoute } from './registry';
import { currentPath, navigate } from './router';

export function App() {
  const path = currentPath.value;
  const route = resolveRoute(path);

  // Unknown or empty hash → Today, without leaving a history entry behind.
  useEffect(() => {
    if (!route) navigate(DEFAULT_PATH, { replace: true });
  }, [route === null]);

  const title = route ? t(route.feature.labelKey) : '';
  useEffect(() => {
    if (title) document.title = `${title} · ${t('app.name')}`;
  }, [title]);

  if (!route) return null;
  return (
    <AppShell title={title} activeId={route.feature.id} path={path}>
      <ComingSoonPage feature={route.feature} />
    </AppShell>
  );
}
