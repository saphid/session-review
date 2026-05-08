import "server-only";

import { linkedSessionsLite, topUsageSignals } from "@core/db.js";
import type { LinkedSession, SessionReviewDb, TopUsageSignal } from "@core/db.js";

export interface SessionSummary {
  topTools: TopUsageSignal[];
  topSkills: TopUsageSignal[];
  linkedSessions: LinkedSession[];
}

/**
 * Drawer-shaped summary for a single session. Reads from `usage_signals`
 * and the sessions table only — no transcript body, no per-row regex.
 * Backs `/api/session-summary` and the `RowDrawer` client component.
 */
export function buildSessionSummary(db: SessionReviewDb, sessionId: string): SessionSummary {
  return {
    topTools: topUsageSignals(db, sessionId, "tool", 5),
    topSkills: topUsageSignals(db, sessionId, "skill", 5),
    linkedSessions: linkedSessionsLite(db, sessionId),
  };
}
