import { usageSummary, usageTimeline } from "@core/db.js";
import { Topbar } from "@/components/shell/Topbar";
import { UsageChart } from "@/components/usage/UsageChart";
import { UsageLegend } from "@/components/usage/UsageLegend";
import { UsageTable } from "@/components/usage/UsageTable";
import { buildUsageSeries } from "@/components/usage/series";
import { getDb } from "@/lib/db";
import { parseUsageRequest } from "@/lib/usage";

// Server component — fetches usage data directly from the shared DB handle so
// the page renders without an internal /api round-trip. The chart itself is a
// client component (`UsageChart`); Next.js stitches the boundary at import.
export const dynamic = "force-dynamic";

interface ToolsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ToolsPage({ searchParams }: ToolsPageProps) {
  const resolved = (await searchParams) ?? {};
  const params = toUrlSearchParams(resolved);
  const { kind, bucket, filters } = parseUsageRequest(params);

  const started = performance.now();
  const db = getDb();
  const summary = usageSummary(db, kind, filters);
  const timeline = usageTimeline(db, kind, bucket, filters);
  const elapsedMs = Math.max(0, Math.round(performance.now() - started));

  const { rows, series } = buildUsageSeries(timeline, summary);
  const totalSignals = summary.reduce((sum, row) => sum + row.count, 0);
  const dataPoints = timeline.length;
  const subtitle = kind === "skill" ? "Skill signals" : "Tool signals";

  return (
    <>
      <Topbar title="Tools" subtitle={subtitle} />
      <section className="flex flex-1 flex-col gap-4 px-4 py-6 md:px-6">
        <p
          role="status"
          aria-live="polite"
          className="text-text-secondary text-xs tabular-nums"
        >
          {totalSignals.toLocaleString()} signals · {dataPoints.toLocaleString()} data points · {elapsedMs}ms
        </p>
        <UsageChart rows={rows} series={series} kind={kind} bucket={bucket} />
        <UsageLegend series={series} />
        <UsageTable rows={summary} />
      </section>
    </>
  );
}

function toUrlSearchParams(
  source: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string") params.set(key, first);
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
}
