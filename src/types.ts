export type ProviderId = "pi" | "claude" | "codex" | "cursor";

export interface SessionDocument {
  provider: ProviderId;
  path: string;
  sessionId: string;
  startedAt: string | null;
  cwd: string | null;
  title: string | null;
  body: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface ProviderAdapter {
  id: ProviderId;
  defaultRoots(): string[];
  discover(): AsyncIterable<string>;
  parse(path: string): Promise<SessionDocument | null>;
}

export interface SearchResult {
  provider: ProviderId;
  sessionId: string;
  title: string | null;
  startedAt: string | null;
  cwd: string | null;
  path: string;
  snippet: string | null;
}

export interface IngestSummary {
  candidates: number;
  changed: number;
}
