// A short bar chart, e.g. the last 7 days (docs/v2/PLAN.md 7.5). One series on
// one axis from zero: thin bars with a rounded data end, a direct label only on the
// bars that matter (the highest and the current one), every value in a tooltip on
// hover, focus or tap, and in text for screen readers — the chart never hides a
// number behind the pointer.
import './BarChart.css';

export interface BarDatum {
  key: string;
  /** Under the bar, e.g. "pon.". */
  label: string;
  value: number;
  /** Short value for the direct label, e.g. "40". */
  valueText: string;
  /** Tooltip heading, e.g. "wtorek, 29 września". */
  title: string;
  /** The value with its unit for the tooltip, e.g. "40 pkt". */
  valueLabel: string;
  /** Screen-reader text, e.g. "wtorek, 29 września: 40 pkt". */
  description: string;
  /** The bar the reader looks for first (e.g. today): always labelled, its axis label emphasised. */
  current?: boolean;
}

interface BarChartProps {
  /** Names the series (the section title says the same). */
  label: string;
  data: readonly BarDatum[];
}

export function BarChart({ label, data }: BarChartProps) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const highest = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  return (
    <ol class="ui-bars" aria-label={label}>
      {data.map((d, i) => {
        const labelled = d.value > 0 && (d.current || i === highest);
        return (
          <li
            key={d.key}
            class={d.current ? 'ui-bars__item ui-bars__item--current' : 'ui-bars__item'}
            // Focusable so keyboard and touch reach the tooltip; the text is in the list for screen readers.
            tabIndex={0}
            style={{ '--bar': String(max > 0 ? Math.max(0, d.value) / max : 0), '--i': String(i) }}
          >
            <span class="visually-hidden">{d.description}</span>
            <span class="ui-bars__plot" aria-hidden="true">
              {labelled && <span class="ui-bars__value numeric">{d.valueText}</span>}
              {d.value > 0 && <span class="ui-bars__bar" />}
            </span>
            <span class="ui-bars__label" aria-hidden="true">
              {d.label}
            </span>
            <span class="ui-bars__tip" aria-hidden="true">
              <span class="ui-bars__tip-title">{d.title}</span>
              <span class="ui-bars__tip-value numeric">{d.valueLabel}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
