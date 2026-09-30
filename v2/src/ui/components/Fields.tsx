// Form fields (docs/v2/PLAN.md 7.5, U13). Each field owns its label, hint and
// error, so forms stay a single column of these with no extra markup. All inputs
// are ≥ 16 px (base.css), so iOS never zooms into them.
import type { ComponentChildren, Ref } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money';
import './Fields.css';

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: ComponentChildren;
  error?: string | null;
  children: ComponentChildren;
}

function FieldFrame({ id, label, hint, error, children }: FieldFrameProps) {
  return (
    <div class={`ui-field${error ? ' ui-field--error' : ''}`}>
      <label class="ui-field__label" for={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p class="ui-field__error" id={`${id}-message`} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p class="ui-field__hint" id={`${id}-message`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const described = (id: string, hint: unknown, error: unknown) => (hint || error ? `${id}-message` : undefined);

interface TextFieldProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  type?: 'text' | 'email' | 'password' | 'search';
  hint?: string;
  error?: string | null;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
}

export function TextField({ label, value, onInput, type = 'text', hint, error, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input
        {...rest}
        id={id}
        class="ui-field__input"
        type={type}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, hint, error)}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </FieldFrame>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  /** Visible lines before it scrolls; it grows with the text up to the screen (CSS). */
  rows?: number;
  maxLength?: number;
  /** Between the label and the field, e.g. a formatting toolbar. */
  toolbar?: ComponentChildren;
  /** For callers that edit the selection (the Markdown toolbar). */
  textareaRef?: Ref<HTMLTextAreaElement>;
}

/** Multi-line text, e.g. a note. */
export function TextAreaField({ label, value, onInput, hint, error, toolbar, textareaRef, rows = 8, ...rest }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      {toolbar}
      <textarea
        {...rest}
        ref={textareaRef}
        id={id}
        class="ui-field__input ui-field__textarea"
        rows={rows}
        style={{ '--rows': String(rows) }}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, hint, error)}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </FieldFrame>
  );
}

interface NumberFieldProps {
  label: string;
  /** Whole numbers only; null = empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  error?: string | null;
  suffix?: string;
  disabled?: boolean;
}

export function NumberField({ label, value, onChange, hint, error, suffix, disabled }: NumberFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <div class="ui-field__control">
        <input
          id={id}
          class="ui-field__input numeric"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value === null ? '' : String(value)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={described(id, hint, error)}
          onInput={(e) => {
            const digits = e.currentTarget.value.replace(/\D/g, '');
            e.currentTarget.value = digits;
            onChange(digits === '' ? null : Number(digits));
          }}
        />
        {suffix && <span class="ui-field__suffix">{suffix}</span>}
      </div>
    </FieldFrame>
  );
}

interface MoneyFieldProps {
  label: string;
  /** Grosze; null = empty or not a valid amount yet. */
  value: number | null;
  onChange: (grosze: number | null) => void;
  /** Usually the effect of the amount, e.g. "Saldo po operacji: 262,50 zł". */
  hint?: ComponentChildren;
  error?: string | null;
  disabled?: boolean;
}

/**
 * Amount input (U13): decimal keypad with a comma, no number spinners, the amount
 * shown large. Keeps the typed text while editing and normalises it on blur.
 */
export function MoneyField({ label, value, onChange, hint, error, disabled }: MoneyFieldProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : formatMoneyInput(value));
  const [touched, setTouched] = useState(false);

  // Follow value changes that did not come from typing (e.g. a form reset).
  useEffect(() => {
    if (parseMoneyInput(text) !== value) setText(value === null ? '' : formatMoneyInput(value));
  }, [value]);

  const invalid = text.trim() !== '' && parseMoneyInput(text) === null;
  const shownError = error ?? (touched && invalid ? t('ui.money.invalid') : null);

  return (
    <FieldFrame id={id} label={label} hint={hint} error={shownError}>
      <div class="ui-field__control ui-field__control--money">
        <input
          id={id}
          class="ui-field__input ui-field__input--money numeric"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={text}
          disabled={disabled}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={described(id, hint, shownError)}
          onInput={(e) => {
            const next = e.currentTarget.value;
            setText(next);
            onChange(parseMoneyInput(next));
          }}
          onBlur={() => {
            setTouched(true);
            const grosze = parseMoneyInput(text);
            if (grosze !== null) setText(formatMoneyInput(grosze));
          }}
        />
        <span class="ui-field__suffix">{t('ui.money.currency')}</span>
      </div>
    </FieldFrame>
  );
}

interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD" or "" */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  min?: string;
  max?: string;
}

export function DateField({ label, value, onChange, hint, error, min, max }: DateFieldProps) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        class="ui-field__input"
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(id, hint, error)}
        onInput={(e) => onChange(e.currentTarget.value)}
      />
    </FieldFrame>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  hint?: string;
}

/** Native select: the platform picker is the best one on phones. */
export function Select<T extends string>({ label, value, options, onChange, hint }: SelectProps<T>) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <select
        id={id}
        class="ui-field__input ui-field__select"
        value={value}
        aria-describedby={described(id, hint, null)}
        onChange={(e) => onChange(e.currentTarget.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
}

/** 2–4 mutually exclusive options. Native radios underneath: arrow keys and screen readers work as usual. */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const name = useId();
  const active = options.findIndex((o) => o.value === value);
  return (
    <fieldset class="ui-segmented">
      <legend class="ui-field__label">{label}</legend>
      <div class="ui-segmented__track" style={{ '--segments': String(options.length), '--active': String(active) }}>
        {/* One thumb slides under the options instead of each option lighting up on its own. */}
        {active >= 0 && <span class="ui-segmented__thumb" aria-hidden="true" />}
        {options.map((o) => (
          <label key={o.value} class="ui-segmented__option">
            <input
              class="ui-segmented__input"
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span class="ui-segmented__label">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

export function FilterChip({ label, selected, onToggle }: FilterChipProps) {
  return (
    <button type="button" class="ui-chip" aria-pressed={selected} onClick={onToggle}>
      {label}
    </button>
  );
}
