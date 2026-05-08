import "server-only";

import { getDb } from "./db";

/**
 * Total session count for the sidebar badge. Caps the displayed value
 * at "100+" so the badge never balloons; the raw number is also
 * returned for callers that want to format it differently.
 *
 * Tiny server-only helper — kept separate from `server-search.ts` so the
 * shell sidebar doesn't have to pretend to be a search consumer.
 */
export interface SessionsCountSummary {
  /** Real `COUNT(*)` from `sessions`. */
  total: number;
  /** Display string — `"100+"` when the count exceeds 100, else the integer. */
  label: string;
}

export function getSessionsCount(): SessionsCountSummary {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM sessions")
      .get() as { count: number } | undefined;
    const total = row?.count ?? 0;
    return {
      total,
      label: total > 100 ? "100+" : String(total),
    };
  } catch {
    // The shell renders on every route; if the DB isn't ready yet we
    // fall back to a calm placeholder rather than 500-ing the layout.
    return { total: 0, label: "0" };
  }
}
