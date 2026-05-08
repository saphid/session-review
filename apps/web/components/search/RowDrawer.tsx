"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LinkedSession, TopUsageSignal } from "@/lib/types";
import { CopyButton } from "@/components/ui/CopyButton";

interface RowDrawerProps {
  sessionId: string;
  /** Raw transcript path. */
  path: string;
  /** Working directory. May be null when the source didn't capture one. */
  cwd: string | null;
  /** Closes the drawer. Wired to the ESC handler and the close affordance. */
  onClose: () => void;
}

interface SummaryPayload {
  topTools: TopUsageSignal[];
  topSkills: TopUsageSignal[];
  linkedSessions: LinkedSession[];
}

const PROVIDER_GLYPH: Record<string, string> = {
  pi: "π",
  claude: "✦",
  codex: "▣",
  cursor: "›_",
};

/**
 * Inline drawer that expands beneath a clicked row in the search results
 * table. Renders a 4-column grid:
 *   1. SESSION ID + RAW PATH + WORKING DIRECTORY (each with `⧉` copy buttons).
 *   2. TOP TOOLS — horizontal-bar list of the top 5 tool names by total
 *      `count` from `usage_signals` (kind='tool').
 *   3. TOP SKILLS — same shape for kind='skill'.
 *   4. LINKED SESSIONS — `next/link` cards routing to /session/<id>.
 *
 * Data is fetched from `/api/session-summary?id=…` on mount. While the
 * request is in flight the drawer renders skeletons so the UI doesn't
 * jump. ESC closes the drawer (handled by the parent `ResultsTable`).
 */
export function RowDrawer({ sessionId, path, cwd, onClose }: RowDrawerProps) {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    fetch(`/api/session-summary?id=${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as SummaryPayload;
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div
      data-testid="row-drawer"
      className="border-border bg-surface-low border-t px-4 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-muted-strong text-[11px] font-semibold uppercase tracking-[0.07em]">
          Session details
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-text-secondary focus-visible:ring-accent/55 rounded p-1 text-base leading-none focus-visible:outline-none focus-visible:ring-2"
          aria-label="Close session details"
          data-testid="drawer-close"
        >
          ×
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <IdentityColumn sessionId={sessionId} path={path} cwd={cwd} />
        <UsageColumn
          label="Top tools"
          testId="drawer-top-tools"
          itemTestId="drawer-top-tools-item"
          items={summary?.topTools ?? null}
          loading={summary === null && error === null}
        />
        <UsageColumn
          label="Top skills"
          testId="drawer-top-skills"
          itemTestId="drawer-top-skills-item"
          items={summary?.topSkills ?? null}
          loading={summary === null && error === null}
        />
        <LinkedColumn
          items={summary?.linkedSessions ?? null}
          loading={summary === null && error === null}
        />
      </div>

      {error ? (
        <p
          role="status"
          className="text-muted mt-3 text-xs"
          data-testid="drawer-error"
        >
          Couldn’t load summary: {error}
        </p>
      ) : null}
    </div>
  );
}

function IdentityColumn({
  sessionId,
  path,
  cwd,
}: {
  sessionId: string;
  path: string;
  cwd: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Session ID">
        <span
          className="text-text font-mono text-xs"
          data-testid="drawer-session-id-value"
        >
          {sessionId}
        </span>
        <CopyButton
          value={sessionId}
          ariaLabel={`Copy session id ${sessionId}`}
          testId="drawer-copy-session-id"
        />
      </Field>
      <Field label="Raw transcript path">
        <span
          className="text-text-secondary truncate font-mono text-xs"
          title={path}
          data-testid="drawer-path-value"
        >
          {path}
        </span>
        <CopyButton
          value={path}
          ariaLabel={`Copy transcript path for ${sessionId}`}
          testId="drawer-copy-path"
        />
      </Field>
      <Field label="Working directory">
        {cwd ? (
          <>
            <span
              className="text-text-secondary truncate font-mono text-xs"
              title={cwd}
              data-testid="drawer-cwd-value"
            >
              {cwd}
            </span>
            <CopyButton
              value={cwd}
              ariaLabel={`Copy working directory for ${sessionId}`}
              testId="drawer-copy-cwd"
            />
          </>
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-strong text-[10px] font-semibold uppercase tracking-[0.07em]">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

interface UsageColumnProps {
  label: string;
  testId: string;
  itemTestId: string;
  items: TopUsageSignal[] | null;
  loading: boolean;
}

function UsageColumn({ label, testId, itemTestId, items, loading }: UsageColumnProps) {
  const max = items && items.length > 0 ? Math.max(...items.map((item) => item.count)) : 0;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span className="text-muted-strong text-[10px] font-semibold uppercase tracking-[0.07em]">
        {label}
      </span>
      {loading ? (
        <div className="text-muted text-xs">Loading…</div>
      ) : items && items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.name}
              data-testid={itemTestId}
              className="flex items-center gap-2"
            >
              <span className="text-text min-w-0 flex-1 truncate font-mono text-xs">
                {item.name}
              </span>
              <span className="bg-surface-raised relative h-1.5 w-20 overflow-hidden rounded-sm">
                <span
                  className="bg-accent absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: max > 0 ? `${Math.max(8, (item.count / max) * 100)}%` : "0%",
                  }}
                  aria-hidden="true"
                />
              </span>
              <span className="text-muted w-7 text-right text-xs tabular-nums">
                {item.count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted text-xs">—</span>
      )}
    </div>
  );
}

interface LinkedColumnProps {
  items: LinkedSession[] | null;
  loading: boolean;
}

function LinkedColumn({ items, loading }: LinkedColumnProps) {
  return (
    <div className="flex flex-col gap-2" data-testid="drawer-linked-sessions">
      <span className="text-muted-strong text-[10px] font-semibold uppercase tracking-[0.07em]">
        Linked sessions
      </span>
      {loading ? (
        <div className="text-muted text-xs">Loading…</div>
      ) : items && items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 6).map((linked) => (
            <li key={linked.sessionId}>
              <Link
                href={`/session/${encodeURIComponent(linked.sessionId)}`}
                className="border-border hover:bg-surface focus-visible:ring-accent/55 flex flex-col gap-0.5 rounded-md border bg-[var(--color-surface)] px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2"
                data-testid="drawer-linked-card"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="text-text-secondary inline-flex h-4 w-4 items-center justify-center font-mono text-[11px]"
                  >
                    {PROVIDER_GLYPH[linked.provider] ?? linked.provider[0]?.toUpperCase()}
                  </span>
                  <span className="text-text truncate text-xs font-medium">
                    {linked.title?.trim() || linked.sessionId}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted text-[10px] tabular-nums">
                    {linked.startedAt ? formatStartedAt(linked.startedAt) : ""}
                  </span>
                  <span className="bg-surface-raised text-muted-strong rounded-sm px-1 py-px text-[10px]">
                    {linked.reason}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-muted text-xs">—</span>
      )}
    </div>
  );
}

// Locale-independent format so SSR and client hydration agree. Server runs
// Node (defaults to en-US "Jan 16, 2026"); client uses the user's locale
// ("16 Jan 2026" on en-AU). Hand-rolled formatting eliminates the mismatch.
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function formatStartedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = SHORT_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} · ${hours}:${minutes}`;
}
