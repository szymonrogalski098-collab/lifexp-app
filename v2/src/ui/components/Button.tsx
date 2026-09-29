import type { ComponentChildren, JSX } from 'preact';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'className' | 'size'> {
  variant?: ButtonVariant;
  /** lg = the main action at the bottom of a form (thumb zone). */
  size?: 'md' | 'lg';
  block?: boolean;
  /** Work in progress: disabled and announced as busy, label stays. */
  busy?: boolean;
  children: ComponentChildren;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  busy = false,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, block ? 'ui-button--block' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} type={type} class={classes} disabled={disabled || busy} aria-busy={busy || undefined}>
      {children}
    </button>
  );
}
