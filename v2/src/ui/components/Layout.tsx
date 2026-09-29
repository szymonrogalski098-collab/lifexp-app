// Page structure (docs/v2/PLAN.md 7.5): Page frames a screen, Section groups a
// block under an overline title, Card is one surface with one intent.
import type { ComponentChildren } from 'preact';
import './Layout.css';

export function Page({ children }: { children: ComponentChildren }) {
  return <div class="ui-page">{children}</div>;
}

interface SectionProps {
  title: string;
  /** One text action on the title row, e.g. "Wszystkie". */
  action?: ComponentChildren;
  children: ComponentChildren;
}

export function Section({ title, action, children }: SectionProps) {
  return (
    <section class="ui-section">
      <div class="ui-section__header">
        <h2 class="ui-section__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

interface CardProps {
  children: ComponentChildren;
  /** Tighter padding for dense content (lists inside a card use none). */
  padding?: 'md' | 'sm' | 'none';
}

export function Card({ children, padding = 'md' }: CardProps) {
  return <div class={`ui-card ui-card--pad-${padding}`}>{children}</div>;
}

/** Vertical rhythm for a column of cards/sections. */
export function Stack({ children, gap = 'md' }: { children: ComponentChildren; gap?: 'sm' | 'md' | 'lg' }) {
  return <div class={`stack ui-stack ui-stack--${gap}`}>{children}</div>;
}
