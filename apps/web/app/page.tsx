import { searchFilteredSessions } from "@core/db.js";
import { ResultsTable } from "@/components/search/ResultsTable";
import { getDb } from "@/lib/db";
import { parseSearchFilters } from "@/lib/search";
import { Topbar } from "@/components/shell/Topbar";

// SQLite + the search SQL must run on Node — Next's Edge runtime has no
// better-sqlite3 binding.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Sessions list (route `/`). Server component — reads filters from the URL,
 * runs the SQL via `searchFilteredSessions`, and hands the row set plus the
 * raw search params to the `ResultsTable` client component so it can write
 * sort state back into the URL.
 *
 * T08 will replace this scaffold with the full filters drawer + search bar
 * controls; for now we honor the search/filter params already supported by
 * `parseSearchFilters` so deep links like `/?query=react` produce real
 * results.
 */
export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const resolved = await searchParams;
  const params = recordToParams(resolved);
  const filters = parseSearchFilters(params);
  const rows = searchFilteredSessions(getDb(), filters);

  return (
    <>
      <Topbar title="Sessions" subtitle="Evidence table" />
      <section className="flex flex-1 flex-col gap-3 px-4 py-6 md:px-6">
        <ResultsTable rows={rows} searchParams={resolved} />
      </section>
    </>
  );
}

function recordToParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  return params;
}
