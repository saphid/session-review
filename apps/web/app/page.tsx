import { Filters } from "@/components/search/Filters";
import { ResultsTable } from "@/components/search/ResultsTable";
import { Topbar } from "@/components/shell/Topbar";
import { parse } from "@/lib/search-params";
import { searchSessionsForPage } from "@/lib/server-search";
import { getSessionsCount } from "@/lib/sessions-count";

// SQLite + the search SQL must run on Node — Next's Edge runtime has no
// better-sqlite3 binding. Search results also depend on the URL query
// string, so they must be re-fetched on every request; forcing dynamic
// keeps the server in step with the debounced URL writes the client
// performs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Sessions list (route `/`). Server component that parses the URL into typed
 * filters, runs the search, and renders the filter chrome plus the results
 * table. Both `<Filters>` and `<ResultsTable>` read from a single
 * `searchSessionsForPage` call so the result count shown above the table and
 * the rows rendered in it can never disagree.
 */
export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const raw = await searchParams;
  const parsed = parse(raw);
  const rows = searchSessionsForPage(parsed);
  // `total` is the row count in `sessions` (capped). When it is zero the
  // database has never been ingested; the empty state needs the explicit
  // `npm start -- ingest` CTA rather than the per-query "no matches"
  // string.
  const { total } = getSessionsCount();

  return (
    <>
      <Topbar title="Sessions" subtitle="Evidence table" />
      <section className="flex flex-1 flex-col gap-4 px-4 py-6 md:px-6">
        <Filters initial={parsed} resultCount={rows.length} />
        <ResultsTable
          rows={rows}
          searchParams={raw}
          totalIndexedSessions={total}
        />
      </section>
    </>
  );
}
