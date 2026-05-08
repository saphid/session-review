import "server-only";

import { searchFilteredSessions } from "@core/db.js";
import type { SearchResult } from "@core/types.js";
import { getDb } from "./db";
import { toFilters, type ParsedSearchParams } from "./search-params";

/**
 * Server-only helper used by the search page route. Wraps
 * `searchFilteredSessions` so the page module imports a single
 * project-local symbol and never crosses the `@core/*` alias from a
 * route component (Next bundles route components and route handlers in
 * separate contexts; centralising the boundary here keeps the page
 * happy and lets the bridge module own the data dependency).
 */
export function searchSessionsForPage(params: ParsedSearchParams): SearchResult[] {
  return searchFilteredSessions(getDb(), toFilters(params));
}
