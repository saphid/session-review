#!/usr/bin/env node
import path from "node:path";
import { stat } from "node:fs/promises";
import { indexedFileMeta, openDb, rebuildDerived, searchSessions, statusRows, upsertSession } from "./db.js";
import { allProviderIds, createAdapters } from "./providers.js";
import type { IngestSummary, ProviderId } from "./types.js";

const defaultDb = path.join(process.env.HOME ?? ".", ".local", "share", "session-review", "sessions.sqlite");

interface GlobalOptions {
  dbPath: string;
  args: string[];
}

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const global = parseGlobal(argv);
  const [cmd, ...args] = global.args;
  const db = openDb(global.dbPath);

  if (cmd === "ingest") {
    const provider = optionValue(args, "--provider") as ProviderId | null;
    const providers = provider ? [provider] : allProviderIds();
    const watch = args.includes("--watch");
    const intervalSeconds = Number(optionValue(args, "--interval") ?? "300");
    do {
      const started = new Date();
      const summary = await ingestProviders(db, providers);
      console.log(`[${new Date().toISOString()}] Indexed ${summary.changed} changed sessions from ${summary.candidates} candidates.`);
      if (!watch) return 0;
      console.log(`[${new Date().toISOString()}] Next ingest in ${intervalSeconds}s. Sessions modified/resumed after ${started.toISOString()} will be picked up next pass.`);
      await sleep(intervalSeconds * 1000);
    } while (watch);
    return 0;
  }

  if (cmd === "search") {
    const query = args.find((arg) => !arg.startsWith("--"));
    if (!query) throw new Error("search requires a query");
    const provider = optionValue(args, "--provider") as ProviderId | null;
    const limit = Number(optionValue(args, "--limit") ?? "20");
    const noRefresh = args.includes("--no-refresh");
    if (!noRefresh) {
      const summary = await ingestProviders(db, provider ? [provider] : allProviderIds());
      console.error(`Indexed ${summary.changed} changed sessions from ${summary.candidates} candidates.`);
    }
    const results = searchSessions(db, query, provider, limit);
    if (results.length === 0) {
      console.log(`No sessions matched ${JSON.stringify(query)}.`);
      return 0;
    }
    for (const [index, result] of results.entries()) {
      console.log(`${index + 1}. [${result.provider}] ${result.title ?? "Untitled"}`);
      if (result.startedAt) console.log(`   started: ${result.startedAt}`);
      if (result.cwd) console.log(`   cwd: ${result.cwd}`);
      console.log(`   path: ${result.path}`);
      if (result.snippet) console.log(`   snippet: ${result.snippet}`);
      console.log();
    }
    return 0;
  }

  if (cmd === "derive") {
    const count = rebuildDerived(db);
    console.log(`Rebuilt tool/skill derived usage for ${count} sessions.`);
    return 0;
  }

  if (cmd === "status") {
    const rows = statusRows(db);
    if (rows.length === 0) console.log("No indexed sessions.");
    for (const row of rows) console.log(`${row.provider}: ${row.count}`);
    return 0;
  }

  printHelp();
  return cmd ? 1 : 0;
}

function parseGlobal(argv: string[]): GlobalOptions {
  const args = [...argv];
  const dbIndex = args.indexOf("--db");
  let dbPath = defaultDb;
  if (dbIndex >= 0) {
    const value = args[dbIndex + 1];
    if (!value) throw new Error("--db requires a path");
    dbPath = value;
    args.splice(dbIndex, 2);
  }
  return { dbPath, args };
}

async function ingestProviders(db: ReturnType<typeof openDb>, providers: ProviderId[]): Promise<IngestSummary> {
  const adapters = createAdapters();
  const summary: IngestSummary = { candidates: 0, changed: 0 };
  const started = Date.now();
  for (const provider of providers) {
    const providerStart = Date.now();
    let providerCandidates = 0;
    let providerChanged = 0;
    console.error(`[${new Date().toISOString()}] ingest ${provider}: scanning`);
    const adapter = adapters[provider];
    for await (const filePath of adapter.discover()) {
      summary.candidates += 1;
      providerCandidates += 1;
      const previous = indexedFileMeta(db, provider, filePath);
      if (previous) {
        try {
          const metadata = await stat(filePath);
          if (previous.mtimeMs === Math.trunc(metadata.mtimeMs) && previous.sizeBytes === metadata.size) {
            if (providerCandidates % 500 === 0) reportProgress(provider, providerCandidates, providerChanged, started);
            continue;
          }
        } catch {
          continue;
        }
      }
      const doc = await adapter.parse(filePath);
      if (doc && upsertSession(db, doc)) {
        summary.changed += 1;
        providerChanged += 1;
      }
      if (providerCandidates % 100 === 0) reportProgress(provider, providerCandidates, providerChanged, started);
    }
    console.error(`[${new Date().toISOString()}] ingest ${provider}: done, candidates=${providerCandidates}, changed=${providerChanged}, elapsed=${formatDuration(Date.now() - providerStart)}`);
  }
  return summary;
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function reportProgress(provider: ProviderId, candidates: number, changed: number, started: number): void {
  console.error(`[${new Date().toISOString()}] ingest ${provider}: candidates=${candidates}, changed=${changed}, elapsed=${formatDuration(Date.now() - started)}`);
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp(): void {
  console.log(`session-review

Commands:
  ingest [--provider pi|claude|codex|cursor] [--watch] [--interval seconds]
  search <query> [--provider pi|claude|codex|cursor] [--limit n] [--no-refresh]
  derive
  status

Global:
  --db <path>  Override SQLite database path

Notes:
  Ingest is mtime/size based. Running --watch keeps rescanning so active sessions and later-resumed sessions are re-indexed when their files change.
`);
}

main().then((code) => process.exit(code)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
