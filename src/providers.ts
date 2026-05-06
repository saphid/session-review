import { readFile } from "node:fs/promises";
import path from "node:path";
import { homePath, walkFiles } from "./fs.js";
import { contentText, fileMeta, firstTextLine, isoFromMtimeMs, maybeTimestamp, stableSessionId } from "./text.js";
import type { ProviderAdapter, ProviderId, SessionDocument } from "./types.js";

type MutableParsed = {
  sessionId: string;
  startedAt: string | null;
  cwd: string | null;
  title: string | null;
  parts: string[];
};

const jsonlProviders: ProviderId[] = ["pi", "claude", "codex"];

export function createAdapters(): Record<ProviderId, ProviderAdapter> {
  return {
    pi: jsonlAdapter(
      "pi",
      [homePath(".pi", "agent", "sessions"), homePath("Library", "Application Support", "pi", "transcripts")],
      parsePiObject,
    ),
    claude: jsonlAdapter(
      "claude",
      [homePath(".claude", "projects"), homePath("Library", "Application Support", "Claude", "local-agent-mode-sessions")],
      parseClaudeObject,
    ),
    codex: jsonlAdapter("codex", [homePath(".codex", "sessions")], parseCodexObject),
    cursor: cursorAdapter(),
  };
}

function jsonlAdapter(
  id: ProviderId,
  roots: string[],
  parseObject: (obj: unknown, state: MutableParsed) => void,
): ProviderAdapter {
  return {
    id,
    defaultRoots: () => roots,
    async *discover() {
      for (const root of roots) yield* walkFiles(root, [".jsonl", ".json"]);
    },
    async parse(filePath: string) {
      return path.extname(filePath).toLowerCase() === ".json"
        ? parseJsonFile(id, filePath, parseObject)
        : parseJsonl(id, filePath, parseObject);
    },
  };
}

function cursorAdapter(): ProviderAdapter {
  const roots = [
    ...(process.env.CURSOR_SESSION_ROOT ? [process.env.CURSOR_SESSION_ROOT] : []),
    homePath(".cursor", "session-review"),
    homePath(".cursor", "sessions"),
    homePath(".cursor", "projects"),
    homePath(".cursor", "plans"),
    homePath("Library", "Application Support", "Cursor", "User", "globalStorage", "kilocode.kilo-code", "tasks"),
  ];
  return {
    id: "cursor",
    defaultRoots: () => roots,
    async *discover() {
      for (const root of roots) yield* walkFiles(root, [".jsonl", ".json", ".md", ".txt"]);
    },
    async parse(filePath: string) {
      if (path.extname(filePath).toLowerCase() === ".jsonl") {
        return parseJsonl("cursor", filePath, parseGenericObject);
      }
      const { mtimeMs, sizeBytes } = await fileMeta(filePath);
      if (sizeBytes === 0 || sizeBytes > 50 * 1024 * 1024) return null;
      const body = await readFile(filePath, "utf8");
      if (!body.trim()) return null;
      return {
        provider: "cursor",
        path: filePath,
        sessionId: stableSessionId("cursor", path.basename(filePath), filePath),
        startedAt: isoFromMtimeMs(mtimeMs),
        cwd: null,
        title: firstTextLine(body),
        body,
        mtimeMs,
        sizeBytes,
      };
    },
  };
}

async function parseJsonFile(
  provider: ProviderId,
  filePath: string,
  parseObject: (obj: unknown, state: MutableParsed) => void,
): Promise<SessionDocument | null> {
  const { mtimeMs, sizeBytes } = await fileMeta(filePath);
  if (sizeBytes === 0 || sizeBytes > 50 * 1024 * 1024) return null;
  const raw = await readFile(filePath, "utf8");
  const state: MutableParsed = {
    sessionId: path.basename(filePath, ".json"),
    startedAt: null,
    cwd: null,
    title: null,
    parts: [],
  };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.transcript)) {
      for (const item of parsed.transcript) parseObject(item, state);
    } else if (Array.isArray(parsed)) {
      for (const item of parsed) parseObject(item, state);
    } else {
      parseObject(parsed, state);
      const fallback = contentText(parsed);
      if (!state.parts.length && fallback) state.parts.push(fallback);
    }
  } catch {
    const title = firstTextLine(raw);
    return {
      provider,
      path: filePath,
      sessionId: stableSessionId(provider, path.basename(filePath, ".json"), filePath),
      startedAt: isoFromMtimeMs(mtimeMs),
      cwd: null,
      title,
      body: raw,
      mtimeMs,
      sizeBytes,
    };
  }
  if (state.parts.length === 0) return null;
  return {
    provider,
    path: filePath,
    sessionId: stableSessionId(provider, state.sessionId, filePath),
    startedAt: state.startedAt ?? isoFromMtimeMs(mtimeMs),
    cwd: state.cwd,
    title: state.title,
    body: state.parts.join("\n"),
    mtimeMs,
    sizeBytes,
  };
}

