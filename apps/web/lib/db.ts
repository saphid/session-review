import "server-only";

import path from "node:path";
import { openDb, sessionHeader as coreSessionHeader, type SessionReviewDb } from "@core/db.js";

/**
 * Re-exported `sessionHeader` for direct server-component calls. Apps
 * under `apps/web/app/**` that need the header data (e.g. the session
 * detail page) consume this rather than reaching across the `@core/*`
 * alias themselves — the bridge stays the single seam to the data
 * layer.
 */
export const sessionHeader = coreSessionHeader;

const defaultDb = path.join(process.env.HOME ?? ".", ".local", "share", "session-review", "sessions.sqlite");

let cached: SessionReviewDb | null = null;

/**
 * Returns the shared session-review SQLite handle for this Node process.
 *
 * The handle is opened once and cached on the module — subsequent callers in
 * the same process share the same connection. The path resolves from
 * `SESSION_REVIEW_DB`, falling back to the legacy default the CLI uses
 * (`$HOME/.local/share/session-review/sessions.sqlite`). The CLI in
 * `src/cli.ts` reads the same environment variable and defaults.
 */
export function getDb(): SessionReviewDb {
  if (!cached) cached = openDb(process.env.SESSION_REVIEW_DB ?? defaultDb);
  return cached;
}
