import "server-only";

import type { BatchMode } from "@core/analytics.js";
import type { ProviderId } from "@core/types.js";
import type { SessionFilters, SessionSortDir, SessionSortField } from "@core/db.js";

export const DEFAULT_SEARCH_LIMIT = 100;
const MAX_SEARCH_LIMIT = 500;

/**
 * Parses the URLSearchParams of an `/api/search` request into a `SessionFilters`
 * object the data layer accepts.
 *
 * Sort/dir come straight from the URL. Only the allowlisted values are
 * recognized — anything else falls back to `null` so `searchFilteredSessions`
 * uses its default ordering. The SQL itself never substitutes user-controlled
 * strings into ORDER BY (see `noQueryOrderBy`/`queryOrderBy` in `src/db.ts`).
 */
export function parseSearchFilters(params: URLSearchParams): SessionFilters {
  return {
    provider: parseProvider(params.get("provider")),
    query: emptyToNull(params.get("query")),
    cwd: emptyToNull(params.get("cwd")),
    path: emptyToNull(params.get("path")),
    startDate: emptyToNull(params.get("startDate")),
    endDate: emptyToNull(params.get("endDate")),
    batchMode: parseBatchMode(params.get("batchMode")),
    limit: parseLimit(params.get("limit")),
    sort: parseSort(params.get("sort")),
    dir: parseDir(params.get("dir")),
  };
}

function emptyToNull(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

function parseProvider(value: string | null): ProviderId | null {
  return value === "pi" || value === "claude" || value === "codex" || value === "cursor" ? value : null;
}

function parseBatchMode(value: string | null): BatchMode {
  return value === "exclude" || value === "only" ? value : "include";
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_SEARCH_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_LIMIT;
  return Math.min(Math.floor(parsed), MAX_SEARCH_LIMIT);
}

function parseSort(value: string | null): SessionSortField | null {
  return value === "match" || value === "runtime" || value === "activity" ? value : null;
}

function parseDir(value: string | null): SessionSortDir | null {
  return value === "asc" || value === "desc" ? value : null;
}
