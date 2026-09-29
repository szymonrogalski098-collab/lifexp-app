import 'i18next';
import type pl from './pl.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof pl };
  }
}
