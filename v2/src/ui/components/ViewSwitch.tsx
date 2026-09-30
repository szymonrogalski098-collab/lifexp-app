// Two to four views of one module as links (e.g. Statistics: Overview | History).
// Looks like a segmented control, but each view has its own address, so Back and
// shared links work; the current one carries aria-current.
import './ViewSwitch.css';

export interface ViewLink {
  href: string;
  label: string;
  current: boolean;
}

export function ViewSwitch({ label, links }: { label: string; links: readonly ViewLink[] }) {
  return (
    <nav class="ui-view-switch" aria-label={label}>
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
