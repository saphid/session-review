import type { UsagePoint, UsageSummaryRow } from "@/lib/types";

export interface UsageSeries {
  /** Original tool/skill name as stored in `usage_signals.name`. */
  name: string;
  /** Title-Case display name ("exec_command" → "Exec Command"). */
  label: string;
  /** Stable colour token from the usage palette. */
  color: string;
  /** Total uses across all buckets — drives series stack order (largest at bottom). */
  total: number;
  /** Total distinct sessions for this name. */
  sessions: number;
}

export interface UsageBucketRow {
  bucket: string;
  /** One key per series name: `row[seriesName] = count for that bucket`. */
  [seriesName: string]: number | string;
}

/**
 * Top-N is capped to keep the chart readable. Anything past the cut-off is
 * folded into a single "Other" series so the totals still add up.
 */
export const SERIES_CAP = 8;
const OTHER_LABEL = "Other";

// Chart series colours come from `--color-chart-*` declared in `globals.css`.
// SVG fill accepts `var()` natively so we route through CSS variables rather
// than hard-coding hex values, keeping the palette aligned with the design
// tokens.
const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];
const OTHER_COLOR = "var(--color-chart-other)";

/**
 * Reduces the timeline + summary into Recharts-friendly bucket rows plus a
 * stable series list. Series are picked from the summary (already sorted by
 * uses DESC) so the chart and table agree on what's "top".
 */
export function buildUsageSeries(
  timeline: UsagePoint[],
  summary: UsageSummaryRow[],
): { rows: UsageBucketRow[]; series: UsageSeries[] } {
  const top = summary.slice(0, SERIES_CAP);
  const topNames = new Set(top.map((row) => row.name));
  const hasOther = summary.length > SERIES_CAP;

  const series: UsageSeries[] = top.map((row, index) => ({
    name: row.name,
    label: humanizeName(row.name),
    color: PALETTE[index % PALETTE.length] ?? "var(--color-chart-1)",
    total: row.count,
    sessions: row.sessions,
  }));
  if (hasOther) {
    const otherTotal = summary.slice(SERIES_CAP).reduce((sum, row) => sum + row.count, 0);
    const otherSessions = summary.slice(SERIES_CAP).reduce((sum, row) => sum + row.sessions, 0);
    series.push({
      name: "__other__",
      label: OTHER_LABEL,
      color: OTHER_COLOR,
      total: otherTotal,
      sessions: otherSessions,
    });
  }

  // Bucket rows keyed by date string for deterministic ordering.
  const rowMap = new Map<string, UsageBucketRow>();
  for (const point of timeline) {
    const row = rowMap.get(point.bucket) ?? ({ bucket: point.bucket } as UsageBucketRow);
    const key = topNames.has(point.name) ? point.name : "__other__";
    if (!hasOther && key === "__other__") {
      // No "Other" bucket — drop tail series entirely so the chart matches the legend.
      rowMap.set(point.bucket, row);
      continue;
    }
    row[key] = (Number(row[key] ?? 0) || 0) + point.count;
    rowMap.set(point.bucket, row);
  }
  const rows = [...rowMap.values()].sort((a, b) =>
    String(a.bucket).localeCompare(String(b.bucket)),
  );
  return { rows, series };
}

function humanizeName(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
