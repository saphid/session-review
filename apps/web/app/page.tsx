import { Filters } from "@/components/search/Filters";
import { Topbar } from "@/components/shell/Topbar";
import { searchSessionsForPage } from "@/lib/server-search";
import { parse } from "@/lib/search-params";

// Search results depend on the URL query string, so they must be re-fetched
// on each request. Forcing dynamic also keeps the server in step with the
// debounced URL writes the client performs.
export const dynamic = "force-dynamic";

interface SessionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const raw = await searchParams;
  const parsed = parse(raw);
  const rows = searchSessionsForPage(parsed);

  return (
    <>
      <Topbar title="Session Review" subtitle="Sessions — evidence table" />
      <section className="flex flex-1 flex-col gap-4 px-4 py-6 md:px-6">
        <Filters initial={parsed} resultCount={rows.length} />
        {/* T09 will replace this stub with the real ResultsTable. */}
        <div data-slot="results-stub" className="text-muted text-sm">
          {rows.length} results
        </div>
      </section>
    </>
  );
}
