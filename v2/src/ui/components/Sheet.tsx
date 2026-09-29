// Sheet (docs/v2/PLAN.md 7.5, U12): a bottom sheet below 600 px, a centred dialog
// from 600 px — one component, forms always live in it.
// - A text "Zamknij" button in the header; the handle is only a hint.
// - Drag the header down to close; like the drawer, speed decides, a slow drag
//   springs back unless it went past a third of the height.
// - When the on-screen keyboard opens, the sheet sits above it and may grow to
//   the full visible height (visualViewport).
// - One sheet per action: never open a sheet from a sheet.
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { t } from '@/i18n';
import { releaseVelocity, settlesOpen, TAP_SLOP, type DragSample } from '@/lib/gesture';
import { useModal } from './useModal';
import './Sheet.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  /** Actions pinned to the bottom (thumb zone), usually one primary Button. */
  footer?: ComponentChildren;
}

interface Drag {
  pointerId: number;
  startY: number;
  height: number;
  samples: DragSample[];
  moved: boolean;
}

export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const ref = useModal(open, onClose);
  const titleId = useId();
  const drag = useRef<Drag | null>(null);

  // Keep the sheet above the on-screen keyboard.
  useEffect(() => {
    const viewport = window.visualViewport;
    const dialog = ref.current;
    if (!open || !viewport || !dialog) return;
    const update = () => {
      const keyboard = Math.max(0, innerHeight - viewport.height - viewport.offsetTop);
      dialog.style.setProperty('--keyboard-inset', `${keyboard}px`);
      dialog.style.setProperty('--visible-height', `${viewport.height}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [open]);

  const setOffset = (px: number) => ref.current?.style.setProperty('--drag-offset', `${px}px`);

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('button')) return; // "Zamknij" stays a plain tap
    if (matchMedia('(min-width: 600px)').matches) return; // centred dialog: no drag
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      height: ref.current?.getBoundingClientRect().height ?? 1,
      // pos grows towards "open" (up), as settlesOpen expects.
      samples: [{ pos: -e.clientY, t: e.timeStamp }],
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = Math.max(0, e.clientY - d.startY);
    if (!d.moved) {
      if (dy < TAP_SLOP) return;
      d.moved = true;
      ref.current?.classList.add('is-dragging');
    }
    d.samples.push({ pos: -e.clientY, t: e.timeStamp });
    if (d.samples.length > 32) d.samples.shift();
    setOffset(dy);
  };

  const finishDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    ref.current?.classList.remove('is-dragging');
    setOffset(0);
    if (!d.moved) return;
    const lastY = -(d.samples[d.samples.length - 1]?.pos ?? -d.startY);
    // Closing needs a third of the height, not half: sheets are often tall.
    const progress = 1 - Math.max(0, lastY - d.startY) / d.height;
    const stays = cancelled ? progress > 2 / 3 : settlesOpen(progress - 1 / 6, releaseVelocity(d.samples));
    if (!stays) onClose();
  };

  return (
    <dialog ref={ref} class="ui-sheet" aria-labelledby={titleId}>
      <div class="ui-sheet__panel">
        <header
          class="ui-sheet__header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishDrag(e, false)}
          onPointerCancel={(e) => finishDrag(e, true)}
        >
          <span class="ui-sheet__handle" aria-hidden="true" />
          <h2 id={titleId} class="ui-sheet__title">
            {title}
          </h2>
          <button type="button" class="ui-sheet__close" onClick={onClose}>
            {t('ui.close')}
          </button>
        </header>
        <div class="ui-sheet__body">{children}</div>
        {footer && <div class="ui-sheet__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
