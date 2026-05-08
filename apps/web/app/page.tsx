import { Filters } from "@/components/search/Filters";
import { ResultsTable } from "@/components/search/ResultsTable";
import { Topbar } from "@/components/shell/Topbar";
import { parse } from "@/lib/search-params";
import { searchSessionsForPage } from "@/lib/server-search";

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
 * Sessions list (route `/`). Server component composing two beads:
 *
 *   - T08 owns URL ↔ typed-params parsing (`parse`) and the SSR data
 *     fetch (`searchSessionsForPage`). It also renders the `<Filters>`
 *     chrome above the table, which writes URL state on change.
 *   - T09 owns the actual `<ResultsTable>` with sortable headers that
 *     round-trip sort/dir through the URL.
 *
 * Both consumers share a single `parse(raw)` + `searchSessionsForPage`
 * call so the row count shown by the filter chrome and the rows rendered
 * in the table never disagree. The Topbar title is "Sessions" per the
 * redesign brief; the brand link in the sidebar still reads "Session
 * Review home".
 */
export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const raw = await searchParams;
  const parsed = parse(raw);
  const rows = searchSessionsForPage(parsed);

  return (
    <>
      <Topbar title="Sessions" subtitle="Evidence table" />
      <section className="flex flex-1 flex-col gap-4 px-4 py-6 md:px-6">
        <Filters initial={parsed} resultCount={rows.length} />
        <ResultsTable rows={rows} searchParams={raw} />
      </section>
    </>
  );
}
