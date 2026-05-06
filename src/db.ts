import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { classifyBatchSession, extractExtensionUsageSignals, extractUsageSignals, type BatchMode, type TimeBucket, type UsageKind } from "./analytics.js";
import { bucketDate } from "./analytics.js";
import type { IngestSummary, ProviderId, SearchResult, SessionDocument } from "./types.js";

export type SessionReviewDb = Database.Database;

export interface SessionFilters {
  provider: ProviderId | null;
  query: string | null;
  cwd: string | null;
  path: string | null;
  startDate: string | null;
  endDate: string | null;
  batchMode: BatchMode;
  limit: number;
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

type RawSearchResult = Omit<SearchResult, "isBatch" | "isSubagent" | "parentSessionId" | "parentTitle" | "groupKey" | "groupLabel" | "groupReason"> & { isBatch: number };

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
  `);
  ensureColumn(db, "sessions", "is_batch", "INTEGER NOT NULL DEFAULT 0");
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
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO sessions (id, provider, path, title, started_at, cwd, mtime_ms, size_bytes, indexed_at, is_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider = excluded.provider,
        path = excluded.path,
        title = excluded.title,
        started_at = excluded.started_at,
        cwd = excluded.cwd,
        mtime_ms = excluded.mtime_ms,
        size_bytes = excluded.size_bytes,
        indexed_at = excluded.indexed_at,
        is_batch = excluded.is_batch
    `).run(doc.sessionId, doc.provider, doc.path, doc.title, doc.startedAt, doc.cwd, doc.mtimeMs, doc.sizeBytes, new Date().toISOString(), isBatch);
    db.prepare("DELETE FROM sessions_fts WHERE session_id = ?").run(doc.sessionId);
    db.prepare("DELETE FROM usage_signals WHERE session_id = ?").run(doc.sessionId);
    db.prepare("DELETE FROM extension_usage_signals WHERE session_id = ?").run(doc.sessionId);
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
        SELECT s.provider, s.id AS sessionId, s.title, s.started_at AS startedAt, s.cwd, s.path, s.is_batch AS isBatch, NULL AS snippet
        FROM sessions s
        ${sessionClauses.length ? `WHERE ${sessionClauses.join(" AND ")}` : ""}
        ORDER BY s.started_at DESC
        LIMIT @limit
      `)
      .all(params) as RawSearchResult[];
    return enrichSearchResults(db, rows);
  }

  params.query = filters.query;
  // Limit FTS matches before computing snippets. On large transcript stores,
  // snippet() across every match can make the UI look hung.
  const rows = db
    .prepare(`
      WITH matched AS (
        SELECT rowid, session_id, rank
        FROM sessions_fts
        WHERE sessions_fts MATCH @query
        ORDER BY rank
        LIMIT @limit
      )
      SELECT s.provider, s.id AS sessionId, s.title, s.started_at AS startedAt, s.cwd, s.path, s.is_batch AS isBatch,
             snippet(sessions_fts, 4, '[', ']', ' … ', 24) AS snippet
      FROM matched
      JOIN sessions_fts ON sessions_fts.rowid = matched.rowid
      JOIN sessions s ON s.id = matched.session_id
      ${sessionClauses.length ? `WHERE ${sessionClauses.join(" AND ")}` : ""}
      ORDER BY matched.rank
    `)
    .all(params) as RawSearchResult[];
  return enrichSearchResults(db, rows);
}

function enrichSearchResults(db: SessionReviewDb, rows: RawSearchResult[]): SearchResult[] {
  return rows.map((row) => {
    const parent = inferParentInfo(db, row);
    return {
      provider: row.provider,
      sessionId: row.sessionId,
      title: row.title,
      startedAt: row.startedAt,
      cwd: row.cwd,
      path: row.path,
      snippet: row.snippet,
      isBatch: row.isBatch === 1,
      ...parent,
    };
  });
}

function inferParentInfo(db: SessionReviewDb, row: RawSearchResult | { sessionId: string; provider: ProviderId | string; title: string | null; path: string }): ParentInfo {
  const parent = findParentSession(db, row.sessionId, row.path);
  if (parent) {
    return {
      isSubagent: true,
      parentSessionId: parent.sessionId,
      parentTitle: parent.title,
      groupKey: `primary:${parent.sessionId}`,
      groupLabel: parent.title?.trim() ? `Primary: ${parent.title.trim()}` : `Primary session ${shortId(parent.sessionId)}`,
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
    for (const row of rows) {
      const isBatch = classifyBatchSession({ provider: row.provider, path: row.path, title: row.title, cwd: row.cwd, body: row.body }) ? 1 : 0;
      updateSession.run(isBatch, row.sessionId);
      deleteSignals.run(row.sessionId);
      for (const signal of extractUsageSignals(row.body)) insertSignal.run(row.sessionId, signal.kind, signal.name, signal.count);
    }
  });
  tx();
  return rows.length;
}

export function sessionDetails(db: SessionReviewDb, sessionId: string): SessionDetails | null {
  const row = db
    .prepare(`
      SELECT s.id AS sessionId, s.provider, s.title, s.started_at AS startedAt, s.cwd, s.path,
             s.indexed_at AS indexedAt, s.is_batch AS isBatch, f.body
      FROM sessions s
      LEFT JOIN sessions_fts f ON f.session_id = s.id
      WHERE s.id = ?
    `)
    .get(sessionId) as ({ sessionId: string; provider: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; indexedAt: string; isBatch: number; body: string | null } | undefined);
  if (!row) return null;
  const usage = db
    .prepare(`
      SELECT kind, name, count, 1 AS sessions
      FROM usage_signals
      WHERE session_id = ?
      ORDER BY count DESC, name ASC
    `)
    .all(sessionId) as UsageSummaryRow[];
  const body = row.body ?? "";
  const transcript = deriveTranscriptItems(body, usage);
  const turns = transcript.map(({ index, role, toolCount, skillCount }) => ({ index, role, toolCount, skillCount }));
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
    purpose: inferPurpose(row.title, body),
    bodyPreview: body.slice(0, 20_000),
    turnCount: turns.length,
    toolUseCount,
    skillUseCount,
    turns,
    transcript,
    usage,
    linkedSessions: findLinkedSessions(db, row.sessionId, body, row.path),
  };
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
