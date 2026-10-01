import '@fontsource-variable/manrope';
import '@/ui/tokens.css';
import '@/ui/base.css';
import '@/app/shell.css';
import { render } from 'preact';
import { App } from '@/app/App';
import { startLanguageSync } from '@/app/language';
import { registerServiceWorker, reloadOnStaleChunk, watchForNewBuild } from '@/app/pwa';
import { startRouter } from '@/app/router';
import { startThemeSync } from '@/app/theme';
import { initI18n, pickLanguage, V1_LANG_STORAGE_KEY } from '@/i18n';
import { startSession } from '@/stores/session';

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(V1_LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

// This device's language first; the profile's replaces it once it loads.
initI18n(pickLanguage(storedLanguage()));
startLanguageSync();
startThemeSync();
startRouter();
reloadOnStaleChunk();
void startSession();

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
render(<App />, root);
registerServiceWorker();
watchForNewBuild();
