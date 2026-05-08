import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { buildSessionSummary } from "../../../lib/session-summary";

// better-sqlite3 must run on Node — Next's Edge runtime would refuse the binding.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the data the search row drawer needs in one round-trip:
 * top 5 tools and skills from `usage_signals`, and a small set of
 * linked sessions (parent + sibling subagents) without re-reading the
 * transcript body. Mirrors the shape consumed by `RowDrawer`.
 */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const summary = buildSessionSummary(getDb(), id);
  return NextResponse.json(summary);
}
