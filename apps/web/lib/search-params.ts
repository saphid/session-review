// URL search-param schema for the search page.
//
// Two callers:
//   1. The server component (`apps/web/app/page.tsx`) reads `searchParams`
//      from Next's route props and uses `parse(...)` to turn them into a
//      typed shape.
//   2. The client filter component (`apps/web/components/search/Filters.tsx`)
//      uses `serialize(...)` to build the URL it pushes to the router.
//
// Defaults match `apps/web/lib/search.ts` so the SSR query and the URL share
// one source of truth. `serialize` drops empty/default values to keep
// URLs short and shareable.

import type { BatchMode } from "@core/analytics.js";
import type { ProviderId } from "@core/types.js";

export const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Matches the URL token written by `ResultsTable` headers (`?sort=runtime`)
// and the SQL switch in `searchFilteredSessions`. Keep the names in sync
// with `apps/web/lib/search-display.ts#SortKey`.
export type SortField = "runtime" | "activity" | "match";
export type SortDir = "asc" | "desc";

export interface ParsedSearchParams {
  query: string;
  provider: ProviderId | "";
  cwd: string;
  path: string;
  startDate: string;
  endDate: string;
  batchMode: BatchMode;
  limit: number;
  sort: SortField | "";
  dir: SortDir;
}

export const EMPTY_PARSED: ParsedSearchParams = {
  query: "",
  provider: "",
  cwd: "",
  path: "",
  startDate: "",
  endDate: "",
  batchMode: "include",
  limit: DEFAULT_LIMIT,
  sort: "",
  dir: "desc",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parse(raw: RawSearchParams | URLSearchParams): ParsedSearchParams {
  const get = (key: string): string => {
    if (raw instanceof URLSearchParams) return (raw.get(key) ?? "").trim();
    const value = raw[key];
    if (Array.isArray(value)) return (value[0] ?? "").trim();
    return (value ?? "").trim();
  };

  return {
    query: get("query"),
    provider: parseProvider(get("provider")),
    cwd: get("cwd"),
    path: get("path"),
    startDate: get("startDate"),
    endDate: get("endDate"),
    batchMode: parseBatchMode(get("batchMode")),
    limit: parseLimit(get("limit")),
    sort: parseSort(get("sort")),
    dir: parseDir(get("dir")),
  };
}

export function serialize(params: ParsedSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  if (params.query) out.set("query", params.query);
  if (params.provider) out.set("provider", params.provider);
  if (params.cwd) out.set("cwd", params.cwd);
  if (params.path) out.set("path", params.path);
  if (params.startDate) out.set("startDate", params.startDate);
  if (params.endDate) out.set("endDate", params.endDate);
  if (params.batchMode !== "include") out.set("batchMode", params.batchMode);
  if (params.limit !== DEFAULT_LIMIT) out.set("limit", String(params.limit));
  if (params.sort) {
    out.set("sort", params.sort);
    if (params.dir !== "desc") out.set("dir", params.dir);
  }
  return out;
}

/**
 * Build a search-page href that drills to sessions matching `query`, optionally
 * scoped to a date range. Used by the usage page so a click on a legend
 * item, bar segment, or table row pivots to the session list filtered to that
 * tool/skill — and to the bucket the segment belongs to, when known.
 *
 * Empty bucket strings are dropped so a legend click stays untyped over time.
 * Dates pass through verbatim (the data layer treats "YYYY-MM-DD" as the
 * canonical bucket boundary; week buckets already arrive as a Monday date).
 */
export function buildSearchHref(
  query: string,
  range?: { startDate?: string | null; endDate?: string | null },
): string {
  const out = new URLSearchParams();
  out.set("query", query);
  if (range?.startDate) out.set("startDate", range.startDate);
  if (range?.endDate) out.set("endDate", range.endDate);
  return `/?${out.toString()}`;
}

/**
 * Convert parsed params into the shape the data layer accepts. Mirrors
 * `parseSearchFilters` in `apps/web/lib/search.ts` so SSR can call
 * `searchFilteredSessions` directly without round-tripping through the API.
 */
export function toFilters(params: ParsedSearchParams): {
  provider: ProviderId | null;
  query: string | null;
  cwd: string | null;
  path: string | null;
  startDate: string | null;
  endDate: string | null;
  batchMode: BatchMode;
  limit: number;
  sort: SortField | null;
  dir: SortDir | null;
} {
  return {
    provider: params.provider === "" ? null : params.provider,
    query: params.query || null,
    cwd: params.cwd || null,
    path: params.path || null,
    startDate: params.startDate || null,
    endDate: params.endDate || null,
    batchMode: params.batchMode,
    limit: params.limit,
    // SSR honors the URL sort/dir so the first paint matches the query string.
    // When the URL omits `sort` we leave both null and let the SQL fall back
    // to its default ordering (rawRank for query, started_at DESC otherwise).
    sort: params.sort === "" ? null : params.sort,
    dir: params.sort === "" ? null : params.dir,
  };
}

function parseProvider(value: string): ProviderId | "" {
  return value === "pi" || value === "claude" || value === "codex" || value === "cursor"
    ? value
    : "";
}

function parseBatchMode(value: string): BatchMode {
  return value === "exclude" || value === "only" ? value : "include";
}

function parseLimit(value: string): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseSort(value: string): SortField | "" {
  return value === "runtime" || value === "activity" || value === "match" ? value : "";
}

function parseDir(value: string): SortDir {
  return value === "asc" ? "asc" : "desc";
}
