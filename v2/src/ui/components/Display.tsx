// Read-only building blocks (docs/v2/PLAN.md 7.5): big numbers as the heroes of a
// screen, lists, icon tiles, progress, empty and loading states.
import type { ComponentChildren } from 'preact';
import { t } from '@/i18n';
import './Display.css';

export type Tone = 'default' | 'positive' | 'negative' | 'warning';

/**
 * An icon on a soft tinted square (the reference style). Decorative: the text
 * next to it carries the meaning (PLAN.md 7.1, D9), so it is hidden from screen readers.
 */
export function IconTile({ children, tone = 'default' }: { children: ComponentChildren; tone?: Tone }) {
  return (
    <span class={`ui-icon-tile tone-bg-${tone}`} aria-hidden="true">
      {children}
    </span>
  );
}

interface MetricProps {
  /** Already formatted (formatMoney, points, …). */
  value: string;
  label: string;
  /** One line under the number, e.g. "z 150 dziś". */
  detail?: string;
  tone?: Tone;
  size?: 'hero' | 'md';
}

export function Metric({ value, label, detail, tone = 'default', size = 'md' }: MetricProps) {
  return (
    <div class={`ui-metric ui-metric--${size}`}>
      <span class="ui-metric__label">{label}</span>
      <span class={`ui-metric__value numeric tone-${tone}`}>{value}</span>
      {detail && <span class="ui-metric__detail">{detail}</span>}
    </div>
  );
}

export function List({ children, label }: { children: ComponentChildren; label?: string }) {
  return (
    <ul class="ui-list" aria-label={label}>
      {children}
    </ul>
  );
}

interface ListRowProps {
  /** Before the text, e.g. an IconTile. The title stays the label (PLAN.md 7.1, D9). */
  leading?: ComponentChildren;
  title: string;
  /** Secondary line under the title. */
  meta?: string;
  /** Right-hand value, e.g. an amount. */
  value?: string;
  valueTone?: Tone;
  /** Makes the row a button (shows ›). */
  onClick?: () => void;
  /** Makes the row a link (shows ›). */
  href?: string;
}

export function ListRow({ leading, title, meta, value, valueTone = 'default', onClick, href }: ListRowProps) {
  const interactive = Boolean(onClick || href);
  const body = (
    <>
      {leading}
      <span class="ui-list__text">
        <span class="ui-list__title user-text clamp-2">{title}</span>
        {meta && <span class="ui-list__meta user-text clamp-1">{meta}</span>}
      </span>
      {value && <span class={`ui-list__value numeric tone-${valueTone}`}>{value}</span>}
      {interactive && (
        <span class="ui-list__chevron" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  return (
    <li class="ui-list__item">
      {href ? (
        <a class="ui-list__row ui-list__row--action" href={href}>
          {body}
        </a>
      ) : onClick ? (
        <button type="button" class="ui-list__row ui-list__row--action" onClick={onClick}>
          {body}
        </button>
      ) : (
        <div class="ui-list__row">{body}</div>
      )}
    </li>
  );
}

interface ProgressBarProps {
  /** 0 … 1; values outside are clamped. */
  value: number;
  label: string;
  tone?: Tone;
}

export function ProgressBar({ value, label, tone = 'default' }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      class={`ui-progress tone-${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      style={{ '--progress': String(clamped) }}
    >
      <span class="ui-progress__fill" />
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  body?: string;
  /** One action, usually a Button. */
  action?: ComponentChildren;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div class="ui-empty">
      <p class="ui-empty__title">{title}</p>
      {body && <p class="ui-empty__body">{body}</p>}
      {action}
    </div>
  );
}

/** Placeholder lines while data loads. Announced once, not per line. */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div class="ui-skeleton" role="status" aria-label={t('ui.loading')}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} class="ui-skeleton__line" aria-hidden="true" />
      ))}
    </div>
  );
}
