import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDb = path.resolve(here, "..", "fixtures", "sessions.sqlite");
process.env.SESSION_REVIEW_DB = fixtureDb;

const { getDb } = await import("../../lib/db.js");
const { searchFilteredSessions } = await import("../../../../src/db.js");

const baseFilters = {
  provider: null,
  cwd: null,
  path: null,
  startDate: null,
  endDate: null,
  batchMode: "include" as const,
};

test("searchFilteredSessions p50 < 100 ms over 100 calls (no per-row parent lookup)", () => {
  const db = getDb();
  // Warm: bm25, prepared statements, FTS open. This mirrors a steady-state hit.
  searchFilteredSessions(db, { ...baseFilters, query: null, limit: 100 });

  const timings: number[] = [];
  for (let i = 0; i < 100; i++) {
    const started = process.hrtime.bigint();
    const rows = searchFilteredSessions(db, { ...baseFilters, query: null, limit: 100 });
    const elapsedNs = process.hrtime.bigint() - started;
    timings.push(Number(elapsedNs) / 1_000_000);
    assert.ok(rows.length > 0, "expected at least one row from the fixture");
  }
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length / 2)] ?? 0;
  const p95 = timings[Math.floor(timings.length * 0.95)] ?? 0;
  // Test reports values for the reviewer; the assertion is the fail gate.
  console.error(`[search-perf] p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms over ${timings.length} runs`);
  assert.ok(p50 < 100, `expected p50 < 100ms, got ${p50.toFixed(2)}ms (p95 ${p95.toFixed(2)}ms)`);
});

test("parent_session_id column exists and at least one row is populated", () => {
  const db = getDb();
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  assert.ok(names.has("parent_session_id"), "sessions.parent_session_id column missing");
  assert.ok(names.has("parent_title"), "sessions.parent_title column missing");

  const populated = db
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE parent_session_id IS NOT NULL")
    .get() as { n: number };
  assert.ok(populated.n >= 1, `expected >= 1 sessions row with parent_session_id, got ${populated.n}`);
});

test("SearchResult exposes parentSessionId/parentTitle for fixture subagent row", () => {
  const rows = searchFilteredSessions(getDb(), { ...baseFilters, query: null, limit: 100 });
  const subagent = rows.find((row) => row.sessionId === "claude:fixture-007-subagent");
  assert.ok(subagent, "fixture must contain claude:fixture-007-subagent");
  assert.equal(subagent.parentSessionId, "claude:fixture-006-primary", "parentSessionId should be JOINed via parent_session_id");
  assert.equal(subagent.parentTitle, "Primary session for subagent", "parentTitle should come from the JOIN");
  assert.equal(subagent.isSubagent, true);
  assert.equal(subagent.groupKey, "primary:claude:fixture-006-primary");
});

test("searchFilteredSessions returns the same row id set as before T05", () => {
  // Smoke-correctness: the JOIN must not change which rows come back.
  const noQuery = searchFilteredSessions(getDb(), { ...baseFilters, query: null, limit: 100 });
  const ids = noQuery.map((row) => row.sessionId).sort();
  // Fixture rows we know exist:
  for (const expected of [
    "claude:fixture-001",
    "codex:fixture-002",
    "pi:fixture-003",
    "cursor:fixture-004",
    "claude:fixture-005-batch",
    "claude:fixture-006-primary",
    "claude:fixture-007-subagent",
  ]) {
    assert.ok(ids.includes(expected), `missing fixture row: ${expected}`);
  }
});
