import { NextResponse } from "next/server";
import { usageSummary, usageTimeline } from "@core/db.js";
import { getDb } from "../../../lib/db";
import { parseUsageRequest } from "../../../lib/usage";

// better-sqlite3 must run on Node — Next's Edge runtime would refuse the binding.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const { kind, bucket, filters } = parseUsageRequest(url.searchParams);
  const db = getDb();
  return NextResponse.json({
    kind,
    bucket,
    summary: usageSummary(db, kind, filters),
    timeline: usageTimeline(db, kind, bucket, filters),
  });
}
