"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildSearchHref } from "@/lib/search-params";
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
 *
 * T15: clicking a stacked bar segment drills to the search page filtered to
 * that series' name AND to the bucket the segment belongs to (start/end date).
 * Recharts' `onClick` on a `<Bar>` fires per-segment with the data point —
 * we use the row's `bucket` plus the active series name to build the href.
 */
export function UsageChart({ rows, series, kind, bucket }: UsageChartProps) {
  const router = useRouter();
  const ariaLabel = `${kind === "skill" ? "Skills" : "Tools"} usage by ${bucket}`;

  const onSegmentClick = useCallback(
    (seriesName: string, bucketStart: string) => {
      // Synthetic "Other" series has no single name to filter by.
      if (seriesName === "__other__") return;
      const range = bucketRange(bucketStart, bucket);
      router.push(buildSearchHref(seriesName, range));
    },
    [bucket, router],
  );

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
              cursor={s.name === "__other__" ? "default" : "pointer"}
              onClick={(data) => {
                // Recharts hands us the segment's BarRectangleItem; the
                // original data row is on `payload`. We only need its bucket.
                const payload = (data as { payload?: { bucket?: unknown } })
                  .payload;
                const bucketStart = payload?.bucket;
                if (typeof bucketStart === "string") {
                  onSegmentClick(s.name, bucketStart);
                }
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Compute the half-open `[startDate, endDate]` range for a bucket. The data
 * layer treats the dates as YYYY-MM-DD inclusive bounds, so for a `day`
 * bucket start === end and for a `week` bucket end is start + 6 days
 * (Monday-anchored buckets cover Mon–Sun inclusive).
 */
function bucketRange(
  bucketStart: string,
  bucket: TimeBucket,
): { startDate: string; endDate: string } {
  if (bucket === "week") {
    const end = addDaysIso(bucketStart, 6);
    return { startDate: bucketStart, endDate: end };
  }
  return { startDate: bucketStart, endDate: bucketStart };
}

function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
