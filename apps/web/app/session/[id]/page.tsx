import { notFound } from "next/navigation";
import { Header } from "@/components/session/Header";
import { StatStrip } from "@/components/session/StatStrip";
import { TranscriptPane } from "@/components/session/TranscriptPane";
import { Topbar } from "@/components/shell/Topbar";
import { getDb, sessionHeader } from "@/lib/db";

// Server components touching better-sqlite3 must run on Node — Next's
// Edge runtime would refuse the binding.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Session detail page — server component. Reads the URL-decoded session
 * id from `params`, loads the header synchronously from SQLite, and
 * renders the page header + 4-stat strip immediately. Transcript items
 * stream in via `<TranscriptPane>`, the client component that consumes
 * the `/api/session?id=…` ndjson endpoint built in T06.
 */
export default async function SessionDetailPage({
  params,
}: SessionDetailPageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const header = sessionHeader(getDb(), decoded);
  if (!header) notFound();

  const linkedCount = header.linkedSessions.length;

  return (
    <>
      <Topbar title="Session details" subtitle="Transcript evidence" />
      <Header header={header} />
      <section className="px-4 py-4 md:px-6">
        <StatStrip
          turns={header.turnCount}
          tools={header.toolUseCount}
          skills={header.skillUseCount}
          linked={linkedCount}
        />
      </section>
      <TranscriptPane sessionId={decoded} />
    </>
  );
}
