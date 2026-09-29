// Stand-in for every module until its stage lands. Points back to v1, which keeps
// working on the same data.
import { t } from '@/i18n';
import type { FeatureDef } from './registry';

export function ComingSoonPage({ feature }: { feature: FeatureDef }) {
  return (
    <div class="page">
      <section class="coming-soon" aria-labelledby="coming-soon-title">
        <p class="coming-soon__overline">{t('comingSoon.overline')}</p>
        <h2 id="coming-soon-title" class="coming-soon__title">
          {t(feature.labelKey)}
        </h2>
        <p class="coming-soon__body">{t('comingSoon.body', { stage: feature.stage })}</p>
        <a class="coming-soon__link" href="../app.html">
          {t('comingSoon.openV1')}
        </a>
      </section>
    </div>
  );
}
