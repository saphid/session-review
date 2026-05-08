"use client";

import type { UsageSeries } from "./series";

interface UsageLegendProps {
  series: UsageSeries[];
  /**
   * Click handler reserved for T15 (drill-down). Kept optional so this
   * component renders correctly without a parent wiring it up.
   */
  onSelect?: (series: UsageSeries) => void;
}

/**
 * HTML legend rendered below the chart. A real `<ul role="list">` with
 * focusable `<button>` items so the keyboard can reach every series — the
 * canvas-based legend that ships with Chart.js cannot do this.
 *
 * The buttons are inert today; T15 wires `onSelect` to navigate to a filtered
 * search URL. The signature is exposed now so the page contract is stable.
 */
export function UsageLegend({ series, onSelect }: UsageLegendProps) {
  return (
    <ul
      role="list"
      aria-label="Chart legend"
      className="flex flex-wrap items-center gap-2"
      data-slot="usage-legend"
    >
      {series.map((entry) => (
        <li key={entry.name}>
          <button
            type="button"
            onClick={onSelect ? () => onSelect(entry) : undefined}
            className="border-border bg-surface text-text-secondary hover:bg-surface-raised hover:text-text inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: entry.color }}
            />
            <span>{entry.label}</span>
            <span className="text-muted tabular-nums">
              {entry.total.toLocaleString()}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