async function parseJsonl(
  provider: ProviderId,
  filePath: string,
  parseObject: (obj: unknown, state: MutableParsed) => void,
): Promise<SessionDocument | null> {
  const { mtimeMs, sizeBytes } = await fileMeta(filePath);
  if (sizeBytes === 0 || sizeBytes > 50 * 1024 * 1024) return null;
  const raw = await readFile(filePath, "utf8");
  const state: MutableParsed = {
    sessionId: path.basename(filePath, ".jsonl"),
    startedAt: null,
    cwd: null,
    title: null,
    parts: [],
  };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      parseObject(JSON.parse(trimmed) as unknown, state);
    } catch {
      state.parts.push(trimmed);
    }
  }

  if (state.parts.length === 0) return null;
  return {
    provider,
    path: filePath,
    sessionId: stableSessionId(provider, state.sessionId, filePath),
    startedAt: state.startedAt ?? isoFromMtimeMs(mtimeMs),
    cwd: state.cwd,
    title: state.title,
    body: state.parts.join("\n"),
    mtimeMs,
    sizeBytes,
  };
}

function parsePiObject(obj: unknown, state: MutableParsed): void {
  if (!isRecord(obj)) return;
  if (obj.type === "session") {
    if (typeof obj.id === "string") state.sessionId = obj.id;
    state.startedAt ??= maybeTimestamp(obj.timestamp);
    if (typeof obj.cwd === "string") state.cwd ??= obj.cwd;
    return;
  }
  if (obj.summary && typeof obj.summary === "string") state.parts.push(`summary: ${obj.summary}`);
  if (typeof obj.customType === "string") {
    state.parts.push(`custom:${obj.customType} ${JSON.stringify((obj as { data?: unknown; content?: unknown }).data ?? (obj as { content?: unknown }).content ?? {})}`);
  }
  if (!isRecord(obj.message)) return;
  const role = typeof obj.message.role === "string" ? obj.message.role : "message";
  let text = contentText(obj.message.content);
  if (role === "bashExecution") text = `$ ${String(obj.message.command ?? "")}\n${String(obj.message.output ?? "")}`;
  if (text) pushPart(state, role, text);
}

function parseClaudeObject(obj: unknown, state: MutableParsed): void {
  if (!isRecord(obj)) return;
  if (typeof obj.sessionId === "string") state.sessionId = obj.sessionId;
  if (typeof obj.session_id === "string") state.sessionId = obj.session_id;
  state.startedAt ??= maybeTimestamp(obj.timestamp);
  if (typeof obj.cwd === "string") state.cwd ??= obj.cwd;
  const message = isRecord(obj.message) ? obj.message : obj;
  const role = typeof obj.type === "string" ? obj.type : typeof message.role === "string" ? message.role : "message";
  const text = contentText(message.content);
  if (text) pushPart(state, role, text);
}

function parseCodexObject(obj: unknown, state: MutableParsed): void {
  if (!isRecord(obj)) return;
  state.startedAt ??= maybeTimestamp(obj.timestamp);
  const payload = isRecord(obj.payload) ? obj.payload : {};
  if (obj.type === "session_meta") {
    if (typeof payload.id === "string") state.sessionId = payload.id;
    if (typeof payload.cwd === "string") state.cwd ??= payload.cwd;
  }
  const payloadType = typeof payload.type === "string" ? payload.type : null;
  if (payloadType === "user_message" && typeof payload.message === "string") pushPart(state, "user", payload.message);
  else if (payloadType === "agent_message" && typeof payload.message === "string") pushPart(state, "assistant", payload.message);
  else if (payloadType === "function_call" || payloadType === "custom_tool_call") {
    pushPart(state, "tool", `${String(payload.name ?? "")} ${String(payload.arguments ?? payload.input ?? "")}`);
  } else if (payloadType === "function_call_output" || payloadType === "custom_tool_call_output") {
    pushPart(state, "tool_result", String(payload.output ?? ""));
  } else if (isRecord(payload.item)) {
    const text = contentText(payload.item.content);
    if (text) pushPart(state, String(payload.item.role ?? "message"), text);
  }
}

function parseGenericObject(obj: unknown, state: MutableParsed): void {
  if (!isRecord(obj)) return;
  if (typeof obj.id === "string") state.sessionId = obj.id;
  if (typeof obj.sessionId === "string") state.sessionId = obj.sessionId;
  state.startedAt ??= maybeTimestamp(obj.timestamp) ?? maybeTimestamp(obj.createdAt);
  if (typeof obj.cwd === "string") state.cwd ??= obj.cwd;
  const text = contentText(obj.content) || contentText(obj.text) || contentText(obj.message);
  if (text) pushPart(state, String(obj.role ?? obj.type ?? "message"), text);
}

function pushPart(state: MutableParsed, role: string, text: string): void {
  state.parts.push(`${role}: ${text}`);
  state.title ??= text.slice(0, 120);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function allProviderIds(): ProviderId[] {
  return [...jsonlProviders, "cursor"];
}
