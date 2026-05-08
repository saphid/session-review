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

test("searchFilteredSessions populates matchScore in [0, 1] for query rows", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: "rebuild",
    limit: 25,
  });
  assert.ok(rows.length > 0, "expected at least one row for query 'rebuild'");
  for (const row of rows) {
    assert.equal(typeof row.matchScore, "number", `matchScore should be a number for ${row.sessionId}`);
    if (typeof row.matchScore === "number") {
      assert.ok(row.matchScore >= 0 && row.matchScore <= 1, `matchScore out of range for ${row.sessionId}: ${row.matchScore}`);
    }
  }
  // The best row of the set should be exactly 1 (best=1 normalization).
  const max = Math.max(...rows.map((row) => row.matchScore ?? -1));
  assert.equal(max, 1, "expected the top match to be 1.0");
  // The worst row should be 0 when at least 2 distinct ranks exist; otherwise all 1s.
  if (rows.length > 1) {
    const min = Math.min(...rows.map((row) => row.matchScore ?? Number.POSITIVE_INFINITY));
    assert.ok(min >= 0 && min <= 1, "min matchScore must remain in [0, 1]");
  }
});

test("searchFilteredSessions sets matchScore to null when no query is given", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    limit: 25,
  });
  assert.ok(rows.length > 0, "expected fixture rows for the no-query call");
  for (const row of rows) {
    assert.equal(row.matchScore, null, `expected matchScore=null on ${row.sessionId} when no query`);
  }
});

test("searchFilteredSessions exposes toolUseCount per row, sourced from usage_signals", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    limit: 25,
  });
  for (const row of rows) {
    assert.equal(typeof row.toolUseCount, "number", `toolUseCount should be a number on ${row.sessionId}`);
    assert.ok(row.toolUseCount >= 0, `toolUseCount must be non-negative on ${row.sessionId}`);
  }
  const withTools = rows.filter((row) => row.toolUseCount > 0);
  assert.ok(withTools.length > 0, "fixture must contain at least one row with toolUseCount > 0");
});

test("/api/search route handler returns rows with matchScore and toolUseCount", async () => {
  const mod = await import("../../app/api/search/route.js");
  const url = new URL("http://localhost/api/search?query=rebuild&limit=10");
  const response = await mod.GET(new Request(url));
  assert.equal(response.status, 200);
  const body = (await response.json()) as Array<{ matchScore: number | null; toolUseCount: number }>;
  assert.ok(Array.isArray(body), "response body should be an array");
  assert.ok(body.length > 0, "expected at least one result for query 'rebuild'");
  for (const row of body) {
    assert.equal(typeof row.toolUseCount, "number");
    assert.ok(row.toolUseCount >= 0);
    assert.equal(typeof row.matchScore, "number");
    if (typeof row.matchScore === "number") {
      assert.ok(row.matchScore >= 0 && row.matchScore <= 1);
    }
  }
});

test("/api/search route handler returns matchScore=null when no query is provided", async () => {
  const mod = await import("../../app/api/search/route.js");
  const url = new URL("http://localhost/api/search?limit=5");
  const response = await mod.GET(new Request(url));
  assert.equal(response.status, 200);
  const body = (await response.json()) as Array<{ matchScore: number | null }>;
  assert.ok(body.length > 0, "expected at least one row with no query");
  for (const row of body) {
    assert.equal(row.matchScore, null);
  }
});
