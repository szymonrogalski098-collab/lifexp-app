// Renders the toast queue. Two live regions, so errors are announced right away
// and everything else politely. Tap the message to dismiss.
import { useEffect } from 'preact/hooks';
import { t } from '@/i18n';
import { dismissToast, toastDuration, toasts, type Toast } from '../toast';
import './Toast.css';

function ToastView({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toastDuration(toast));
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div class={`ui-toast ui-toast--${toast.tone ?? 'default'}`}>
      <button type="button" class="ui-toast__message" onClick={() => dismissToast(toast.id)}>
        {toast.message}
        <span class="visually-hidden"> · {t('ui.close')}</span>
      </button>
      {toast.action && (
        <button
          type="button"
          class="ui-toast__action"
          onClick={() => {
            dismissToast(toast.id);
            toast.action?.onAction();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function ToastHost() {
  const current = toasts.value[0];
  const urgent = current?.tone === 'negative';
  return (
    <div class="ui-toast-host">
      <div role="status" aria-live="polite">
        {current && !urgent && <ToastView key={current.id} toast={current} />}
      </div>
      <div role="alert" aria-live="assertive">
        {current && urgent && <ToastView key={current.id} toast={current} />}
      </div>
    </div>
  );
}
