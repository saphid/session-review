"use client";

import { useCallback, useState } from "react";
import type { SearchResult } from "@/lib/types";

interface RowActionsProps {
  row: SearchResult;
}

/**
 * Per-row action cluster: "Pi" attach button + copy-path button.
 *
 * The Pi button is a placeholder — it dispatches a `session-review:selected-row`
 * CustomEvent on `window` carrying the session id, path, and title. T13 wires
 * the actual Pi sidebar to consume that event. Keeping the dispatch here means
 * the table doesn't need to know about Pi-specific state.
 *
 * The copy button writes the session's transcript path to the clipboard via
 * `navigator.clipboard.writeText`. We surface a brief inline confirmation
 * ("✓") for two seconds — sufficient feedback without yanking focus.
 */
export function RowActions({ row }: RowActionsProps) {
  const [copied, setCopied] = useState(false);

  const onAttach = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("session-review:selected-row", {
        detail: {
          sessionId: row.sessionId,
          path: row.path,
          title: row.title,
        },
      }),
    );
  }, [row.path, row.sessionId, row.title]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(row.path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write rejected (e.g. insecure context). Fail silently —
      // the user still has the path visible in the drawer (T10).
    }
  }, [row.path]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onAttach}
        className="bg-surface text-text-secondary hover:bg-surface-raised hover:text-text inline-grid h-7 min-w-[30px] place-items-center rounded-md border border-[var(--color-border)] px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0"
        aria-label={`Attach session ${row.sessionId} to Pi`}
        data-testid="row-action-pi"
      >
        Pi
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="bg-surface text-text-secondary hover:bg-surface-raised hover:text-text inline-grid h-7 min-w-[30px] place-items-center rounded-md border border-[var(--color-border)] px-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0"
        aria-label={`Copy transcript path for ${row.sessionId}`}
        data-testid="row-action-copy"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </div>
  );
}
