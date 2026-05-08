import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDb = path.resolve(here, "..", "fixtures", "sessions.sqlite");
process.env.SESSION_REVIEW_DB = fixtureDb;

const { getDb } = await import("../../lib/db.js");
const { sessionDetails } = await import("../../../../src/db.js");

const PERF_FIXTURE_ID = "claude:fixture-perf-200";

interface TranscriptItem {
  index: number;
  role: string;
  content: string;
  toolCount: number;
  skillCount: number;
}

interface SessionHeader {
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
  turns: Array<{ index: number; role: string; toolCount: number; skillCount: number }>;
  usage: Array<{ kind: string; name: string; count: number; sessions: number }>;
  linkedSessions: unknown[];
}

test("sessionDetails reads transcript content from disk via sessions.path", () => {
  const details = sessionDetails(getDb(), PERF_FIXTURE_ID);
  assert.ok(details, "perf fixture session must exist");
  assert.ok(details!.transcript.length > 0, "transcript must have items");
  // Sanity: the transcript item content should appear in the source file.
  const fileBytes = readFileSync(details!.path);
  const fileText = fileBytes.toString("utf8");
  for (const item of details!.transcript.slice(0, 5)) {
    assert.ok(
      fileText.includes(item.content.slice(0, Math.min(item.content.length, 64))),
      `transcript item ${item.index} content not found in source file`,
    );
  }
});

test("/api/session route returns header chunk within 100 ms (TTFB) and full body within 1 s", async () => {
  const mod = await import("../../app/api/session/route.js");
  const url = new URL(`http://localhost/api/session?id=${encodeURIComponent(PERF_FIXTURE_ID)}`);

  const startedAt = process.hrtime.bigint();
  const response = await mod.GET(new Request(url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  assert.ok(response.body, "response must have a streaming body");

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let header: SessionHeader | null = null;
  let ttfbMs: number | null = null;
  const items: TranscriptItem[] = [];

  // Read the first chunk; expect the header line within 100 ms TTFB.
  while (header === null) {
    const { value, done } = await reader.read();
    if (ttfbMs === null && value) ttfbMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const newlineIdx = buffer.indexOf("\n");
    if (newlineIdx >= 0) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      header = JSON.parse(line) as SessionHeader;
    }
  }

  assert.ok(header, "expected a header chunk");
  assert.ok(ttfbMs !== null && ttfbMs < 100, `TTFB must be under 100 ms (was ${ttfbMs?.toFixed(1)} ms)`);
  assert.equal(header!.sessionId, PERF_FIXTURE_ID);
  assert.ok(header!.turnCount >= 200, `expected >= 200 turns, got ${header!.turnCount}`);

  // Drain the rest. Each line is one TranscriptItem.
  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx >= 0) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.length > 0) items.push(JSON.parse(line) as TranscriptItem);
      newlineIdx = buffer.indexOf("\n");
    }
    if (done) break;
  }
  // Flush any trailing line without a newline.
  buffer += decoder.decode();
  if (buffer.trim().length > 0) items.push(JSON.parse(buffer) as TranscriptItem);

  const totalMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  assert.ok(totalMs < 1000, `full payload must complete under 1 s (was ${totalMs.toFixed(1)} ms)`);
  assert.ok(items.length >= 200, `expected >= 200 transcript items, got ${items.length}`);
  console.log(`[T06 perf] TTFB=${ttfbMs?.toFixed(2)}ms total=${totalMs.toFixed(2)}ms items=${items.length}`);

  // The streamed contents must match the on-disk source file slices.
  const onDisk = readFileSync(header!.path).toString("utf8");
  for (const item of items.slice(0, 10)) {
    assert.ok(
      onDisk.includes(item.content.slice(0, Math.min(item.content.length, 64))),
      `streamed transcript item ${item.index} content not found in source file`,
    );
  }
});

test("/api/session route returns 404 for an unknown session id", async () => {
  const mod = await import("../../app/api/session/route.js");
  const url = new URL("http://localhost/api/session?id=does-not-exist");
  const response = await mod.GET(new Request(url));
  assert.equal(response.status, 404);
});

test("/api/session route returns 400 when id is missing", async () => {
  const mod = await import("../../app/api/session/route.js");
  const url = new URL("http://localhost/api/session");
  const response = await mod.GET(new Request(url));
  assert.equal(response.status, 400);
});
