"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { SearchResult } from "@/lib/types";
import {
  activityMetrics,
  defaultDirFor,
  displaySubtitle,
  displayTitle,
  formatTokens,
  isSortDir,
  isSortKey,
  projectLabel,
  relationFor,
  runtimeDisplay,
  type Relation,
  type SortDir,
  type SortKey,
} from "@/lib/search-display";
import { MatchPill } from "./MatchPill";
import { RowActions } from "./RowActions";
import { RowDrawer } from "./RowDrawer";

interface ResultsTableProps {
  rows: SearchResult[];
  /**
   * Current URL search params, serialized as an object. The table writes the
   * full querystring back via `router.replace` on sort, so it needs the
   * existing values (provider, query, …) to round-trip.
   */
  searchParams: Record<string, string | string[] | undefined>;
}

const PROVIDER_GLYPH: Record<string, string> = {
  pi: "π",
  claude: "✦",
  codex: "▣",
  cursor: "›_",
};

/**
 * Headline 8-column results table. Server-rendered in shell, hydrated as a
 * client component so sortable headers can write URL state and copy/attach
 * row actions can run.
 *
 * Columns (per PLAN T09 / docs/review/03-search-page.md):
 *   1. AGENT     — provider glyph
 *   2. TASK      — title + subtitle
 *   3. PROJECT   — humanized cwd
 *   4. RELATION  — primary / subagent / batch pill + parent name
 *   5. RUN TIME  — date + 24h time, NO fabricated duration
 *   6. ACTIVITY  — tokens · tools (no fabricated turns/duration)
 *   7. MATCH     — real `matchScore` pill, or em-dash when null
 *   8. ACTIONS   — Pi attach button + copy-path button
 *
 * Sortable headers: RUN TIME / ACTIVITY / MATCH. Each renders a real
 * `<button>` inside the `<th>` so keyboard users get Tab+Enter parity.
 * `aria-sort` is updated honestly — only the active column carries an
 * "ascending" or "descending" value; the rest report "none".
 */
