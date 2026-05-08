import { NextResponse } from "next/server";
import { searchFilteredSessions } from "@core/db.js";
import { getDb } from "../../../lib/db";
import { parseSearchFilters } from "../../../lib/search";

// better-sqlite3 must run on Node — Next's Edge runtime would refuse the binding.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const filters = parseSearchFilters(url.searchParams);
  const rows = searchFilteredSessions(getDb(), filters);
  return NextResponse.json(rows);
}
