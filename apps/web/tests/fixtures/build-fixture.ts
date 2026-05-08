// Deterministic builder for the integration-test fixture DB.
// Produces apps/web/tests/fixtures/sessions.sqlite with a small,
// representative set of sessions, FTS rows, and usage_signals.
//
// Run: npm run fixture:build

import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, upsertSession } from "../../../../src/db.js";
import type { SessionDocument } from "../../../../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, "sessions.sqlite");

// Always rebuild from scratch so the fixture stays deterministic.
for (const suffix of ["", "-wal", "-shm"]) {
  try {
    rmSync(`${fixturePath}${suffix}`);
  } catch {
    // file did not exist — fine
  }
}

const db = openDb(fixturePath);

const baseTime = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00Z

const sessions: SessionDocument[] = [
  {
    provider: "claude",
    sessionId: "claude:fixture-001",
    path: "/fixtures/claude/fixture-001.jsonl",
    title: "Plan the rebuild",
    startedAt: new Date(baseTime).toISOString(),
    cwd: "/Users/alex/Personal/Projects/session-review",
    body: [
      "user: lay out the rebuild plan",
      "assistant: drafting plan",
      "tool: read",
      "tool: edit",
      "tool_result: read",
      "skill grill-me check the requirements",
    ].join("\n"),
    mtimeMs: baseTime,
    sizeBytes: 4096,
  },
  {
    provider: "codex",
    sessionId: "codex:fixture-002",
    path: "/fixtures/codex/fixture-002.jsonl",
    title: "Codex sweep",
    startedAt: new Date(baseTime + 60 * 60 * 1000).toISOString(),
    cwd: "/Users/alex/Personal/Projects/session-review",
    body: [
      "user: refactor the search module",
      "assistant: applying patch",
      "tool: bash",
      "tool: bash",
      "tool: write",
      "intentional-prd suggests a tighter spec",
    ].join("\n"),
    mtimeMs: baseTime + 60 * 60 * 1000,
    sizeBytes: 8192,
  },
  {
    provider: "pi",
    sessionId: "pi:fixture-003",
    path: "/fixtures/pi/fixture-003.jsonl",
    title: "Pi triage",
    startedAt: new Date(baseTime + 2 * 60 * 60 * 1000).toISOString(),
    cwd: "/Users/alex/Personal/Projects/session-review",
    body: [
      "user: triage failing tests",
      "assistant: pulling logs",
      "tool: read",
      "tool: grep",
      "ai-tdd helps frame the next failing test",
    ].join("\n"),
    mtimeMs: baseTime + 2 * 60 * 60 * 1000,
    sizeBytes: 2048,
  },
  {
    provider: "cursor",
    sessionId: "cursor:fixture-004",
    path: "/fixtures/cursor/fixture-004.jsonl",
    title: "Cursor scratchpad",
    startedAt: new Date(baseTime + 3 * 60 * 60 * 1000).toISOString(),
    cwd: "/Users/alex/Personal/Projects/other-project",
    body: [
      "user: rename the helper",
      "assistant: doing it now",
      "tool: edit",
      "tool: write",
    ].join("\n"),
    mtimeMs: baseTime + 3 * 60 * 60 * 1000,
    sizeBytes: 1024,
  },
  {
    provider: "claude",
    sessionId: "claude:fixture-005-batch",
    path: "/fixtures/claude/orch/run-1/fixture-005.jsonl",
    title: "Batch orchestrator run",
    startedAt: new Date(baseTime + 4 * 60 * 60 * 1000).toISOString(),
    cwd: "/Users/alex/Personal/Projects/session-review",
    body: [
      "user: dispatch the lane workers",
      "assistant: lane-1 lane-2 lane-3 spawned",
      "tool: bash",
      "tool: read",
      "tool: edit",
      "subagent-review-hygiene confirms each lane reported",
    ].join("\n"),
    mtimeMs: baseTime + 4 * 60 * 60 * 1000,
    sizeBytes: 16_384,
  },
];

let inserted = 0;
for (const doc of sessions) {
  if (upsertSession(db, doc)) inserted++;
}

// Freeze ingested_at so the committed fixture is byte-deterministic across rebuilds.
// upsertSession writes `new Date().toISOString()` per insert, which would otherwise drift.
const FROZEN_INGESTED_AT = "2026-05-08T00:00:00.000Z";
db.prepare("UPDATE sessions SET indexed_at = ?").run(FROZEN_INGESTED_AT);

const counts = {
  sessions: (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n,
  fts: (db.prepare("SELECT COUNT(*) AS n FROM sessions_fts").get() as { n: number }).n,
  usage: (db.prepare("SELECT COUNT(*) AS n FROM usage_signals").get() as { n: number }).n,
};

db.close();

console.log(`fixture built at ${fixturePath}`);
console.log(`  inserted: ${inserted}`);
console.log(`  sessions row count: ${counts.sessions}`);
console.log(`  sessions_fts row count: ${counts.fts}`);
console.log(`  usage_signals row count: ${counts.usage}`);
