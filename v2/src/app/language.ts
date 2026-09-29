// The language follows the signed-in profile, as in v1 (core.js syncLangWithProfile):
// the profile's choice wins over this device's and is remembered for the next start.
import { effect } from '@preact/signals';
import { language, setLanguage, V1_LANG_STORAGE_KEY } from '@/i18n';
import { session } from '@/stores/session';

export function startLanguageSync(root: HTMLElement = document.documentElement): () => void {
  const stopProfile = effect(() => {
    const current = session.value;
    const profile = current.status === 'signedIn' ? current.profile : null;
    const lang = typeof profile === 'object' && profile !== null ? profile.lang : null;
    if (!lang) return;
    setLanguage(lang);
    try {
      localStorage.setItem(V1_LANG_STORAGE_KEY, lang);
    } catch {
      // Storage blocked: the profile still sets the language on every start.
    }
  });
  const stopDocument = effect(() => {
    root.lang = language.value;
  });
  return () => {
    stopProfile();
    stopDocument();
  };
}
