// Shown until Firebase knows who is signed in and their profile has arrived.
// Usually a fraction of a second: both come from this device's cache.
import { t } from '@/i18n';

export function BootScreen() {
  return (
    <div class="boot" role="status">
      <p class="boot__wordmark" aria-hidden="true">
        {t('app.name')}
      </p>
      <p class="visually-hidden">{t('auth.boot')}</p>
    </div>
  );
}
