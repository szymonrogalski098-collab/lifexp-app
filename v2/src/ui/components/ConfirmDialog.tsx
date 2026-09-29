// Confirmation before an action that cannot be undone (docs/v2/PLAN.md 7.5).
// Always a small centred dialog; Escape and Back mean "cancel".
import { useId } from 'preact/hooks';
import { t } from '@/i18n';
import { Button } from './Button';
import { useModal } from './useModal';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  /** Destructive actions get the danger style. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useModal(open, onCancel);
  const titleId = useId();
  const bodyId = useId();
  return (
    <dialog
      ref={ref}
      class="ui-confirm"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={body ? bodyId : undefined}
    >
      <h2 id={titleId} class="ui-confirm__title">
        {title}
      </h2>
      {body && (
        <p id={bodyId} class="ui-confirm__body">
          {body}
        </p>
      )}
      <div class="ui-confirm__actions">
        {/* Cancel first: it is the safe default and gets initial focus. */}
        <Button onClick={onCancel} autoFocus>
          {t('ui.cancel')}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
