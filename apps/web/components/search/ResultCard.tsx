"use client";

import Link from "next/link";
import type { SearchResult } from "@/lib/types";
import {
  activityMetrics,
  displayTitle,
  formatTokens,
  projectLabel,
  relationFor,
  type Relation,
} from "@/lib/search-display";
import { MatchPill } from "./MatchPill";
import { RowActions } from "./RowActions";

interface ResultCardProps {
  row: SearchResult;
}

/**
 * Mobile / sub-720 px equivalent of one `ResultsTable` row. The desktop
 * table has eight columns that don't fit a 390 px viewport, so we stack
 * the same data vertically here:
 *
 *   Title (link to /session/<id>)
 *   Project · relation pill
 *   Activity (tokens · tools)        — Match pill
 *   Open    Pi attach
 *
 * Only the data the original `ResultsTable` row already exposes is
 * rendered — no fabricated turn counts or durations. Action buttons reuse
 * `RowActions` so the Pi-attach + copy-path behaviour is identical to the
 * desktop row (T13 listens for the same `selected-row` event).
 *
 * Rendered alongside the desktop table; visibility is controlled by the
 * parent (`md:hidden` wrapper) so we don't need media-query logic here.
 */
export function ResultCard({ row }: ResultCardProps) {
  const title = displayTitle(row);
  const project = projectLabel(row);
  const relation = relationFor(row);
  const { tokens, tools } = activityMetrics(row);

  return (
    <article
      data-testid="result-card"
      data-session-id={row.sessionId}
      className="border-border bg-surface flex flex-col gap-3 rounded-md border px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/session/${encodeURIComponent(row.sessionId)}`}
          className="text-text hover:text-accent min-w-0 flex-1 text-sm font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
        >
          <span className="block break-words">{title}</span>
        </Link>
        <MatchPill score={row.matchScore} />
      </div>
      <div className="text-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-strong truncate" title={row.cwd ?? ""}>
          {project}
        </span>
        <RelationPill relation={relation} />
      </div>
      <div className="flex items-center gap-3 text-xs tabular-nums">
        <span
          className="text-text inline-flex items-baseline gap-1"
          title="Estimated tokens"
        >
          <span className="font-medium">{formatTokens(tokens)}</span>
          <span className="text-muted text-[10px] uppercase">tok</span>
        </span>
        <span
          className="text-text inline-flex items-baseline gap-1"
          title="Tool uses"
        >
          <span className="font-medium">{tools}</span>
          <span className="text-muted text-[10px] uppercase">tools</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/session/${encodeURIComponent(row.sessionId)}`}
          className="text-accent hover:text-text inline-flex h-7 items-center rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
          data-testid="result-card-open"
        >
          Open
        </Link>
        <RowActions row={row} />
      </div>
    </article>
  );
}

function RelationPill({ relation }: { relation: Relation }) {
  if (relation.kind === "primary") {
    return (
      <span className="text-accent inline-flex items-center rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-xs font-medium">
        primary
      </span>
    );
  }
  if (relation.kind === "batch") {
    return (
      <span className="inline-flex items-center rounded-sm border border-[rgba(192,132,252,0.3)] bg-[rgba(192,132,252,0.08)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-tool)]">
        batch
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-sm border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.08)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-warn)]"
      title={relation.parentTitle ?? "subagent"}
    >
      subagent
    </span>
  );
}
