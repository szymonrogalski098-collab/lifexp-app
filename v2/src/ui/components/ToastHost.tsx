// Renders the toast queue. Two live regions, so errors are announced right away
// and everything else politely. Tap the message to dismiss.
import { useEffect, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { cssDurationMs } from '../motion';
import { dismissToast, toastDuration, toasts, type Toast } from '../toast';
import './Toast.css';

function ToastView({ toast }: { toast: Toast }) {
  // Leaving plays the exit animation first; the queue moves on when it has ended.
  const [leaving, setLeaving] = useState(false);
  const leave = () => setLeaving(true);

  useEffect(() => {
    const timer = setTimeout(leave, toastDuration(toast));
    return () => clearTimeout(timer);
  }, [toast.id]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => dismissToast(toast.id), cssDurationMs('--duration-exit'));
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <div class={`ui-toast ui-toast--${toast.tone ?? 'default'}${leaving ? ' ui-toast--leaving' : ''}`}>
      <button type="button" class="ui-toast__message" onClick={leave}>
        {toast.message}
        <span class="visually-hidden"> · {t('ui.close')}</span>
      </button>
      {toast.action && (
        <button
          type="button"
          class="ui-toast__action"
          onClick={() => {
            leave();
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
