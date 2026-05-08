// Deterministic builder for the integration-test fixture DB.
// Produces apps/web/tests/fixtures/sessions.sqlite with a small,
// representative set of sessions, FTS rows, and usage_signals.
//
// Each session's `path` points at a real on-disk transcript file under
// apps/web/tests/fixtures/transcripts/<provider>/<id>.jsonl. The file
// content is the raw `body` we pass to upsertSession, byte-for-byte —
// `transcript_items.content_offset/length` slices into that buffer.
//
// Run: npm run fixture:build

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, upsertSession } from "../../../../src/db.js";
import type { SessionDocument } from "../../../../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, "sessions.sqlite");
const transcriptsDir = path.resolve(here, "transcripts");

// Always rebuild from scratch so the fixture stays deterministic.
for (const suffix of ["", "-wal", "-shm"]) {
  try {
    rmSync(`${fixturePath}${suffix}`);
  } catch {
    // file did not exist — fine
  }
}
rmSync(transcriptsDir, { recursive: true, force: true });
mkdirSync(transcriptsDir, { recursive: true });

const db = openDb(fixturePath);

const baseTime = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00Z

function writeTranscript(provider: string, id: string, body: string): string {
  const safeId = id.replace(/[^A-Za-z0-9._-]/g, "_");
  const dir = path.join(transcriptsDir, provider);
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${safeId}.jsonl`);
  writeFileSync(target, body, "utf8");
  return target;
}

function buildPerfBody(turns: number): string {
  // Synthesize a deterministic ~200-turn transcript that exercises the
  // role-prefix split and tool/skill counters. Each turn is a small,
  // varied block so the regex split actually has work to do.
  const lines: string[] = [];
  for (let index = 0; index < turns; index++) {
    if (index % 4 === 0) {
      lines.push(`user: rebuild lane ${index} — kick off the next workstream`);
    } else if (index % 4 === 1) {
      lines.push(`assistant: planning lane ${index}; routing to subagents`);
    } else if (index % 4 === 2) {
      lines.push(`tool: bash run lane-${index} && tool: read lane-${index}.log`);
    } else {
      lines.push(`tool_result: lane ${index} done; grill-me confirms scope`);
    }
  }
  return lines.join("\n");
}

type FixtureSpec = Omit<SessionDocument, "path"> & { provider: SessionDocument["provider"] };

const fixtureSpecs: FixtureSpec[] = [
  {
    provider: "claude",
    sessionId: "claude:fixture-001",
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
  {
    // Perf fixture for T06: 200-turn transcript backed by a real on-disk file.
    provider: "claude",
    sessionId: "claude:fixture-perf-200",
    title: "T06 perf fixture",
    startedAt: new Date(baseTime + 5 * 60 * 60 * 1000).toISOString(),
    cwd: "/Users/alex/Personal/Projects/session-review",
    body: buildPerfBody(200),
    mtimeMs: baseTime + 5 * 60 * 60 * 1000,
    sizeBytes: 32_768,
  },
];

const sessions: SessionDocument[] = fixtureSpecs.map((spec) => ({
  ...spec,
  path: writeTranscript(spec.provider, spec.sessionId, spec.body),
}));

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
  transcript: (db.prepare("SELECT COUNT(*) AS n FROM transcript_items").get() as { n: number }).n,
};

db.close();

console.log(`fixture built at ${fixturePath}`);
console.log(`  inserted: ${inserted}`);
console.log(`  sessions row count: ${counts.sessions}`);
console.log(`  sessions_fts row count: ${counts.fts}`);
console.log(`  usage_signals row count: ${counts.usage}`);
console.log(`  transcript_items row count: ${counts.transcript}`);
