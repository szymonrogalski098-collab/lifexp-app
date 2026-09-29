// Loads a module's screen on first visit (its own JS chunk), with a skeleton while
// it arrives and a retry if the network fails.
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { EmptyState, Skeleton } from '@/ui/components/Display';
import { Page } from '@/ui/components/Layout';

type Loader = () => Promise<{ default: ComponentType }>;

export function LazyView({ load }: { load: Loader }) {
  const [View, setView] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setView(null);
    setFailed(false);
    load()
      .then((module) => current && setView(() => module.default))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [load, attempt]);

  if (View) return <View />;
  return (
    <Page>
      {failed ? (
        <EmptyState
          title={t('ui.loadFailed')}
          action={<Button onClick={() => setAttempt((n) => n + 1)}>{t('ui.retry')}</Button>}
        />
      ) : (
        <Skeleton />
      )}
    </Page>
  );
}
