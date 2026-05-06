import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
const piChatTimeoutMs = Number(process.env.SESSION_REVIEW_PI_CHAT_TIMEOUT_MS ?? "120000");

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
  if (url.pathname === "/api/pi/chat" && request.method === "POST") return chatWithPi(request, response);
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

type PiChatMessage = { role: "user" | "assistant"; content: string };
type PiChatPayload = {
  chatId?: string;
  message?: string;
  screen?: unknown;
  selectedItem?: unknown;
  files?: string[];
  history?: PiChatMessage[];
};

async function chatWithPi(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const payload = await readJsonBody<PiChatPayload>(request, 5 * 1024 * 1024);
  const message = payload.message?.trim();
  if (!message) return sendJson(response, 400, { error: "missing message" });

  const chatId = safeChatId(payload.chatId) || randomUUID().slice(0, 8);
  const turnId = randomUUID().slice(0, 8);
  const outDir = path.join(rootDir, "output", "pi-chat", chatId, turnId);
  const sessionDir = path.join(rootDir, "output", "pi-chat-sessions", chatId);
  await mkdir(outDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  const contextPath = path.join(outDir, "screen-context.json");
  const promptPath = path.join(outDir, "prompt.md");
  const appSourceFiles = sessionReviewSourceFiles();
  const files = uniqueFiles([...(payload.files ?? []), ...appSourceFiles]);
  const context = {
    chatId,
    generatedAt: new Date().toISOString(),
    screen: payload.screen ?? null,
    selectedItem: payload.selectedItem ?? null,
    history: (payload.history ?? []).slice(-12),
    files,
    note: "Pi receives this context file plus every file listed here as @file attachments, so it can inspect the full file contents loaded for the current screen.",
  };

  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  await writeFile(promptPath, piChatPrompt(message, contextPath), "utf8");
  const attachedFiles = uniqueFiles([contextPath, ...files]);
  const continued = await hasExistingPiSession(sessionDir);
  const result = await runPiPrint(promptPath, attachedFiles, sessionDir, continued);
  return sendJson(response, result.ok ? 200 : 500, { ...result, chatId, continued, sessionDir, contextPath, attachedFiles });
}

function sessionReviewSourceFiles(): string[] {
  return [
    path.join(rootDir, "src", "web", "client.ts"),
    path.join(rootDir, "src", "web", "index.html"),
    path.join(rootDir, "src", "server.ts"),
    path.join(rootDir, "src", "db.ts"),
  ];
}

function uniqueFiles(files: string[]): string[] {
  return [...new Set(files.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

function safeChatId(value: string | undefined): string | null {
  const safe = value?.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return safe || null;
}

async function hasExistingPiSession(sessionDir: string): Promise<boolean> {
  try {
    const entries = await readdir(sessionDir);
    return entries.some((entry) => entry.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

function piChatPrompt(message: string, contextPath: string): string {
  return `You are the embedded Pi chat assistant for the Session Review web app.

Answer the user's question using the attached @files as evidence. The first attached file is a JSON screen context bundle at:
${contextPath}

That context includes the active page/tab, visible results or session details, prior chat, and any selected page item. The remaining @files are the full contents of transcript/source files currently loaded for this screen.

User question:
${message}

Be concise. If the selected item matters, explicitly say what selected item you are using.`;
}

async function runPiPrint(promptPath: string, files: string[], sessionDir: string, continued: boolean): Promise<{ ok: boolean; reply: string; stderr: string; message: string }> {
  const prompt = await readFile(promptPath, "utf8");
  return new Promise((resolve) => {
    const args = ["--print", "--thinking", "xhigh", "--session-dir", sessionDir, ...(continued ? ["--continue"] : []), "--tools", "read,grep,find,ls", ...files.map((file) => `@${file}`), prompt];
    const child = spawn(piBin, args, { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, reply: "", stderr: Buffer.concat(stderr).toString("utf8"), message: `Pi timed out after ${piChatTimeoutMs}ms.` });
    }, piChatTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, reply: "", stderr: String(error), message: "Failed to start Pi." });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const reply = Buffer.concat(stdout).toString("utf8").trim();
      const err = Buffer.concat(stderr).toString("utf8").trim();
      resolve({ ok: code === 0, reply, stderr: err, message: code === 0 ? "Pi answered." : `Pi exited with code ${code}.` });
    });
  });
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
