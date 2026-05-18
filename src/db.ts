import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyBatchSession, extractExtensionUsageSignals, extractUsageSignals, type BatchMode, type TimeBucket, type UsageKind } from "./analytics.js";
import { bucketDate } from "./analytics.js";
import type { IngestSummary, ProviderId, SearchResult, SessionDocument } from "./types.js";

export type SessionReviewDb = Database.Database;

export type SessionSortField = "match" | "runtime" | "activity";
export type SessionSortDir = "asc" | "desc";

export interface SessionFilters {
  provider: ProviderId | null;
  query: string | null;
  cwd: string | null;
  path: string | null;
  startDate: string | null;
  endDate: string | null;
  batchMode: BatchMode;
  limit: number;
  sort?: SessionSortField | null;
  dir?: SessionSortDir | null;
}

export interface UsagePoint {
  bucket: string;
  name: string;
  count: number;
  sessions: number;
}

export interface UsageSummaryRow {
  kind: UsageKind;
  name: string;
  count: number;
  sessions: number;
}

export interface FilterOptions {
  providers: string[];
  cwd: string[];
}

export interface SessionTurnPoint {
  index: number;
  role: string;
  toolCount: number;
  skillCount: number;
}

export interface TranscriptItem {
  index: number;
  role: string;
  content: string;
  toolCount: number;
  skillCount: number;
}

export interface LinkedSession {
  sessionId: string;
  provider: string;
  title: string | null;
  startedAt: string | null;
  path: string;
  reason: string;
}

type RawSearchResult = Omit<SearchResult, "isBatch" | "isSubagent" | "parentSessionId" | "parentTitle" | "groupKey" | "groupLabel" | "groupReason" | "matchScore"> & {
  isBatch: number;
  rawRank: number | null;
  parentSessionId: string | null;
  parentTitle: string | null;
};

type ParentLookupRow = { sessionId: string; title: string | null; startedAt: string | null; path: string };

type ParentInfo = {
  isSubagent: boolean;
  parentSessionId: string | null;
  parentTitle: string | null;
  groupKey: string;
  groupLabel: string;
  groupReason: string;
};

export interface SessionDetails {
  sessionId: string;
  provider: string;
  title: string | null;
  startedAt: string | null;
  cwd: string | null;
  path: string;
  indexedAt: string;
  isBatch: boolean;
  purpose: string | null;
  bodyPreview: string;
  turnCount: number;
  toolUseCount: number;
  skillUseCount: number;
  turns: SessionTurnPoint[];
  transcript: TranscriptItem[];
  usage: UsageSummaryRow[];
  linkedSessions: LinkedSession[];
}

export function openDb(dbPath: string): SessionReviewDb {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 30000");
  migrate(db);
  return db;
}

