// Two to four views of one module as links (e.g. Statistics: Overview | History).
// Looks like a segmented control, but each view has its own address, so Back and
// shared links work; the current one carries aria-current.
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import './ViewSwitch.css';

export interface ViewLink {
  href: string;
  label: string;
  current: boolean;
}

export function ViewSwitch({ label, links }: { label: string; links: readonly ViewLink[] }) {
  const active = links.findIndex((link) => link.current);
  return (
    <nav
      class="ui-view-switch"
      aria-label={label}
      style={{ '--segments': String(links.length), '--active': String(active) }}
    >
      {active >= 0 && <span class="ui-view-switch__thumb" aria-hidden="true" />}
      {links.map((link) => (
        <a
          key={link.href}
          class="ui-view-switch__link"
          href={link.href}
          aria-current={link.current ? 'page' : undefined}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * The content under a ViewSwitch. When the view changes, the new content slides in
 * from the side its link sits on (from the right when moving right), while the
 * switch's thumb slides the same way; the first view of a visit does not move (the
 * screen itself rises in then).
 */
export function ViewPanel({ index, children }: { index: number; children: ComponentChildren }) {
  const shown = useRef({ index, from: 0 });
  if (shown.current.index !== index) shown.current = { index, from: Math.sign(index - shown.current.index) };
  const { from } = shown.current;
  return (
    <div class="ui-view-panels">
      <div
        key={index}
        class={from === 0 ? 'ui-view-panel' : 'ui-view-panel ui-view-panel--enter'}
        style={{ '--from': String(from) }}
      >
        {children}
      </div>
    </div>
  );
}
