import type { SearchResult } from "./types";

/**
 * Pure presentation helpers for the search results table. Kept framework-free
 * so server components, client components, and unit tests can share them.
 *
 * None of these helpers fabricate data — duration, turn counts, and match
 * scores are deliberately absent from this module. See
 * `docs/review/03-search-page.md` fails #1–#3 for the history.
 */

export interface RuntimeDisplay {
  /** Locale-formatted date, e.g. "15 Jan 2026". Empty string when missing. */
  date: string;
  /** 24-hour clock time, e.g. "12:00". Empty string when missing. */
  time: string;
}

export interface ActivityMetrics {
  /** Real `tokenEstimate` from the API. */
  tokens: number;
  /** Real `toolUseCount` from the API. */
  tools: number;
}

export type Relation =
  | { kind: "primary" }
  | { kind: "subagent"; parentTitle: string | null }
  | { kind: "batch" };

/**
 * Title shown in the TASK column. Falls back to the session id when the
 * provider didn't ship a title (Cursor scratchpads, raw Codex sessions, …).
 */
export function displayTitle(row: SearchResult): string {
  const trimmed = row.title?.trim();
  if (trimmed) return trimmed;
  return row.sessionId;
}

/**
 * Subtitle line beneath the title. Prefers the FTS snippet (raw — we do NOT
 * strip `[`/`]` per `docs/review/03-search-page.md` fail #6, since the legacy
 * stripper corrupted source code containing brackets), and falls back to a
 * shortened path of the form `…/dir/file`.
 */
export function displaySubtitle(row: SearchResult): string {
  const snippet = row.snippet?.trim();
  if (snippet) return snippet;
  return shortenPath(row.path);
}

function shortenPath(p: string): string {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  const tail = parts.slice(-2).join("/");
  return `…/${tail}`;
}

/**
 * Humanized project label from `cwd`. `/Users/alex/Personal/Projects/foo` →
 * `foo`. Falls back to the raw cwd or `—`.
 */
export function projectLabel(row: SearchResult): string {
  if (!row.cwd) return "—";
  const parts = row.cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? row.cwd;
}

/**
 * Relation classification — primary, subagent (with parent title), or batch.
 * Batch wins when both flags are set, matching the legacy heuristic.
 */
export function relationFor(row: SearchResult): Relation {
  if (row.isBatch) return { kind: "batch" };
  if (row.isSubagent)
    return { kind: "subagent", parentTitle: row.parentTitle };
  return { kind: "primary" };
}

/**
 * Run-time display: locale-formatted date + 24-h time. We do NOT compute a
 * fabricated duration suffix (legacy `tokens / 850` clamp 8–72m) — the data
 * layer doesn't track session duration and we won't invent it.
 */
export function runtimeDisplay(row: SearchResult): RuntimeDisplay {
  if (!row.startedAt) return { date: "", time: "" };
  const d = new Date(row.startedAt);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const date = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { date, time };
}

/**
 * Returns the real activity metrics — token estimate plus tool-use count
 * from `usage_signals`. No fabricated turn count (the legacy hash trick).
 */
export function activityMetrics(row: SearchResult): ActivityMetrics {
  return {
    tokens: row.tokenEstimate,
    tools: row.toolUseCount,
  };
}

/**
 * Pretty-prints token counts with k-suffix for ≥1000. `0` returns `"0"`.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(tokens);
}

/**
 * Formats `matchScore` to 2 d.p. ("0.86"). Returns null when the API
 * provided no score (no query) — caller renders the em-dash.
 */
export function formatMatchScore(score: number | null): string | null {
  if (score === null) return null;
  if (!Number.isFinite(score)) return null;
  return score.toFixed(2);
}

export type SortKey = "runtime" | "activity" | "match";
export type SortDir = "asc" | "desc";

export function isSortKey(value: string | null): value is SortKey {
  return value === "runtime" || value === "activity" || value === "match";
}

export function isSortDir(value: string | null): value is SortDir {
  return value === "asc" || value === "desc";
}

/**
 * Default direction when a sort key is selected for the first time.
 * All three columns lead with the most-interesting value first:
 *   - match → `desc` (highest relevance first)
 *   - runtime → `desc` (newest first)
 *   - activity → `desc` (busiest first)
 */
export function defaultDirFor(key: SortKey): SortDir {
  // The argument is intentionally accepted so callers can pass the key
  // through opaquely; if we later split per-key defaults this is the seam.
  void key;
  return "desc";
}
