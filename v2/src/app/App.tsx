import { useEffect } from 'preact/hooks';
import { GatePage } from '@/features/auth/GatePage';
import { DraftsReview } from '@/features/offline/DraftsReview';
import { generalRate } from '@/domain/points';
import { language, t } from '@/i18n';
import { session } from '@/stores/session';
import { AppShell } from './AppShell';
import { BootScreen } from './BootScreen';
import { ComingSoonPage } from './ComingSoonPage';
import { sessionGate, type Gate } from './gates';
import { LazyView } from './LazyView';
import { DEFAULT_PATH, featureOn, resolveRoute } from './registry';
import { currentPath, navigate } from './router';
import { signOut } from './sign-out';

const loadLoginPage = () => import('@/features/auth/LoginPage');
const loadSetupPage = () => import('@/features/auth/SetupPage');

function gateTitle(gate: Gate): string {
  switch (gate.kind) {
    case 'login':
      return t('auth.title');
    case 'verify':
    case 'finishSetup':
    case 'failed':
      return t(`auth.${gate.kind}.title`);
    case 'setup':
      return t('setup.title');
    default:
      return '';
  }
}

function GateScreen({ gate }: { gate: Exclude<Gate, { kind: 'ready' }> }) {
  switch (gate.kind) {
    case 'boot':
      return <BootScreen />;
    case 'login':
      return <LazyView load={loadLoginPage} props={{}} fallback={<BootScreen />} />;
    case 'verify':
      return <GatePage kind="verify" email={gate.email} onSignOut={signOut} />;
    case 'finishSetup':
      return <GatePage kind="finishSetup" onSignOut={signOut} />;
    case 'setup':
      return (
        <LazyView
          load={loadSetupPage}
          props={{ step: gate.step, uid: gate.user.uid, onSignOut: signOut }}
          fallback={<BootScreen />}
        />
      );
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
  // hash is kept while signed out, so login lands where the link pointed. A module
  // turned off in Settings is not opened either (v1 showPage), whatever the link.
  const off = gate.kind === 'ready' && route !== null && !featureOn(route.feature, gate.profile);
  useEffect(() => {
    if (!route || off) navigate(DEFAULT_PATH, { replace: true });
  }, [route === null, off]);

  const title = gate.kind === 'ready' ? (route ? t(route.feature.labelKey) : '') : gateTitle(gate);
  useEffect(() => {
    document.title = title ? `${title} · ${t('app.name')}` : t('app.name');
  }, [title]);

  if (gate.kind !== 'ready') return <GateScreen gate={gate} />;
  if (!route || off) return null;

  const account = { name: gate.profile.name, email: gate.user.email };
  return (
    <AppShell
      title={title}
      activeId={route.feature.id}
      path={path}
      account={account}
      modules={gate.profile}
      onSignOut={signOut}
    >
      {route.feature.view ? (
        <LazyView load={route.feature.view} props={{ path, params: route.params, navigate }} />
      ) : (
        <ComingSoonPage feature={route.feature} />
      )}
      <DraftsReview
        uid={gate.user.uid}
        rate={generalRate(gate.profile.rateGeneral.zloty, gate.profile.rateGeneral.points)}
      />
    </AppShell>
  );
}
