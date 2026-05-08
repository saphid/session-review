"use client";

import { useCallback, useState } from "react";

interface CopyButtonProps {
  value: string;
  label: string;
}

/**
 * Tiny inline copy-to-clipboard glyph button. Renders as a `⧉` icon and
 * flips to a tick for a beat after a successful copy so the user can
 * see the action landed.
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fall back silently — some browsers block clipboard writes
      // outside user gestures, but we always run inside a click handler.
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border text-muted-strong hover:text-text hover:border-border-strong inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55"
    >
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}