function migrate(db: SessionReviewDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      path TEXT NOT NULL,
      title TEXT,
      started_at TEXT,
      cwd TEXT,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      indexed_at TEXT NOT NULL,
      UNIQUE(provider, path)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      session_id UNINDEXED,
      provider UNINDEXED,
      title,
      cwd,
      body,
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS usage_signals (
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('tool', 'skill')),
      name TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY(session_id, kind, name),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_kind_name ON usage_signals(kind, name);
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_signals(session_id);

    CREATE TABLE IF NOT EXISTS extension_usage_signals (
      session_id TEXT NOT NULL,
      package_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      event TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY(session_id, package_name, kind, name, event),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_extension_usage_package ON extension_usage_signals(package_name, kind, name, event);
    CREATE INDEX IF NOT EXISTS idx_extension_usage_session ON extension_usage_signals(session_id);

    CREATE TABLE IF NOT EXISTS transcript_items (
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      role TEXT,
      content_offset INTEGER NOT NULL,
      content_length INTEGER NOT NULL,
      tool_count INTEGER NOT NULL DEFAULT 0,
      skill_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, idx),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
  ensureColumn(db, "sessions", "is_batch", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "sessions", "parent_session_id", "TEXT");
  ensureColumn(db, "sessions", "parent_title", "TEXT");
}

function ensureColumn(db: SessionReviewDb, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function upsertSession(db: SessionReviewDb, doc: SessionDocument): boolean {
  const existing = db
    .prepare("SELECT mtime_ms AS mtimeMs, size_bytes AS sizeBytes FROM sessions WHERE id = ?")
    .get(doc.sessionId) as { mtimeMs: number; sizeBytes: number } | undefined;
  if (existing?.mtimeMs === doc.mtimeMs && existing.sizeBytes === doc.sizeBytes) return false;

  writeSession(db, doc);
  return true;
}

function writeSession(db: SessionReviewDb, doc: SessionDocument): void {
  const isBatch = classifyBatchSession({ provider: doc.provider, path: doc.path, title: doc.title, cwd: doc.cwd, body: doc.body }) ? 1 : 0;
  const signals = extractUsageSignals(doc.body);
  const extensionSignals = extractExtensionUsageSignals(doc.body);
  // Resolve parent at ingest time so search avoids the per-row lookup. Parents
  // ingested later are picked up by the `derive` backfill (rebuildDerived).
  const parent = findParentSession(db, doc.sessionId, doc.path);
  const parentSessionId = parent?.sessionId ?? null;
  const parentTitle = parent?.title ?? null;
  const skillNames = signals.filter((entry) => entry.kind === "skill").map((entry) => entry.name.toLowerCase());
  const transcriptItems = computeTranscriptItems(doc.body, skillNames);
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO sessions (id, provider, path, title, started_at, cwd, mtime_ms, size_bytes, indexed_at, is_batch, parent_session_id, parent_title)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider = excluded.provider,
        path = excluded.path,
        title = excluded.title,
        started_at = excluded.started_at,
        cwd = excluded.cwd,
        mtime_ms = excluded.mtime_ms,
        size_bytes = excluded.size_bytes,
        indexed_at = excluded.indexed_at,
        is_batch = excluded.is_batch,
        parent_session_id = excluded.parent_session_id,
        parent_title = excluded.parent_title
    `).run(doc.sessionId, doc.provider, doc.path, doc.title, doc.startedAt, doc.cwd, doc.mtimeMs, doc.sizeBytes, new Date().toISOString(), isBatch, parentSessionId, parentTitle);
    db.prepare("DELETE FROM sessions_fts WHERE session_id = ?").run(doc.sessionId);
    db.prepare("DELETE FROM usage_signals WHERE session_id = ?").run(doc.sessionId);
    db.prepare("DELETE FROM extension_usage_signals WHERE session_id = ?").run(doc.sessionId);
    db.prepare("DELETE FROM transcript_items WHERE session_id = ?").run(doc.sessionId);
    db.prepare("INSERT INTO sessions_fts (session_id, provider, title, cwd, body) VALUES (?, ?, ?, ?, ?)").run(
      doc.sessionId,
      doc.provider,
      doc.title ?? "",
      doc.cwd ?? "",
      doc.body,
    );
    const insertSignal = db.prepare("INSERT INTO usage_signals (session_id, kind, name, count) VALUES (?, ?, ?, ?)");
    for (const signal of signals) insertSignal.run(doc.sessionId, signal.kind, signal.name, signal.count);
    const insertExtensionSignal = db.prepare("INSERT INTO extension_usage_signals (session_id, package_name, kind, name, event, count) VALUES (?, ?, ?, ?, ?, ?)");
    for (const signal of extensionSignals) insertExtensionSignal.run(doc.sessionId, signal.packageName, signal.kind, signal.name, signal.event, signal.count);
    const insertTranscriptItem = db.prepare(
      "INSERT INTO transcript_items (session_id, idx, role, content_offset, content_length, tool_count, skill_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const item of transcriptItems) {
      insertTranscriptItem.run(doc.sessionId, item.index, item.role, item.contentOffset, item.contentLength, item.toolCount, item.skillCount);
    }
  });
  tx();
}

export function indexedFileMeta(db: SessionReviewDb, provider: ProviderId, filePath: string): { mtimeMs: number; sizeBytes: number } | null {
  return (
    (db
      .prepare("SELECT mtime_ms AS mtimeMs, size_bytes AS sizeBytes FROM sessions WHERE provider = ? AND path = ?")
      .get(provider, filePath) as { mtimeMs: number; sizeBytes: number } | undefined) ?? null
  );
}

export function searchSessions(db: SessionReviewDb, query: string, provider: ProviderId | null, limit: number): SearchResult[] {
  return searchFilteredSessions(db, { provider, query, cwd: null, path: null, startDate: null, endDate: null, batchMode: "include", limit });
}

export function searchFilteredSessions(db: SessionReviewDb, filters: SessionFilters): SearchResult[] {
  const params: Record<string, string | number | null> = { limit: filters.limit };
  const sessionClauses = sessionWhereClauses(filters, params);
  if (!filters.query) {
    const rows = db
      .prepare(`
        SELECT s.provider, s.id AS sessionId, s.title, s.started_at AS startedAt, s.cwd, s.path, s.is_batch AS isBatch,
               CAST(s.size_bytes / 4 AS INTEGER) AS tokenEstimate,
               COALESCE((SELECT SUM(count) FROM usage_signals u WHERE u.session_id = s.id AND u.kind = 'tool'), 0) AS toolUseCount,
               NULL AS snippet,
               NULL AS rawRank,
               s.parent_session_id AS parentSessionId,
               COALESCE(parent.title, s.parent_title) AS parentTitle
        FROM sessions s
        LEFT JOIN sessions parent ON parent.id = s.parent_session_id
        ${sessionClauses.length ? `WHERE ${sessionClauses.join(" AND ")}` : ""}
        ${noQueryOrderBy(filters)}
        LIMIT @limit
      `)
      .all(params) as RawSearchResult[];
    return enrichSearchResults(rows);
  }

  params.query = filters.query;
  // Limit FTS matches before computing snippets. On large transcript stores,
  // snippet() across every match can make the UI look hung.
  const rows = db
    .prepare(`
      WITH matched AS (
        SELECT rowid, session_id, bm25(sessions_fts) AS rawRank
        FROM sessions_fts
        WHERE sessions_fts MATCH @query
        ORDER BY rawRank
        LIMIT @limit
      )
      SELECT s.provider, s.id AS sessionId, s.title, s.started_at AS startedAt, s.cwd, s.path, s.is_batch AS isBatch,
             CAST(s.size_bytes / 4 AS INTEGER) AS tokenEstimate,
             COALESCE((SELECT SUM(count) FROM usage_signals u WHERE u.session_id = s.id AND u.kind = 'tool'), 0) AS toolUseCount,
             snippet(sessions_fts, 4, '[', ']', ' … ', 24) AS snippet,
             matched.rawRank AS rawRank,
             s.parent_session_id AS parentSessionId,
             COALESCE(parent.title, s.parent_title) AS parentTitle
      FROM matched
      JOIN sessions_fts ON sessions_fts.rowid = matched.rowid
      JOIN sessions s ON s.id = matched.session_id
      LEFT JOIN sessions parent ON parent.id = s.parent_session_id
      ${sessionClauses.length ? `WHERE ${sessionClauses.join(" AND ")}` : ""}
      ${queryOrderBy(filters)}
    `)
    .all(params) as RawSearchResult[];
  return enrichSearchResults(rows);
}

/**
 * ORDER BY clause for the no-query branch. Hardcoded mapping (no string
 * interpolation from input) so the SQL stays injection-safe even though the
 * sort/dir come from URL params.
 *
 * `sort=match` is meaningless without a query (no rawRank exists), so it
 * silently falls back to the default `started_at DESC` rather than erroring.
 */
function noQueryOrderBy(filters: SessionFilters): string {
  const dir = filters.dir === "asc" ? "ASC" : "DESC";
  switch (filters.sort) {
    case "runtime":
      return `ORDER BY s.started_at ${dir}`;
    case "activity":
      return `ORDER BY s.size_bytes ${dir}`;
    case "match":
    default:
      return "ORDER BY s.started_at DESC";
  }
}

/**
 * ORDER BY clause for the FTS-matched branch. `rawRank` from bm25() is
 * "lower is better", so dir=desc (best first) maps to `rawRank ASC` and
 * dir=asc (worst first) maps to `rawRank DESC` — see enrichSearchResults
 * for the matching matchScore normalization.
 */
function queryOrderBy(filters: SessionFilters): string {
  const dir = filters.dir === "asc" ? "ASC" : "DESC";
  switch (filters.sort) {
    case "match": {
      const rankDir = filters.dir === "asc" ? "DESC" : "ASC";
      return `ORDER BY matched.rawRank ${rankDir}`;
    }
    case "runtime":
      return `ORDER BY s.started_at ${dir}`;
    case "activity":
      return `ORDER BY s.size_bytes ${dir}`;
    default:
      return "ORDER BY matched.rawRank";
  }
}

function enrichSearchResults(rows: RawSearchResult[]): SearchResult[] {
  // bm25() returns a non-positive number where smaller (more negative) means a
  // better match. Normalize the batch to 0..1 (best=1) so the UI can show a
  // real relevance score instead of a fabricated one. When no query was used,
  // every row has rawRank = null and we propagate matchScore = null.
  const ranks = rows.map((row) => row.rawRank).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minRank = ranks.length ? Math.min(...ranks) : 0;
  const maxRank = ranks.length ? Math.max(...ranks) : 0;
  const span = maxRank - minRank;
  return rows.map((row) => {
    const parent = parentInfoFromRow(row);
    let matchScore: number | null = null;
    if (typeof row.rawRank === "number" && Number.isFinite(row.rawRank)) {
      matchScore = ranks.length === 1 || span === 0 ? 1 : (maxRank - row.rawRank) / span;
    }
    return {
      provider: row.provider,
      sessionId: row.sessionId,
      title: row.title,
      startedAt: row.startedAt,
      cwd: row.cwd,
      path: row.path,
      snippet: row.snippet,
      tokenEstimate: row.tokenEstimate,
      toolUseCount: row.toolUseCount,
      matchScore,
      isBatch: row.isBatch === 1,
      ...parent,
    };
  });
}

function parentInfoFromRow(row: RawSearchResult): ParentInfo {
  // Parent comes from the JOIN — see searchFilteredSessions. Per-row prepared
  // parent lookups are intentionally gone; the JOIN keeps search to a single
  // round trip.
  if (row.parentSessionId) {
    const title = row.parentTitle?.trim();
    return {
      isSubagent: true,
      parentSessionId: row.parentSessionId,
      parentTitle: row.parentTitle,
      groupKey: `primary:${row.parentSessionId}`,
      groupLabel: title ? `Primary: ${title}` : `Primary session ${shortId(row.parentSessionId)}`,
      groupReason: "subagent path points at this primary session",
    };
  }

  const synthetic = syntheticParentFromPath(row.provider, row.path);
  if (synthetic) return synthetic;

  return {
    isSubagent: false,
    parentSessionId: null,
    parentTitle: null,
    groupKey: `primary:${row.sessionId}`,
    groupLabel: row.title?.trim() ? row.title.trim() : `Session ${shortId(row.sessionId)}`,
    groupReason: "primary session",
  };
}

function findParentSession(db: SessionReviewDb, sessionId: string, filePath: string): ParentLookupRow | null {
  const candidates = parentPathCandidates(filePath);
  if (candidates.length === 0) return null;
  const lookup = db.prepare("SELECT id AS sessionId, title, started_at AS startedAt, path FROM sessions WHERE path = ? AND id != ? LIMIT 1");
  for (const candidate of candidates) {
    const parent = lookup.get(candidate, sessionId) as ParentLookupRow | undefined;
    if (parent) return parent;
  }
  return null;
}

function parentPathCandidates(filePath: string): string[] {
  const candidates = new Set<string>();
  const subagentsIndex = filePath.indexOf("/subagents/");
  if (subagentsIndex > 0) candidates.add(`${filePath.slice(0, subagentsIndex)}.jsonl`);

  const segments = filePath.split("/");
  for (let index = 1; index < segments.length - 1; index++) {
    const segment = segments[index];
    if (!segment || segment.endsWith(".jsonl")) continue;
    const hasChildRun = segments.slice(index + 1, -1).some((part) => /^run-\d+$/.test(part) || part === "subagents");
    if (!hasChildRun) continue;
    candidates.add(`${segments.slice(0, index).join("/")}/${segment}.jsonl`);
  }
  candidates.delete(filePath);
  return [...candidates];
}

function syntheticParentFromPath(provider: ProviderId | string, filePath: string): ParentInfo | null {
  const subagentsIndex = filePath.indexOf("/subagents/");
  if (subagentsIndex > 0) {
    const parentStem = path.basename(filePath.slice(0, subagentsIndex));
    return {
      isSubagent: true,
      parentSessionId: null,
      parentTitle: null,
      groupKey: `synthetic-primary:${provider}:${parentStem}`,
      groupLabel: `${provider} primary ${parentStem}`,
      groupReason: "subagent folder names the primary session, but the primary log was not indexed",
    };
  }

  const segments = filePath.split("/");
  const runIndex = segments.findIndex((part) => /^run-\d+$/.test(part));
  if (runIndex > 1) {
    const parentStem = segments[runIndex - 2];
    if (parentStem) {
      return {
        isSubagent: true,
        parentSessionId: null,
        parentTitle: null,
        groupKey: `synthetic-primary:${provider}:${parentStem}`,
        groupLabel: `${provider} primary ${parentStem}`,
        groupReason: "nested run folder looks like a delegated/subagent session",
      };
    }
  }
  return null;
}

function shortId(sessionId: string): string {
  return sessionId.length <= 18 ? sessionId : `${sessionId.slice(0, 18)}…`;
}

export function usageSummary(db: SessionReviewDb, kind: UsageKind, filters: Omit<SessionFilters, "query" | "limit">): UsageSummaryRow[] {
  const params: Record<string, string | number | null> = { kind };
  const clauses = sessionWhereClauses({ ...filters, query: null, limit: 0 }, params);
  return db
    .prepare(`
      SELECT u.kind, u.name, SUM(u.count) AS count, COUNT(DISTINCT u.session_id) AS sessions
      FROM usage_signals u
      JOIN sessions s ON s.id = u.session_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")} AND` : "WHERE"} u.kind = @kind
      GROUP BY u.kind, u.name
      ORDER BY count DESC, sessions DESC, name ASC
      LIMIT 200
    `)
    .all(params) as UsageSummaryRow[];
}

export function usageTimeline(db: SessionReviewDb, kind: UsageKind, bucket: TimeBucket, filters: Omit<SessionFilters, "query" | "limit">): UsagePoint[] {
  const params: Record<string, string | number | null> = { kind };
  const clauses = sessionWhereClauses({ ...filters, query: null, limit: 0 }, params);
  const rows = db
    .prepare(`
      SELECT s.started_at AS startedAt, u.name, SUM(u.count) AS count, COUNT(DISTINCT u.session_id) AS sessions
      FROM usage_signals u
      JOIN sessions s ON s.id = u.session_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")} AND` : "WHERE"} u.kind = @kind
      GROUP BY s.started_at, u.name
      ORDER BY s.started_at ASC
    `)
    .all(params) as Array<{ startedAt: string | null; name: string; count: number; sessions: number }>;
  const grouped = new Map<string, UsagePoint>();
  for (const row of rows) {
    const key = `${bucketDate(row.startedAt, bucket)}\u0000${row.name}`;
    const current = grouped.get(key) ?? { bucket: bucketDate(row.startedAt, bucket), name: row.name, count: 0, sessions: 0 };
    current.count += row.count;
    current.sessions += row.sessions;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || b.count - a.count);
}

export function rebuildDerived(db: SessionReviewDb): number {
  const rows = db
    .prepare(`
      SELECT s.id AS sessionId, s.provider, s.path, s.title, s.cwd, f.body
      FROM sessions s
      JOIN sessions_fts f ON f.session_id = s.id
    `)
    .all() as Array<{ sessionId: string; provider: ProviderId; path: string; title: string | null; cwd: string | null; body: string }>;
  const tx = db.transaction(() => {
    const updateSession = db.prepare("UPDATE sessions SET is_batch = ? WHERE id = ?");
    const deleteSignals = db.prepare("DELETE FROM usage_signals WHERE session_id = ?");
    const insertSignal = db.prepare("INSERT INTO usage_signals (session_id, kind, name, count) VALUES (?, ?, ?, ?)");
    const deleteTranscriptItems = db.prepare("DELETE FROM transcript_items WHERE session_id = ?");
    const insertTranscriptItem = db.prepare(
      "INSERT INTO transcript_items (session_id, idx, role, content_offset, content_length, tool_count, skill_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    for (const row of rows) {
      const isBatch = classifyBatchSession({ provider: row.provider, path: row.path, title: row.title, cwd: row.cwd, body: row.body }) ? 1 : 0;
      updateSession.run(isBatch, row.sessionId);
      deleteSignals.run(row.sessionId);
      const signals = extractUsageSignals(row.body);
      for (const signal of signals) insertSignal.run(row.sessionId, signal.kind, signal.name, signal.count);
      const skillNames = signals.filter((entry) => entry.kind === "skill").map((entry) => entry.name.toLowerCase());
      deleteTranscriptItems.run(row.sessionId);
      for (const item of computeTranscriptItems(row.body, skillNames)) {
        insertTranscriptItem.run(row.sessionId, item.index, item.role, item.contentOffset, item.contentLength, item.toolCount, item.skillCount);
      }
    }
  });
  tx();
  rebuildParentLinks(db);
  return rows.length;
}

/**
 * Re-resolve `parent_session_id` / `parent_title` for every row. Idempotent:
 * the path-based candidate set is deterministic, so re-running this is a no-op
 * except for sessions whose parents were ingested after they were.
 */
export function rebuildParentLinks(db: SessionReviewDb): number {
  const rows = db.prepare("SELECT id AS sessionId, path FROM sessions").all() as Array<{ sessionId: string; path: string }>;
  let updated = 0;
  const tx = db.transaction(() => {
    const update = db.prepare("UPDATE sessions SET parent_session_id = ?, parent_title = ? WHERE id = ?");
    for (const row of rows) {
      const parent = findParentSession(db, row.sessionId, row.path);
      update.run(parent?.sessionId ?? null, parent?.title ?? null, row.sessionId);
      if (parent) updated++;
    }
  });
  tx();
  return updated;
}

/**
 * Header + stat strip for a session — everything except the per-turn
 * `transcript` content. Cheap on the hot path: no FTS body read, no
 * whole-body regex split. The per-turn metadata (`turns`) and aggregate
 * counts come from `transcript_items` when populated; on un-migrated rows
 * we fall back to the FTS body once so the API does not break.
 */
export function sessionHeader(db: SessionReviewDb, sessionId: string): Omit<SessionDetails, "transcript"> | null {
  const row = db
    .prepare(`
      SELECT s.id AS sessionId, s.provider, s.title, s.started_at AS startedAt, s.cwd, s.path,
             s.indexed_at AS indexedAt, s.is_batch AS isBatch
      FROM sessions s
      WHERE s.id = ?
    `)
    .get(sessionId) as ({ sessionId: string; provider: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; indexedAt: string; isBatch: number } | undefined);
  if (!row) return null;
  const usage = db
    .prepare(`
      SELECT kind, name, count, 1 AS sessions
      FROM usage_signals
      WHERE session_id = ?
      ORDER BY count DESC, name ASC
    `)
    .all(sessionId) as UsageSummaryRow[];
  const turnRows = db
    .prepare(`
      SELECT idx AS index_, role, tool_count AS toolCount, skill_count AS skillCount
      FROM transcript_items
      WHERE session_id = ?
      ORDER BY idx ASC
    `)
    .all(sessionId) as Array<{ index_: number; role: string | null; toolCount: number; skillCount: number }>;
  let turns: SessionTurnPoint[];
  let bodyForLinkAndPurpose = "";
  let bodyPreview = "";
  if (turnRows.length > 0) {
    turns = turnRows.map((entry) => ({ index: entry.index_, role: entry.role ?? "message", toolCount: entry.toolCount, skillCount: entry.skillCount }));
    // bodyPreview is best-effort. We intentionally do not read the full
    // file here — the streaming path delivers the transcript content. A
    // header-only consumer can request a preview later if needed.
  } else {
    // Fallback for rows ingested before the `transcript_items` migration.
    const ftsRow = db.prepare("SELECT body FROM sessions_fts WHERE session_id = ?").get(sessionId) as { body: string | null } | undefined;
    bodyForLinkAndPurpose = ftsRow?.body ?? "";
    const fallback = deriveTranscriptItems(bodyForLinkAndPurpose, usage);
    turns = fallback.map(({ index, role, toolCount, skillCount }) => ({ index, role, toolCount, skillCount }));
    bodyPreview = bodyForLinkAndPurpose.slice(0, 20_000);
  }
  const toolUseCount = usage.filter((entry) => entry.kind === "tool").reduce((sum, entry) => sum + entry.count, 0);
  const skillUseCount = usage.filter((entry) => entry.kind === "skill").reduce((sum, entry) => sum + entry.count, 0);
  return {
    sessionId: row.sessionId,
    provider: row.provider,
    title: row.title,
    startedAt: row.startedAt,
    cwd: row.cwd,
    path: row.path,
    indexedAt: row.indexedAt,
    isBatch: row.isBatch === 1,
    purpose: inferPurpose(row.title, bodyForLinkAndPurpose),
    bodyPreview,
    turnCount: turns.length,
    toolUseCount,
    skillUseCount,
    turns,
    usage,
    linkedSessions: findLinkedSessions(db, row.sessionId, bodyForLinkAndPurpose, row.path),
  };
}

interface StoredTranscriptOffset {
  index: number;
  role: string | null;
  contentOffset: number;
  contentLength: number;
  toolCount: number;
  skillCount: number;
}

/**
 * Returns the offsets stored in `transcript_items` for a session, sorted
 * by idx. An empty array means the session has not been migrated yet —
 * callers should fall back to deriving from the FTS body.
 */
export function transcriptOffsets(db: SessionReviewDb, sessionId: string): StoredTranscriptOffset[] {
  return db
    .prepare(`
      SELECT idx AS index_, role, content_offset AS contentOffset, content_length AS contentLength,
             tool_count AS toolCount, skill_count AS skillCount
      FROM transcript_items
      WHERE session_id = ?
      ORDER BY idx ASC
    `)
    .all(sessionId)
    .map((entry) => {
      const row = entry as { index_: number; role: string | null; contentOffset: number; contentLength: number; toolCount: number; skillCount: number };
      return {
        index: row.index_,
        role: row.role,
        contentOffset: row.contentOffset,
        contentLength: row.contentLength,
        toolCount: row.toolCount,
        skillCount: row.skillCount,
      };
    });
}

/**
 * Loads the per-turn transcript items for a session. The fast path slices
 * the on-disk transcript file (`sessions.path`) using offsets stored in
 * `transcript_items`. Falls back to deriving from the FTS body for rows
 * that pre-date the migration or whose source file is unavailable.
 */
export function loadTranscriptItems(db: SessionReviewDb, sessionId: string): TranscriptItem[] {
  const row = db.prepare("SELECT path FROM sessions WHERE id = ?").get(sessionId) as { path: string } | undefined;
  if (!row) return [];
  const offsets = transcriptOffsets(db, sessionId);
  if (offsets.length > 0) {
    try {
      const buffer = readFileSync(row.path);
      return offsets.map((entry) => ({
        index: entry.index,
        role: entry.role ?? "message",
        content: buffer.subarray(entry.contentOffset, entry.contentOffset + entry.contentLength).toString("utf8"),
        toolCount: entry.toolCount,
        skillCount: entry.skillCount,
      }));
    } catch {
      // Source file missing or unreadable — fall through to the FTS body
      // fallback so the API still returns content for un-migrated layouts.
    }
  }
  const ftsRow = db.prepare("SELECT body FROM sessions_fts WHERE session_id = ?").get(sessionId) as { body: string | null } | undefined;
  const usage = db
    .prepare("SELECT kind, name, count, 1 AS sessions FROM usage_signals WHERE session_id = ?")
    .all(sessionId) as UsageSummaryRow[];
  return deriveTranscriptItems(ftsRow?.body ?? "", usage);
}

export function sessionDetails(db: SessionReviewDb, sessionId: string): SessionDetails | null {
  const header = sessionHeader(db, sessionId);
  if (!header) return null;
  const transcript = loadTranscriptItems(db, sessionId);
  return { ...header, transcript };
}

export interface TopUsageSignal {
  name: string;
  count: number;
}

/**
 * Top N tool or skill names for a session, ordered by total `count`.
 * Reads from `usage_signals` only — no derivation, no fabrication, so the
 * search drawer never needs the legacy `pi-tool-1` placeholder.
 */
export function topUsageSignals(db: SessionReviewDb, sessionId: string, kind: "tool" | "skill", limit = 5): TopUsageSignal[] {
  return db
    .prepare(
      "SELECT name, SUM(count) AS count FROM usage_signals WHERE session_id = ? AND kind = ? GROUP BY name ORDER BY count DESC, name ASC LIMIT ?",
    )
    .all(sessionId, kind, limit) as TopUsageSignal[];
}

/**
 * Linked-session lookup that doesn't require the transcript body — drives
 * the search row drawer. Combines: stored `parent_session_id`,
 * `parent_path_candidates` (for older rows where the column hasn't been
 * backfilled), and `siblingPathPrefixes` for delegated/subagent groups.
 */
export function linkedSessionsLite(db: SessionReviewDb, sessionId: string): LinkedSession[] {
  const row = db
    .prepare("SELECT id AS sessionId, path, parent_session_id AS parentSessionId FROM sessions WHERE id = ? LIMIT 1")
    .get(sessionId) as { sessionId: string; path: string; parentSessionId: string | null } | undefined;
  if (!row) return [];

  const linked = new Map<string, LinkedSession>();

  if (row.parentSessionId) {
    const parentRow = db
      .prepare("SELECT id AS sessionId, provider, title, started_at AS startedAt, path FROM sessions WHERE id = ? LIMIT 1")
      .get(row.parentSessionId) as Omit<LinkedSession, "reason"> | undefined;
    if (parentRow) linked.set(parentRow.sessionId, { ...parentRow, reason: "primary session for this subagent" });
  } else {
    const parent = findParentSession(db, sessionId, row.path);
    if (parent) {
      const parentRow = db
        .prepare("SELECT id AS sessionId, provider, title, started_at AS startedAt, path FROM sessions WHERE id = ? LIMIT 1")
        .get(parent.sessionId) as Omit<LinkedSession, "reason"> | undefined;
      if (parentRow) linked.set(parentRow.sessionId, { ...parentRow, reason: "primary session for this subagent" });
    }
  }

  for (const siblingRoot of siblingPathPrefixes(row.path)) {
    const nearby = db
      .prepare("SELECT id AS sessionId, provider, title, started_at AS startedAt, path FROM sessions WHERE id != ? AND path LIKE ? ORDER BY started_at DESC LIMIT 25")
      .all(sessionId, `${siblingRoot}%`) as Array<Omit<LinkedSession, "reason">>;
    for (const sibling of nearby) {
      if (!linked.has(sibling.sessionId)) linked.set(sibling.sessionId, { ...sibling, reason: "same delegated/subagent group" });
    }
  }

  return [...linked.values()].slice(0, 25);
}

export function filterOptions(db: SessionReviewDb): FilterOptions {
  const providers = db.prepare("SELECT DISTINCT provider FROM sessions ORDER BY provider").pluck().all() as string[];
  const cwd = db.prepare("SELECT DISTINCT cwd FROM sessions WHERE cwd IS NOT NULL AND cwd != '' ORDER BY cwd LIMIT 500").pluck().all() as string[];
  return { providers, cwd };
}

export function statusRows(db: SessionReviewDb): Array<{ provider: ProviderId; count: number }> {
  return db.prepare("SELECT provider, COUNT(*) AS count FROM sessions GROUP BY provider ORDER BY provider").all() as Array<{ provider: ProviderId; count: number }>;
}

export function addSummary(a: IngestSummary, b: IngestSummary): IngestSummary {
  return { candidates: a.candidates + b.candidates, changed: a.changed + b.changed };
}

/**
 * In-memory transcript derivation. Used by the legacy code path and as a
 * fallback when `transcript_items` has no rows yet for a session.
 */
function deriveTranscriptItems(body: string, usage: UsageSummaryRow[]): TranscriptItem[] {
  const skillNames = usage.filter((entry) => entry.kind === "skill").map((entry) => entry.name.toLowerCase());
  return body
    .split(/\n(?=[A-Za-z_][\w-]*:)/)
    .map((chunk, index) => {
      const match = chunk.match(/^([A-Za-z_][\w-]*):\s*([\s\S]*)$/);
      const role = match?.[1]?.toLowerCase() ?? "message";
      const content = match?.[2] ?? chunk;
      const toolCount = (chunk.match(/\b(tool|tool_result|bash|read|write|edit|grep|web_search|bashExecution)\b/gi) ?? []).length;
      const lower = chunk.toLowerCase();
      const skillCount = skillNames.reduce((sum, skill) => sum + (lower.includes(skill) ? 1 : 0), 0);
      return { index: index + 1, role, content, toolCount, skillCount };
    })
    .filter((item) => item.content.trim().length > 0);
}

interface ComputedTranscriptItem {
  index: number;
  role: string;
  /** Byte offset of the content within the UTF-8-encoded body buffer. */
  contentOffset: number;
  contentLength: number;
  toolCount: number;
  skillCount: number;
}

/**
 * Walk a transcript body once at ingest time and emit per-turn metadata
 * keyed to byte offsets in the body's UTF-8 representation. Stored in the
 * `transcript_items` table so request-time detail can be served by reading
 * the source file from disk and slicing it — no FTS body read, no whole-body
 * regex split per request.
 *
 * The split rule mirrors the legacy `deriveTranscriptItems`:
 *   chunks are separated by `\n` followed by a `role:` prefix. Each chunk's
 *   `content_offset/length` covers the bytes after the role prefix and any
 *   whitespace, so `buffer.subarray(offset, offset + length).toString("utf8")`
 *   reproduces what a legacy consumer would see in `item.content`.
 */
function computeTranscriptItems(body: string, skillNames: string[]): ComputedTranscriptItem[] {
  if (body.length === 0) return [];
  const lowerSkillNames = skillNames.map((name) => name.toLowerCase()).filter((name) => name.length > 0);
  // Split by the same rule as `deriveTranscriptItems`. Track each chunk's
  // start position in the original string so we can convert to UTF-8 byte
  // offsets in one pass below.
  const chunks: Array<{ start: number; text: string }> = [];
  const splitRe = /\n(?=[A-Za-z_][\w-]*:)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = splitRe.exec(body))) {
    chunks.push({ start: cursor, text: body.slice(cursor, match.index) });
    cursor = match.index + 1; // skip the matched newline
  }
  chunks.push({ start: cursor, text: body.slice(cursor) });

  const items: ComputedTranscriptItem[] = [];
  let displayIndex = 0;
  for (const chunk of chunks) {
    const parsed = chunk.text.match(/^([A-Za-z_][\w-]*):(\s*)([\s\S]*)$/);
    let role: string;
    let contentStartChar: number;
    let contentText: string;
    if (parsed) {
      role = parsed[1]?.toLowerCase() ?? "message";
      const rolePrefixLen = (parsed[1]?.length ?? 0) + 1 + (parsed[2]?.length ?? 0); // role + ":" + whitespace
      contentStartChar = chunk.start + rolePrefixLen;
      contentText = parsed[3] ?? "";
    } else {
      role = "message";
      contentStartChar = chunk.start;
      contentText = chunk.text;
    }
    if (contentText.trim().length === 0) continue;
    displayIndex += 1;
    const contentOffset = Buffer.byteLength(body.slice(0, contentStartChar), "utf8");
    const contentLength = Buffer.byteLength(contentText, "utf8");
    const toolCount = (chunk.text.match(/\b(tool|tool_result|bash|read|write|edit|grep|web_search|bashExecution)\b/gi) ?? []).length;
    const lower = chunk.text.toLowerCase();
    const skillCount = lowerSkillNames.reduce((sum, skill) => sum + (lower.includes(skill) ? 1 : 0), 0);
    items.push({ index: displayIndex, role, contentOffset, contentLength, toolCount, skillCount });
  }
  return items;
}

function inferPurpose(title: string | null, body: string): string | null {
  if (title?.trim()) return title.trim();
  const userLine = body.split(/\r?\n/).find((line) => line.toLowerCase().startsWith("user:"));
  return userLine ? userLine.replace(/^user:\s*/i, "").slice(0, 240) : null;
}

function findLinkedSessions(db: SessionReviewDb, sessionId: string, body: string, currentPath: string): LinkedSession[] {
  const linked = new Map<string, LinkedSession>();
  const ids = extractSessionIds(body).slice(0, 20);
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const mentioned = db
      .prepare(`SELECT id AS sessionId, provider, title, started_at AS startedAt, path FROM sessions WHERE id IN (${placeholders}) AND id != ? LIMIT 50`)
      .all(...ids, sessionId) as Array<Omit<LinkedSession, "reason">>;
    for (const row of mentioned) linked.set(row.sessionId, { ...row, reason: "mentioned in transcript" });
  }

  const parent = findParentSession(db, sessionId, currentPath);
  if (parent) {
    const parentRow = db
      .prepare("SELECT id AS sessionId, provider, title, started_at AS startedAt, path FROM sessions WHERE id = ? LIMIT 1")
      .get(parent.sessionId) as Omit<LinkedSession, "reason"> | undefined;
    if (parentRow) linked.set(parentRow.sessionId, { ...parentRow, reason: "primary session for this subagent" });
  }

  for (const siblingRoot of siblingPathPrefixes(currentPath)) {
    const nearby = db
      .prepare("SELECT id AS sessionId, provider, title, started_at AS startedAt, path FROM sessions WHERE id != ? AND path LIKE ? ORDER BY started_at DESC LIMIT 25")
      .all(sessionId, `${siblingRoot}%`) as Array<Omit<LinkedSession, "reason">>;
    for (const row of nearby) if (!linked.has(row.sessionId)) linked.set(row.sessionId, { ...row, reason: "same delegated/subagent group" });
  }
  return [...linked.values()].slice(0, 50);
}

function siblingPathPrefixes(filePath: string): string[] {
  const prefixes = new Set<string>();
  const subagentsIndex = filePath.indexOf("/subagents/");
  if (subagentsIndex > 0) prefixes.add(filePath.slice(0, subagentsIndex + "/subagents/".length));

  const segments = filePath.split("/");
  const runIndex = segments.findIndex((part) => /^run-\d+$/.test(part));
  if (runIndex > 1) prefixes.add(`${segments.slice(0, runIndex - 1).join("/")}/`);
  return [...prefixes];
}

function extractSessionIds(body: string): string[] {
  return [...new Set([...body.matchAll(/\b(?:pi|claude|codex|cursor):[^\s)\]]+/g)].map((match) => match[0]))];
}

function sessionWhereClauses(filters: Omit<SessionFilters, "query" | "limit"> | SessionFilters, params: Record<string, string | number | null>): string[] {
  const clauses: string[] = [];
  if (filters.provider) {
    clauses.push("s.provider = @provider");
    params.provider = filters.provider;
  }
  if (filters.cwd) {
    clauses.push("s.cwd LIKE @cwd");
    params.cwd = `%${filters.cwd}%`;
  }
  if (filters.path) {
    clauses.push("s.path LIKE @path");
    params.path = `%${filters.path}%`;
  }
  if (filters.startDate) {
    clauses.push("s.started_at >= @startDate");
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    clauses.push("s.started_at <= @endDate");
    params.endDate = filters.endDate;
  }
  if (filters.batchMode === "exclude") clauses.push("s.is_batch = 0");
  if (filters.batchMode === "only") clauses.push("s.is_batch = 1");
  return clauses;
}
