import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDb = path.resolve(here, "..", "fixtures", "sessions.sqlite");
process.env.SESSION_REVIEW_DB = fixtureDb;

const { getDb } = await import("../../lib/db.js");

test("getDb opens the configured database and exposes session rows", () => {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
  assert.equal(typeof row.n, "number");
  assert.ok(row.n > 0, `expected at least one session in fixture, got ${row.n}`);
});

test("getDb returns the same cached instance per process", () => {
  const a = getDb();
  const b = getDb();
  assert.strictEqual(a, b);
});
