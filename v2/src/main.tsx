import '@fontsource-variable/manrope';
import '@/ui/tokens.css';
import '@/ui/base.css';
import '@/app/shell.css';
import { render } from 'preact';
import { App } from '@/app/App';
import { startRouter } from '@/app/router';
import { startThemeSync } from '@/app/theme';
import { initI18n, pickLanguage, V1_LANG_STORAGE_KEY } from '@/i18n';

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(V1_LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

const language = pickLanguage(storedLanguage());
initI18n(language);
document.documentElement.lang = language;
startThemeSync();
startRouter();

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
render(<App />, root);
