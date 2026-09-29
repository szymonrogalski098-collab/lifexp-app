// The boot gates v2 hands over to v1 (see app/gates.ts), and the failure screen.
// Each says what is missing and offers one way forward.
import { t } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { ButtonLink } from '@/ui/components/ButtonLink';
import './auth.css';

export type GateKind = 'verify' | 'finishSetup' | 'failed';

interface GatePageProps {
  kind: GateKind;
  /** The account waiting for verification. */
  email?: string;
  /** Absent when nobody is signed in. */
  onSignOut?: () => void;
}

/** v1 pages that finish what v2 does not write itself. */
const V1_PAGE: Record<Exclude<GateKind, 'failed'>, string> = {
  verify: '../verify.html',
  finishSetup: '../app.html',
};

export function GatePage({ kind, email = '', onSignOut }: GatePageProps) {
  return (
    <main class="auth">
      <div class="auth__panel">
        <p class="auth__wordmark">{t('app.name')}</p>
        <h1 class="auth__title">{t(`auth.${kind}.title`)}</h1>
        <p class="auth__intro">
          {kind === 'verify' ? t('auth.verify.body', { email }) : t(`auth.${kind}.body`)}
        </p>
        <div class="auth__actions">
          {kind === 'failed' ? (
            <Button variant="primary" size="lg" block onClick={() => location.reload()}>
              {t('auth.failed.retry')}
            </Button>
          ) : (
            <ButtonLink variant="primary" size="lg" block href={V1_PAGE[kind]}>
              {t(`auth.${kind}.action`)}
            </ButtonLink>
          )}
          {onSignOut && (
            <Button variant="quiet" size="lg" block onClick={onSignOut}>
              {t('nav.signOut')}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
