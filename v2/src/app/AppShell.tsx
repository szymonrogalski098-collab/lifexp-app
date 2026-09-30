// App shell (docs/v2/PLAN.md 7.3, 7.4). Below 840 px: a tab bar at the bottom
// (Today, Chores, "+", Money, Menu; D10) and the full menu as a drawer that behaves
// like ChatGPT's: the content card slides right and reveals the menu underneath;
// it follows the finger and settles by momentum. From 840 px the menu is a
// persistent sidebar and there is no tab bar. Only the shell uses position: fixed.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { ToastHost } from '@/ui/components/ToastHost';
import { dragProgress, releaseVelocity, settlesOpen, TAP_SLOP, type DragSample } from '@/lib/gesture';
import { AddSheet } from './AddSheet';
import { NavMenu, type Account } from './NavMenu';
import { TabBar } from './TabBar';
import type { ModuleId } from './registry';
import { navigate } from './router';
import { isExpanded, isStandalone } from './viewport';

interface Drag {
  pointerId: number;
  startX: number;
  startProgress: number;
  /** Drawer width in px: dragging this far moves from closed to open. */
  offset: number;
  samples: DragSample[];
  moved: boolean;
}

/**
 * How the next open/close animates (shell.css): 'tap' starts from rest,
 * 'settle' continues a drag at the finger's speed.
 */
type Motion = 'tap' | 'settle';

/** Opening the drawer adds a history entry, so the system Back closes it (PLAN.md 4.7). */
const DRAWER_STATE_KEY = 'lifexpDrawer';

function drawerEntryOnTop(): boolean {
  const state: unknown = history.state;
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[DRAWER_STATE_KEY] === true;
}

interface AppShellProps {
  title: string;
  activeId: ModuleId;
  /** Current path; a change scrolls the new screen to the top. */
  path: string;
  account: Account;
  onSignOut: () => void;
  children: ComponentChildren;
}

export function AppShell({ title, activeId, path, account, onSignOut, children }: AppShellProps) {
  const drawerMode = !isExpanded.value;
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [standalone] = useState(isStandalone);
  const openRef = useRef(false);
  const wasOpen = useRef(false);
  const drag = useRef<Drag | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // The drawer position lives in one CSS variable, written directly (not through
  // render) so dragging does not re-render the page 60 times per second.
  const setProgress = (progress: number) => shellRef.current?.style.setProperty('--drawer-progress', String(progress));
  const setMotion = (motion: Motion) => {
    if (shellRef.current) shellRef.current.dataset.motion = motion;
  };

  const openDrawer = (motion: Motion = 'tap') => {
    setMotion(motion);
    if (openRef.current) return setProgress(1);
    openRef.current = true;
    history.pushState({ [DRAWER_STATE_KEY]: true }, '', location.href);
    setOpen(true);
  };

  const closeDrawer = (motion: Motion = 'tap') => {
    setMotion(motion);
    if (!openRef.current) return setProgress(0);
    openRef.current = false;
    setOpen(false);
    if (drawerEntryOnTop()) history.back();
  };

  const selectPath = (target: string) => {
    // A choice made in the open drawer replaces its history entry: Back from the
    // new screen goes to the previous screen, not to the drawer.
    const replace = openRef.current && drawerEntryOnTop();
    setMotion('tap');
    openRef.current = false;
    setOpen(false);
    navigate(target, { replace });
  };

  useLayoutEffect(() => setProgress(open ? 1 : 0), [open]);

  // System Back while open.
  useEffect(() => {
    const onPopState = () => {
      if (openRef.current && !drawerEntryOnTop()) {
        setMotion('tap');
        openRef.current = false;
        setOpen(false);
      }
    };
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Growing past 840 px turns the drawer into the sidebar.
  useEffect(() => {
    if (!drawerMode && openRef.current) closeDrawer();
  }, [drawerMode]);

  // Focus: into the menu on open, back to the Menu button on close.
  useEffect(() => {
    if (open) navRef.current?.querySelector<HTMLElement>('.nav__link')?.focus();
    else if (wasOpen.current) menuButtonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    scrollTo(0, 0);
  }, [path]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startProgress: openRef.current ? 1 : 0,
      offset: navRef.current?.getBoundingClientRect().width ?? 0,
      samples: [{ pos: e.clientX, t: e.timeStamp }],
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < TAP_SLOP) return;
      d.moved = true;
      shellRef.current?.classList.add('is-dragging');
    }
    d.samples.push({ pos: e.clientX, t: e.timeStamp });
    if (d.samples.length > 32) d.samples.shift();
    setProgress(dragProgress(d.startProgress, dx, d.offset));
  };

  const finishDrag = (e: PointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    shellRef.current?.classList.remove('is-dragging');
    if (!d.moved) {
      // A tap on the revealed strip of the card closes the drawer.
      if (!cancelled && d.startProgress === 1) closeDrawer();
      return;
    }
    // pointercancel carries no reliable position: use the last sample.
    const lastX = d.samples[d.samples.length - 1]?.pos ?? d.startX;
    const progress = dragProgress(d.startProgress, lastX - d.startX, d.offset);
    const shouldOpen = cancelled ? progress >= 0.5 : settlesOpen(progress, releaseVelocity(d.samples));
    if (shouldOpen) openDrawer('settle');
    else closeDrawer('settle');
  };

  const gestureHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: PointerEvent) => finishDrag(e, false),
    onPointerCancel: (e: PointerEvent) => finishDrag(e, true),
  };

  const modal = drawerMode && open;

  return (
    <div ref={shellRef} class="shell" data-drawer={drawerMode ? (open ? 'open' : 'closed') : 'sidebar'}>
      <nav
        ref={navRef}
        id="app-nav"
        class="shell__nav"
        aria-label={t('nav.label')}
        role={modal ? 'dialog' : undefined}
        aria-modal={modal ? 'true' : undefined}
        inert={drawerMode && !open}
      >
        <NavMenu
          activeId={activeId}
          onSelect={selectPath}
          account={account}
          onSignOut={() => {
            // Take the drawer's history entry with it; the login screen replaces the shell.
            closeDrawer();
            onSignOut();
          }}
        />
      </nav>

      <div ref={contentRef} class="shell__content" inert={modal}>
        <header class="topbar">
          <h1 class="topbar__title">{title}</h1>
        </header>
        <main class="shell__main">{children}</main>
        {drawerMode && (
          <TabBar
            activeId={activeId}
            onSelect={selectPath}
            onAdd={() => setAddOpen(true)}
            onMenu={() => openDrawer()}
            menuOpen={open}
            menuButtonRef={menuButtonRef}
          />
        )}
      </div>
      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(target) => {
          // Replace the sheet's history entry first, so closing it does not step Back.
          navigate(target, { replace: true });
          setAddOpen(false);
        }}
      />

      {modal && (
        <button type="button" class="shell__closer" tabIndex={-1} aria-label={t('nav.closeMenu')} {...gestureHandlers} />
      )}
      {drawerMode && !open && standalone && <div class="shell__edge" aria-hidden="true" {...gestureHandlers} />}
      <ToastHost />
    </div>
  );
}
