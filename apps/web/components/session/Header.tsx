import Link from "next/link";
import type { SessionDetails } from "@/lib/types";
import { truncatePathMiddle } from "@/lib/path-truncate";
import { CopyButton } from "./CopyButton";

type HeaderData = Omit<SessionDetails, "transcript">;

interface HeaderProps {
  header: HeaderData;
}

const PROVIDER_LABELS: Record<string, string> = {
  pi: "pi",
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
};

/**
 * Session detail page header. Renders the back link, the multi-line
 * title, the meta strip (provider pill + date + run-mode badge), the
 * working directory, and the transcript path. Each path is rendered
 * middle-truncated for layout calm; the full path is preserved on the
 * surrounding element's `aria-label` so assistive tech still gets it.
 */
export function Header({ header }: HeaderProps) {
  const provider = PROVIDER_LABELS[header.provider] ?? header.provider;
  const dateLabel = formatDate(header.startedAt);
  const runModeLabel = header.isBatch ? "batch" : "standard";
  const cwdLabel = header.cwd ? truncatePathMiddle(header.cwd, 64) : "—";
  const pathLabel = truncatePathMiddle(header.path, 64);
  return (
    <section
      aria-labelledby="session-title"
      className="border-border bg-surface flex flex-col gap-4 border-b px-4 py-5 md:px-6"
    >
      <Link
        href="/"
        className="text-accent hover:text-text inline-flex w-fit items-center gap-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
      >
        <span aria-hidden="true">{"←"}</span>
        <span>Sessions</span>
      </Link>
      <h1
        id="session-title"
        className="text-text break-words text-xl font-semibold leading-snug tracking-tight"
      >
        {header.title ?? "(untitled session)"}
      </h1>
      <div
        className="text-text-secondary flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
        aria-label="Session metadata"
      >
        <span className="border-border bg-surface-low text-muted-strong inline-flex items-center rounded border px-2 py-0.5 text-xs uppercase tracking-wide">
          {provider}
        </span>
        <span className="text-text-secondary">{dateLabel}</span>
        <span className="border-border bg-surface-low text-muted-strong inline-flex items-center rounded border px-2 py-0.5 text-xs uppercase tracking-wide">
          {runModeLabel}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-muted-strong text-xs font-semibold uppercase tracking-[0.07em]">
            Working directory
          </dt>
          <dd
            className="text-text-secondary flex min-w-0 items-center gap-2 font-mono text-sm"
            aria-label={header.cwd ? `Working directory: ${header.cwd}` : "Working directory not recorded"}
          >
            <span className="min-w-0 truncate">{cwdLabel}</span>
            {header.cwd ? (
              <CopyButton value={header.cwd} label="Copy working directory" />
            ) : null}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-muted-strong text-xs font-semibold uppercase tracking-[0.07em]">
            Transcript path
          </dt>
          <dd
            className="text-text-secondary flex min-w-0 items-center gap-2 font-mono text-sm"
            aria-label={`Transcript path: ${header.path}`}
          >
            <span className="min-w-0 truncate">{pathLabel}</span>
            <CopyButton value={header.path} label="Copy transcript path" />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  // 8 May 2026, 03:58 pm — match the redesign worktree wording.
  const day = parsed.getUTCDate();
  const month = parsed.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  const year = parsed.getUTCFullYear();
  const time = parsed.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
  return `${day} ${month} ${year}, ${time}`;
}