export function ResultsTable({ rows, searchParams }: ResultsTableProps) {
  const router = useRouter();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Reset expansion when the result set itself changes — otherwise an open
  // drawer would point at a row that's no longer in `rows`.
  useEffect(() => {
    if (expandedRowId && !rows.some((row) => row.sessionId === expandedRowId)) {
      setExpandedRowId(null);
    }
  }, [expandedRowId, rows]);

  // ESC closes whichever drawer is open. We attach at the document level so
  // focus inside the drawer (e.g. linked-session links) still triggers.
  useEffect(() => {
    if (!expandedRowId) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedRowId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expandedRowId]);

  const sortKeyParam = singleString(searchParams.sort);
  const sortDirParam = singleString(searchParams.dir);
  const activeSort: SortKey | null = isSortKey(sortKeyParam)
    ? sortKeyParam
    : null;
  const activeDir: SortDir | null = isSortDir(sortDirParam)
    ? sortDirParam
    : null;

  const onSort = useCallback(
    (key: SortKey) => {
      const params = paramsFromRecord(searchParams);
      let nextDir: SortDir;
      if (activeSort === key && activeDir) {
        nextDir = activeDir === "asc" ? "desc" : "asc";
      } else {
        nextDir = defaultDirFor(key);
      }
      params.set("sort", key);
      params.set("dir", nextDir);
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [activeDir, activeSort, router, searchParams],
  );

  const onRowToggle = useCallback((sessionId: string) => {
    setExpandedRowId((current) => (current === sessionId ? null : sessionId));
  }, []);

  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table
        aria-label="Sessions results"
        className="border-collapse text-sm"
        style={{ minWidth: "1060px", width: "100%" }}
      >
        <thead className="bg-surface-low text-muted-strong border-border border-b">
          <tr>
            <Th width="56px">Agent</Th>
            <Th width="auto" align="left">
              Task
            </Th>
            <Th width="170px" align="left">
              Project
            </Th>
            <Th width="140px" align="left">
              Relation
            </Th>
            <SortableTh
              testId="th-runtime"
              sortKey="runtime"
              label="Run time"
              activeSort={activeSort}
              activeDir={activeDir}
              onSort={onSort}
              width="130px"
            />
            <SortableTh
              testId="th-activity"
              sortKey="activity"
              label="Activity"
              activeSort={activeSort}
              activeDir={activeDir}
              onSort={onSort}
              width="160px"
            />
            <SortableTh
              testId="th-match"
              sortKey="match"
              label="Match"
              activeSort={activeSort}
              activeDir={activeDir}
              onSort={onSort}
              width="80px"
            />
            <Th width="130px">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="text-muted px-4 py-6 text-center text-sm"
              >
                No sessions match the current filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <Row
                key={row.sessionId}
                row={row}
                expanded={expandedRowId === row.sessionId}
                onToggle={onRowToggle}
                onClose={() => setExpandedRowId(null)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface ThProps {
  width?: string;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}

function Th({ width, align = "left", children }: ThProps) {
  const alignCls =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] ${alignCls}`}
    >
      {children}
    </th>
  );
}

interface SortableThProps {
  testId: string;
  sortKey: SortKey;
  label: string;
  activeSort: SortKey | null;
  activeDir: SortDir | null;
  onSort: (key: SortKey) => void;
  width: string;
}

function SortableTh({
  testId,
  sortKey,
  label,
  activeSort,
  activeDir,
  onSort,
  width,
}: SortableThProps) {
  const isActive = activeSort === sortKey;
  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? activeDir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const arrow = !isActive ? "↕" : ariaSort === "ascending" ? "↑" : "↓";

  return (
    <th
      scope="col"
      data-testid={testId}
      aria-sort={ariaSort}
      style={{ width }}
      className="px-0 py-0 text-left text-[11px] font-semibold uppercase tracking-[0.07em]"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="hover:text-text-secondary focus-visible:ring-accent/55 flex h-full w-full items-center gap-1 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-muted text-xs opacity-70">
          {arrow}
        </span>
      </button>
    </th>
  );
}

interface RowProps {
  row: SearchResult;
  expanded: boolean;
  onToggle: (sessionId: string) => void;
  onClose: () => void;
}

function Row({ row, expanded, onToggle, onClose }: RowProps) {
  const title = displayTitle(row);
  const subtitle = displaySubtitle(row);
  const project = projectLabel(row);
  const relation = relationFor(row);
  const { date, time } = runtimeDisplay(row);
  const { tokens, tools } = activityMetrics(row);

  // Click anywhere on the row toggles the drawer, but we exclude clicks
  // that originate inside an interactive control (the row-action cluster,
  // copy buttons, links) so the drawer doesn't fight the inner widgets.
  const onRowClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    onToggle(row.sessionId);
  };

  const onRowKey = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget) return;
    event.preventDefault();
    onToggle(row.sessionId);
  };

  return (
    <>
      <tr
        data-session-id={row.sessionId}
        data-expanded={expanded ? "true" : "false"}
        onClick={onRowClick}
        onKeyDown={onRowKey}
        tabIndex={0}
        aria-expanded={expanded}
        className="border-border hover:bg-surface-low focus-visible:ring-accent/55 cursor-pointer border-b align-middle last:border-b-0 focus-visible:outline-none focus-visible:ring-2"
      >
        <td className="px-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="text-text-secondary inline-flex h-6 w-6 items-center justify-center rounded font-mono text-sm"
            title={row.provider}
          >
            {PROVIDER_GLYPH[row.provider] ?? row.provider[0]?.toUpperCase()}
          </span>
          <span className="sr-only">{row.provider}</span>
        </td>
        <td className="min-w-0 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-text truncate text-sm font-semibold leading-tight">
              {title}
            </span>
            <span className="text-muted truncate text-xs leading-snug">
              {subtitle}
            </span>
          </div>
        </td>
        <td className="text-text-secondary truncate px-3 py-2 text-sm">
          {project}
        </td>
        <td className="px-3 py-2 align-middle">
          <RelationCell relation={relation} />
        </td>
        <td className="px-3 py-2 text-sm tabular-nums">
          <div className="flex flex-col gap-0.5 leading-tight">
            <span className="text-text-secondary">{date || "—"}</span>
            <span className="text-muted text-xs">{time || ""}</span>
          </div>
        </td>
        <td
          className="px-3 py-2 text-sm tabular-nums"
          data-testid="activity-cell"
        >
          <div className="flex items-center gap-3">
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
        </td>
        <td className="px-3 py-2 align-middle" data-testid="match-cell">
          <MatchPill score={row.matchScore} />
        </td>
        <td className="px-3 py-2">
          <RowActions row={row} />
        </td>
      </tr>
      {expanded ? (
        <tr
          data-session-id={`${row.sessionId}-drawer`}
          className="bg-surface-low"
        >
          <td colSpan={8} className="p-0">
            <RowDrawer
              sessionId={row.sessionId}
              path={row.path}
              cwd={row.cwd}
              onClose={onClose}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RelationCell({ relation }: { relation: Relation }) {
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
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex w-max items-center rounded-sm border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.08)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-warn)]">
        subagent of
      </span>
      <span className="text-muted truncate text-xs" title={relation.parentTitle ?? ""}>
        {relation.parentTitle ?? "(unknown parent)"}
      </span>
    </div>
  );
}

function singleString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function paramsFromRecord(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  return params;
}
