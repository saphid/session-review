"use client";

import { useMemo, useState } from "react";
import type { UsageSummaryRow } from "@/lib/types";

type SortKey = "name" | "count" | "sessions";
type SortDir = "asc" | "desc";

interface UsageTableProps {
  rows: UsageSummaryRow[];
}

/**
 * Sortable usage breakdown. Three columns: Name / Uses (DESC default) /
 * Sessions. `aria-sort` updates honestly on click so screen readers track
 * which column is active without us re-keying the header text.
 *
 * The component is intentionally read-only — T15 will turn rows into links so
 * a click filters the search page to that tool.
 */
export function UsageTable({ rows }: UsageTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "count",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const next = [...rows].sort((a, b) => compareRows(a, b, sort.key));
    return sort.dir === "asc" ? next : next.reverse();
  }, [rows, sort]);

  const ariaSort = (key: SortKey): "none" | "ascending" | "descending" =>
    sort.key !== key ? "none" : sort.dir === "asc" ? "ascending" : "descending";

  const onSortClick = (key: SortKey): void =>
    setSort((current) => {
      if (current.key !== key) return { key, dir: defaultDirFor(key) };
      return { key, dir: current.dir === "asc" ? "desc" : "asc" };
    });

  return (
    <div
      data-slot="usage-table"
      className="border-border bg-surface overflow-hidden rounded-lg border"
    >
      <table className="w-full text-sm">
        <thead className="border-border border-b bg-surface-raised text-xs uppercase tracking-wide text-muted">
          <tr>
            <Th
              scope="col"
              align="left"
              ariaSort={ariaSort("name")}
              onClick={() => onSortClick("name")}
            >
              Name
            </Th>
            <Th
              scope="col"
              align="right"
              ariaSort={ariaSort("count")}
              onClick={() => onSortClick("count")}
            >
              Uses
            </Th>
            <Th
              scope="col"
              align="right"
              ariaSort={ariaSort("sessions")}
              onClick={() => onSortClick("sessions")}
            >
              Sessions
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-muted">
                No usage rows for the current filters.
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={`${row.kind}:${row.name}`}
                className="border-border/60 border-t hover:bg-surface-raised"
              >
                <td className="px-3 py-2 text-text">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text">
                  {row.count.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                  {row.sessions.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface ThProps {
  scope: "col";
  align: "left" | "right";
  ariaSort: "none" | "ascending" | "descending";
  onClick: () => void;
  children: React.ReactNode;
}

function Th({ scope, align, ariaSort, onClick, children }: ThProps) {
  const isActive = ariaSort !== "none";
  const arrow = ariaSort === "ascending" ? "↑" : ariaSort === "descending" ? "↓" : "";
  return (
    <th
      scope={scope}
      aria-sort={ariaSort}
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} ${isActive ? "text-text" : "text-muted hover:text-text"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 rounded-sm`}
      >
        <span>{children}</span>
        {arrow ? (
          <span aria-hidden="true" className="font-mono text-[10px]">
            {arrow}
          </span>
        ) : null}
      </button>
    </th>
  );
}

function defaultDirFor(key: SortKey): SortDir {
  // Numeric columns default to DESC (largest first); name defaults to ASC.
  return key === "name" ? "asc" : "desc";
}

function compareRows(a: UsageSummaryRow, b: UsageSummaryRow, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name);
  return (a[key] ?? 0) - (b[key] ?? 0);
}
