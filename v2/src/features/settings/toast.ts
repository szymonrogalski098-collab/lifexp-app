// One toast at a time for a settings screen: a new message replaces the last one.
import { useRef } from 'preact/hooks';
import { t } from '@/i18n';
import { dismissToast, showToast, type ToastInput } from '@/ui/toast';

export function useSettingsToast() {
  const last = useRef<number | null>(null);
  const notify = (input: ToastInput) => {
    if (last.current !== null) dismissToast(last.current);
    last.current = showToast(input);
  };
  return {
    notify,
    saved: (message = t('settings.saved')) => notify({ message, tone: 'positive' }),
    failed: () => notify({ message: t('settings.saveFailed'), tone: 'negative' }),
  };
}
