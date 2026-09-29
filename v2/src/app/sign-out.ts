// Logging out ends the session in v1 too: both share one Firebase Auth session.
// The auth service is imported on demand, so Firebase stays out of the first-paint bundle.
import { t } from '@/i18n';
import { showToast } from '@/ui/toast';

export function signOut(): void {
  import('@/services/auth')
    .then((auth) => auth.logout())
    .catch(() => showToast({ message: t('auth.errors.signOutFailed'), tone: 'negative' }));
}
