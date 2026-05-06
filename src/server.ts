import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterOptions, openDb, searchFilteredSessions, sessionDetails, usageSummary, usageTimeline } from "./db.js";
import type { BatchMode, TimeBucket, UsageKind } from "./analytics.js";
import type { ProviderId } from "./types.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultDb = path.join(process.env.HOME ?? ".", ".local", "share", "session-review", "sessions.sqlite");
const db = openDb(process.env.SESSION_REVIEW_DB ?? defaultDb);
const port = Number(process.env.PORT ?? "8765");

createServer((request, response) => {
  void route(request, response).catch((error: unknown) => sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) }));
}).listen(port, () => {
  console.log(`session-review app listening on http://localhost:${port}`);
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/" || url.pathname.startsWith("/session/")) return sendFile(response, path.join(rootDir, "src", "web", "index.html"), "text/html");
  if (url.pathname === "/client.js") return sendFile(response, path.join(rootDir, "dist", "web", "client.js"), "text/javascript");
  if (url.pathname === "/vendor/chart.js") return sendFile(response, path.join(rootDir, "node_modules", "chart.js", "dist", "chart.umd.js"), "text/javascript");
  if (url.pathname === "/vendor/highlight.js") return sendFile(response, path.join(rootDir, "node_modules", "@highlightjs", "cdn-assets", "highlight.min.js"), "text/javascript");
  if (url.pathname === "/vendor/highlight.css") return sendFile(response, path.join(rootDir, "node_modules", "@highlightjs", "cdn-assets", "styles", "github-dark.min.css"), "text/css");
  if (url.pathname === "/api/filters") return sendJson(response, 200, filterOptions(db));
  if (url.pathname === "/api/session") {
    const id = url.searchParams.get("id");
    if (!id) return sendJson(response, 400, { error: "missing id" });
    const details = sessionDetails(db, id);
    return details ? sendJson(response, 200, details) : sendJson(response, 404, { error: "session not found" });
  }
  if (url.pathname === "/api/search") {
    return sendJson(response, 200, searchFilteredSessions(db, {
      provider: parseProvider(url.searchParams.get("provider")),
      query: emptyToNull(url.searchParams.get("query")),
      cwd: emptyToNull(url.searchParams.get("cwd")),
      path: emptyToNull(url.searchParams.get("path")),
      startDate: emptyToNull(url.searchParams.get("startDate")),
      endDate: emptyToNull(url.searchParams.get("endDate")),
      batchMode: parseBatchMode(url.searchParams.get("batchMode")),
      limit: Number(url.searchParams.get("limit") ?? "100"),
    }));
  }
  if (url.pathname === "/api/usage") {
    const kind = parseUsageKind(url.searchParams.get("kind"));
    const filters = {
      provider: parseProvider(url.searchParams.get("provider")),
      cwd: emptyToNull(url.searchParams.get("cwd")),
      path: emptyToNull(url.searchParams.get("path")),
      startDate: emptyToNull(url.searchParams.get("startDate")),
      endDate: emptyToNull(url.searchParams.get("endDate")),
      batchMode: parseBatchMode(url.searchParams.get("batchMode")),
    };
    return sendJson(response, 200, {
      summary: usageSummary(db, kind, filters),
      timeline: usageTimeline(db, kind, parseTimeBucket(url.searchParams.get("bucket")), filters),
    });
  }
  sendJson(response, 404, { error: "not found" });
}

async function sendFile(response: ServerResponse, filePath: string, contentType: string): Promise<void> {
  const body = await readFile(filePath);
  response.writeHead(200, { "content-type": contentType });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function emptyToNull(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

function parseProvider(value: string | null): ProviderId | null {
  return value === "pi" || value === "claude" || value === "codex" || value === "cursor" ? value : null;
}

function parseUsageKind(value: string | null): UsageKind {
  return value === "skill" ? "skill" : "tool";
}

function parseBatchMode(value: string | null): BatchMode {
  return value === "exclude" || value === "only" ? value : "include";
}

function parseTimeBucket(value: string | null): TimeBucket {
  return value === "week" ? "week" : "day";
}
