"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeBucket, UsageKind } from "@/lib/types";
import type { UsageBucketRow, UsageSeries } from "./series";

interface UsageChartProps {
  rows: UsageBucketRow[];
  series: UsageSeries[];
  kind: UsageKind;
  bucket: TimeBucket;
}

/**
 * Log-scale stacked bar chart for tool/skill usage.
 *
 * Why client-only: Recharts mounts the SVG via `ResponsiveContainer`, which
 * needs a real DOM to size itself. Server-rendered charts come out at 0×0 and
 * never recover. The page that hosts this is still a server component — the
 * boundary lives here.
 *
 * Accessibility: the rendered `<svg>` carries a descriptive `aria-label`
 * (e.g. "Tools usage by day") so screen readers surface the chart's purpose
 * even though the points themselves stay visual. Tabular numerals on tick
 * labels keep number columns aligned across days/weeks.
 */
export function UsageChart({ rows, series, kind, bucket }: UsageChartProps) {
  const ariaLabel = `${kind === "skill" ? "Skills" : "Tools"} usage by ${bucket}`;

  if (rows.length === 0 || series.length === 0) {
    return (
      <div
        data-slot="usage-chart"
        className="border-border bg-surface flex h-72 items-center justify-center rounded-lg border text-sm text-muted"
      >
        <p>No usage data for the current filters.</p>
      </div>
    );
  }

  return (
    <div
      data-slot="usage-chart"
      className="border-border bg-surface rounded-lg border p-3"
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} aria-label={ariaLabel} role="img">
          <CartesianGrid stroke="rgba(148,160,184,0.14)" vertical={false} />
          <XAxis
            dataKey="bucket"
            stroke="#7a818e"
            tick={{ fill: "#aab1bd", fontSize: 11 }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            // Tabular nums keep date columns aligned so eyes don't jump.
            className="tabular-nums"
          />
          <YAxis
            // Symmetric log avoids the `log(0)` blow-up better-sqlite3 leaves us with.
            scale="log"
            domain={[0.1, "auto"]}
            allowDataOverflow
            stroke="#7a818e"
            tick={{ fill: "#aab1bd", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            className="tabular-nums"
          />
          <Tooltip
            cursor={{ fill: "rgba(148,160,184,0.08)" }}
            contentStyle={{
              background: "#13151b",
              border: "1px solid rgba(148,160,184,0.22)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e6e9ef" }}
            itemStyle={{ color: "#aab1bd" }}
          />
          {series.map((s) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              name={s.label}
              stackId="usage"
              fill={s.color}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
