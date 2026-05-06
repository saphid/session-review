import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterOptions, openDb, searchFilteredSessions, sessionDetails, usageSummary, usageTimeline } from "./db.js";
import type { BatchMode, TimeBucket, UsageKind } from "./analytics.js";
import type { ProviderId } from "./types.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultDb = path.join(process.env.HOME ?? ".", ".local", "share", "session-review", "sessions.sqlite");
const db = openDb(process.env.SESSION_REVIEW_DB ?? defaultDb);
const port = Number(process.env.PORT ?? "8765");
const piBin = process.env.SESSION_REVIEW_PI_BIN?.trim() || "pi";
const ghosttyBin = process.env.SESSION_REVIEW_GHOSTTY_BIN?.trim() || "/Applications/cmux.app/Contents/Resources/bin/ghostty";
const ghosttyApp = process.env.SESSION_REVIEW_GHOSTTY_APP?.trim() || "/Applications/cmux.app";

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
  if (url.pathname === "/api/pi/launch" && request.method === "POST") return launchPiSidebar(request, response);
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

type PiLaunchPayload = {
  message?: string;
  screen?: unknown;
  files?: string[];
};

async function launchPiSidebar(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const payload = await readJsonBody<PiLaunchPayload>(request, 5 * 1024 * 1024);
  const id = randomUUID().slice(0, 8);
  const outDir = path.join(rootDir, "output", "pi-sidebar", id);
  await mkdir(outDir, { recursive: true });
  const contextPath = path.join(outDir, "screen-context.json");
  const promptPath = path.join(outDir, "prompt.md");
  const scriptPath = path.join(outDir, "run-pi.sh");
  const files = [...new Set((payload.files ?? []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
  const message = payload.message?.trim() || "Help me understand the current Session Review screen.";
  const context = {
    generatedAt: new Date().toISOString(),
    screen: payload.screen ?? null,
    files,
    appSourceFiles: [
      path.join(rootDir, "src", "web", "client.ts"),
      path.join(rootDir, "src", "web", "index.html"),
      path.join(rootDir, "src", "server.ts"),
      path.join(rootDir, "src", "db.ts"),
    ],
  };
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  await writeFile(promptPath, piPrompt(message, contextPath, files), "utf8");
  await writeFile(scriptPath, `#!/usr/bin/env bash\nset -euo pipefail\ncd ${shellQuote(rootDir)}\nexec ${shellQuote(piBin)} "$(cat ${shellQuote(promptPath)})"\n`, "utf8");
  await chmod(scriptPath, 0o755);

  const launched = launchGhostty(scriptPath);
  return sendJson(response, launched.ok ? 200 : 500, {
    ok: launched.ok,
    message: launched.message,
    contextPath,
    promptPath,
    files,
  });
}

function piPrompt(message: string, contextPath: string, files: string[]): string {
  return `You are a Pi sidebar agent launched from the Session Review web app.\n\nUser request:\n${message}\n\nCurrent screen context is saved at:\n${contextPath}\n\nStart by reading that JSON file. It contains the current tab, filters, visible search results or session details, and file paths related to what was on screen.\n\nRelevant files from the screen:\n${files.length ? files.map((file) => `- ${file}`).join("\n") : "- None captured"}\n\nUse the listed files as evidence. If you need implementation context for the web app itself, also inspect the appSourceFiles listed in the context JSON.`;
}

function launchGhostty(scriptPath: string): { ok: boolean; message: string } {
  const args = ["-e", "/bin/bash", scriptPath];
  if (os.platform() === "darwin" && existsSync(ghosttyApp)) {
    spawn("open", ["-na", ghosttyApp, "--args", ...args], { detached: true, stdio: "ignore" }).unref();
    return { ok: true, message: `Opened ${path.basename(ghosttyApp)} with Pi TUI.` };
  }
  if (existsSync(ghosttyBin)) {
    spawn(ghosttyBin, args, { detached: true, stdio: "ignore" }).unref();
    return { ok: true, message: "Opened Ghostty with Pi TUI." };
  }
  return { ok: false, message: `Ghostty was not found. Set SESSION_REVIEW_GHOSTTY_APP or SESSION_REVIEW_GHOSTTY_BIN.` };
}

async function readJsonBody<T>(request: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
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
