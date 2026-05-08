import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDb = path.resolve(here, "..", "fixtures", "sessions.sqlite");
process.env.SESSION_REVIEW_DB = fixtureDb;

const { getDb } = await import("../../lib/db.js");
const { searchFilteredSessions } = await import("../../../../src/db.js");
const { parseSearchFilters } = await import("../../lib/search.js");

const baseFilters = {
  provider: null,
  cwd: null,
  path: null,
  startDate: null,
  endDate: null,
  batchMode: "include" as const,
};

function isMonotonic(values: Array<string | number | null>, dir: "asc" | "desc"): boolean {
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === null || curr === null) continue;
    if (dir === "asc" && (curr as number | string) < (prev as number | string)) return false;
    if (dir === "desc" && (curr as number | string) > (prev as number | string)) return false;
  }
  return true;
}

test("sort=runtime dir=asc orders rows by startedAt ascending", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    sort: "runtime",
    dir: "asc",
    limit: 50,
  });
  assert.ok(rows.length > 1, "fixture should have multiple sessions");
  const startedAt = rows.map((row) => row.startedAt);
  assert.ok(isMonotonic(startedAt, "asc"), `startedAt should be non-decreasing, got: ${startedAt.join(", ")}`);
});

test("sort=runtime dir=desc orders rows by startedAt descending", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    sort: "runtime",
    dir: "desc",
    limit: 50,
  });
  assert.ok(rows.length > 1);
  const startedAt = rows.map((row) => row.startedAt);
  assert.ok(isMonotonic(startedAt, "desc"), `startedAt should be non-increasing, got: ${startedAt.join(", ")}`);
});

test("sort=activity dir=desc orders rows by tokenEstimate descending", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    sort: "activity",
    dir: "desc",
    limit: 50,
  });
  assert.ok(rows.length > 1);
  const tokens = rows.map((row) => row.tokenEstimate);
  assert.ok(isMonotonic(tokens, "desc"), `tokenEstimate should be non-increasing, got: ${tokens.join(", ")}`);
});

test("sort=activity dir=asc orders rows by tokenEstimate ascending", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    sort: "activity",
    dir: "asc",
    limit: 50,
  });
  assert.ok(rows.length > 1);
  const tokens = rows.map((row) => row.tokenEstimate);
  assert.ok(isMonotonic(tokens, "asc"), `tokenEstimate should be non-decreasing, got: ${tokens.join(", ")}`);
});

test("sort=match dir=desc orders query rows by matchScore descending (best first)", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: "rebuild",
    sort: "match",
    dir: "desc",
    limit: 25,
  });
  assert.ok(rows.length > 1, "expected multiple matches for 'rebuild'");
  const scores = rows.map((row) => row.matchScore);
  assert.ok(isMonotonic(scores, "desc"), `matchScore should be non-increasing, got: ${scores.join(", ")}`);
  // Top row should be the best match (matchScore = 1).
  assert.equal(scores[0], 1);
});

test("sort=match dir=asc orders query rows by matchScore ascending (worst first)", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: "rebuild",
    sort: "match",
    dir: "asc",
    limit: 25,
  });
  assert.ok(rows.length > 1);
  const scores = rows.map((row) => row.matchScore);
  assert.ok(isMonotonic(scores, "asc"), `matchScore should be non-decreasing, got: ${scores.join(", ")}`);
});

test("sort=match with no query falls back to default order (does not error)", () => {
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    sort: "match",
    dir: "desc",
    limit: 25,
  });
  // No-query branch defaults to startedAt DESC. sort=match with no rank to
  // sort by must not blow up; falling back keeps the page useful.
  assert.ok(rows.length > 0);
  const startedAt = rows.map((row) => row.startedAt);
  assert.ok(isMonotonic(startedAt, "desc"), "fallback should keep started_at DESC ordering");
});

test("default behavior (no sort) preserves existing order", () => {
  // Without sort, no-query branch is started_at DESC (existing T08 behavior).
  const rows = searchFilteredSessions(getDb(), {
    ...baseFilters,
    query: null,
    limit: 25,
  });
  assert.ok(rows.length > 1);
  const startedAt = rows.map((row) => row.startedAt);
  assert.ok(isMonotonic(startedAt, "desc"), "existing default must remain started_at DESC");
});

test("parseSearchFilters reads sort and dir from query string", () => {
  const params = new URLSearchParams("sort=activity&dir=asc&query=foo");
  const filters = parseSearchFilters(params);
  assert.equal(filters.sort, "activity");
  assert.equal(filters.dir, "asc");
});

test("parseSearchFilters rejects unknown sort and dir values", () => {
  const params = new URLSearchParams("sort=lol&dir=sideways");
  const filters = parseSearchFilters(params);
  assert.equal(filters.sort, null);
  assert.equal(filters.dir, null);
});

test("parseSearchFilters defaults sort/dir to null when omitted", () => {
  const params = new URLSearchParams("query=foo");
  const filters = parseSearchFilters(params);
  assert.equal(filters.sort, null);
  assert.equal(filters.dir, null);
});
