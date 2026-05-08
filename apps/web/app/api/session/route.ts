import { readFile } from "node:fs/promises";
import { loadTranscriptItems, sessionHeader, transcriptOffsets } from "@core/db.js";
import type { TranscriptItem } from "@core/db.js";
import { getDb } from "../../../lib/db";

// better-sqlite3 must run on Node — Next's Edge runtime would refuse the binding.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a session detail as `application/x-ndjson`. The first line is the
 * header object (everything except `transcript`); subsequent lines are
 * `TranscriptItem` JSON, one per turn. The header chunk is emitted before
 * the transcript file is read so TTFB stays under 100 ms even on cold
 * caches; the body slices arrive as the file read completes.
 */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse(400, { error: "missing id" });

  const db = getDb();
  const header = sessionHeader(db, id);
  if (!header) return jsonResponse(404, { error: "session not found" });
  const offsets = transcriptOffsets(db, id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Header first so the client can render the stat strip immediately.
      controller.enqueue(encoder.encode(`${JSON.stringify(header)}\n`));

      const transcript = await resolveTranscript(db, id, header.path, offsets);

      for (const item of transcript) {
        controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function resolveTranscript(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  filePath: string,
  offsets: ReturnType<typeof transcriptOffsets>,
): Promise<TranscriptItem[]> {
  if (offsets.length === 0) return loadTranscriptItems(db, sessionId);
  try {
    const buffer = await readFile(filePath);
    return offsets.map((entry) => ({
      index: entry.index,
      role: entry.role ?? "message",
      content: buffer.subarray(entry.contentOffset, entry.contentOffset + entry.contentLength).toString("utf8"),
      toolCount: entry.toolCount,
      skillCount: entry.skillCount,
    }));
  } catch {
    // Source file missing or unreadable — fall through to the body
    // fallback so the API still returns content for un-migrated rows.
    return loadTranscriptItems(db, sessionId);
  }
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
