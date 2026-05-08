"use client";

import { useCallback, useState } from "react";

interface CopyButtonProps {
  /** Value written to the clipboard on click. */
  value: string;
  /** Accessible label describing what is being copied. */
  ariaLabel: string;
  /** Optional `data-testid` so specs can target a specific copy button. */
  testId?: string;
  /** Optional Tailwind class overrides for the button shell. */
  className?: string;
}

/**
 * Small `⧉` copy button reused across the row drawer, session header, and
 * any other surface that exposes a copy-to-clipboard affordance. Shows a
 * "✓" for two seconds after a successful write, then reverts. Failure is
 * silent — the value is always rendered next to the button so the user
 * can fall back to a manual copy.
 */
export function CopyButton({
  value,
  ariaLabel,
  testId,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Insecure context or permission denied — keep the user's flow intact.
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel}
      data-testid={testId}
      className={
        className ??
        "bg-surface text-text-secondary hover:bg-surface-raised hover:text-text inline-grid h-6 w-6 place-items-center rounded-md border border-[var(--color-border)] text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0"
      }
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
