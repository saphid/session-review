import "server-only";

import type { BatchMode, TimeBucket, UsageKind } from "@core/analytics.js";
import type { ProviderId } from "@core/types.js";
import type { SessionFilters } from "@core/db.js";

export type UsageFilters = Omit<SessionFilters, "query" | "limit">;

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Parses /api/usage URL search params into the kind+bucket+filters tuple the
 * data layer expects. Mirrors `src/legacy-server.ts:51` so the contract holds
 * across both servers while the legacy app still ships.
 */
export function parseUsageRequest(params: URLSearchParams): {
  kind: UsageKind;
  bucket: TimeBucket;
  filters: UsageFilters;
} {
  const filters: UsageFilters = {
    provider: parseProvider(params.get("provider")),
    cwd: emptyToNull(params.get("cwd")),
    path: emptyToNull(params.get("path")),
    startDate: emptyToNull(params.get("startDate")),
    endDate: emptyToNull(params.get("endDate")),
    batchMode: parseBatchMode(params.get("batchMode")),
  };
  const kind = parseUsageKind(params.get("kind"));
  const bucket = resolveBucket(params.get("bucket"), filters.startDate, filters.endDate);
  return { kind, bucket, filters };
}

function resolveBucket(raw: string | null, startDate: string | null, endDate: string | null): TimeBucket {
  if (raw === "day" || raw === "week") return raw;
  // `bucket=auto` (or absent): pick week when the date span exceeds 60 days.
  // When either bound is missing, default to day — matches the legacy server.
  if (!startDate || !endDate) return "day";
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "day";
  return end - start > SIXTY_DAYS_MS ? "week" : "day";
}

function emptyToNull(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

function parseProvider(value: string | null): ProviderId | null {
  return value === "pi" || value === "claude" || value === "codex" || value === "cursor" ? value : null;
}

function parseBatchMode(value: string | null): BatchMode {
  return value === "exclude" || value === "only" ? value : "include";
}

function parseUsageKind(value: string | null): UsageKind {
  return value === "skill" ? "skill" : "tool";
}
