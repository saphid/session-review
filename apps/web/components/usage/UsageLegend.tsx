"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { buildSearchHref } from "@/lib/search-params";
import type { UsageSeries } from "./series";

interface UsageLegendProps {
  series: UsageSeries[];
  /**
   * Override navigation for tests/storybook. When omitted, clicking a legend
   * item routes to `/?query=<name>` via Next's client router.
   */
  onSelect?: (series: UsageSeries) => void;
}

/**
 * HTML legend rendered below the chart. A real `<ul role="list">` with
 * focusable `<button>` items so the keyboard can reach every series — the
 * canvas-based legend that ships with Chart.js cannot do this.
 *
 * T15: clicking an item drills to the search page filtered by that
 * tool/skill name. The raw `name` (not the humanized label) is used so FTS
 * matches the same token the ingest pipeline stored in `usage_signals`.
 * The "Other" pseudo-series is unclickable — it has no single name to drill
 * to and would land on a misleading empty page.
 */
export function UsageLegend({ series, onSelect }: UsageLegendProps) {
  const router = useRouter();

  const handleSelect = useCallback(
    (entry: UsageSeries) => {
      if (onSelect) {
        onSelect(entry);
        return;
      }
      // "Other" is a synthetic bucket — leave it inert.
      if (entry.name === "__other__") return;
      router.push(buildSearchHref(entry.name));
    },
    [onSelect, router],
  );

  return (
    <ul
      role="list"
      aria-label="Chart legend"
      className="flex flex-wrap items-center gap-2"
      data-slot="usage-legend"
    >
      {series.map((entry) => {
        const isOther = entry.name === "__other__";
        return (
          <li key={entry.name}>
            <button
              type="button"
              onClick={() => handleSelect(entry)}
              disabled={isOther}
              data-series-name={entry.name}
              aria-label={
                isOther
                  ? `${entry.label} (no drill-down)`
                  : `Filter sessions by ${entry.label}`
              }
              className="border-border bg-surface text-text-secondary hover:bg-surface-raised hover:text-text inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 disabled:cursor-not-allowed disabled:opacity-60"
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
        );
      })}
    </ul>
  );
}
