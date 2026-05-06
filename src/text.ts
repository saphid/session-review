import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

export function stableSessionId(provider: string, sourceId: string, filePath: string): string {
  const hash = createHash("sha256").update(filePath).digest("hex").slice(0, 12);
  const safeSource = sourceId.replaceAll("/", "_").slice(0, 160) || path.basename(filePath);
  return `${provider}:${safeSource}:${hash}`;
}

export function firstTextLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 120);
  }
  return null;
}

export function contentText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "thinking", "content", "message", "output"] as const) {
      const text = contentText(record[key]);
      if (text) return text;
    }
    if (record.type === "toolCall") {
      return `tool: ${String(record.name ?? "")} ${JSON.stringify(record.arguments ?? {})}`;
    }
  }
  return "";
}

export function isoFromMtimeMs(mtimeMs: number): string {
  return new Date(mtimeMs).toISOString();
}

export async function fileMeta(filePath: string): Promise<{ mtimeMs: number; sizeBytes: number }> {
  const metadata = await stat(filePath);
  return { mtimeMs: Math.trunc(metadata.mtimeMs), sizeBytes: metadata.size };
}

export function maybeTimestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
