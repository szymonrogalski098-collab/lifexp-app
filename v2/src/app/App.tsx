import { useEffect } from 'preact/hooks';
import { GatePage } from '@/features/auth/GatePage';
import { language, t } from '@/i18n';
import { session } from '@/stores/session';
import { AppShell } from './AppShell';
import { BootScreen } from './BootScreen';
import { ComingSoonPage } from './ComingSoonPage';
import { sessionGate, type Gate } from './gates';
import { LazyView } from './LazyView';
import { DEFAULT_PATH, resolveRoute } from './registry';
import { currentPath, navigate } from './router';
import { signOut } from './sign-out';

const loadLoginPage = () => import('@/features/auth/LoginPage');

function gateTitle(gate: Gate): string {
  switch (gate.kind) {
    case 'login':
      return t('auth.title');
    case 'verify':
    case 'finishSetup':
    case 'failed':
      return t(`auth.${gate.kind}.title`);
    default:
      return '';
  }
}

function GateScreen({ gate }: { gate: Exclude<Gate, { kind: 'ready' }> }) {
  switch (gate.kind) {
    case 'boot':
      return <BootScreen />;
    case 'login':
      return <LazyView load={loadLoginPage} fallback={<BootScreen />} />;
    case 'verify':
      return <GatePage kind="verify" email={gate.email} onSignOut={signOut} />;
    case 'finishSetup':
      return <GatePage kind="finishSetup" onSignOut={signOut} />;
    case 'failed':
      return <GatePage kind="failed" onSignOut={gate.signedIn ? signOut : undefined} />;
  }
}

export function App() {
  // A language change (from the profile) re-renders every translated string.
  void language.value;
  const gate = sessionGate(session.value);
  const path = currentPath.value;
  const route = resolveRoute(path);

  // Unknown or empty hash → Today, without leaving a history entry behind. The
  // hash is kept while signed out, so login lands where the link pointed.
  useEffect(() => {
    if (!route) navigate(DEFAULT_PATH, { replace: true });
  }, [route === null]);

  const title = gate.kind === 'ready' ? (route ? t(route.feature.labelKey) : '') : gateTitle(gate);
  useEffect(() => {
    document.title = title ? `${title} · ${t('app.name')}` : t('app.name');
  }, [title]);

  if (gate.kind !== 'ready') return <GateScreen gate={gate} />;
  if (!route) return null;

  const account = { name: gate.profile.name, email: gate.user.email };
  return (
    <AppShell title={title} activeId={route.feature.id} path={path} account={account} onSignOut={signOut}>
      {route.feature.view ? <LazyView load={route.feature.view} /> : <ComingSoonPage feature={route.feature} />}
    </AppShell>
  );
}
