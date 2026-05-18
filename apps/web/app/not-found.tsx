import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-muted font-mono text-xs uppercase tracking-[0.2em]">
        404 — not found
      </p>
      <h1 className="text-text text-2xl font-semibold tracking-tight">
        That session isn&apos;t in the local index.
      </h1>
      <p className="text-text-secondary max-w-md text-sm leading-relaxed">
        The URL points to a session ID, transcript path, or page that
        doesn&apos;t exist in this database. If a session was just ingested,
        give the index a moment to update.
      </p>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <Link
          href="/"
          className="bg-accent text-canvas focus-visible:ring-accent/55 rounded-md px-3 py-1.5 font-medium focus-visible:outline-none focus-visible:ring-2"
        >
          Back to sessions
        </Link>
        <Link
          href="/tools"
          className="border-border text-text-secondary hover:text-text rounded-md border px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
        >
          Open Tools
        </Link>
      </div>
    </div>
  );
}
