"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "./NavLink";

const DRAWER_NAV_ITEM =
  "flex items-center gap-3 rounded-md px-3 py-3 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-text aria-[current=page]:shadow-[inset_3px_0_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-0";

interface MobileNavProps {
  /**
   * Real session count label (e.g. "8" or "100+") computed in the
   * server-only `AppShell`. Mirrors the desktop `Sidebar` badge so the
   * mobile drawer never collapses to the em-dash placeholder
   * (mobile fail #2 in `docs/review/10-mobile.md`).
   */
  sessionsCountLabel: string;
}

/**
 * Mobile navigation: a hamburger trigger plus an off-canvas drawer.
 * Only visible below the 720 px breakpoint (`md:hidden`).
 *
 * Implementation notes:
 *   - The trigger drives `aria-expanded` so screen readers can announce state.
 *   - When open, body scroll is locked via a class on `document.body`.
 *   - Escape closes the drawer.
 */
export function MobileNav({ sessionsCountLabel }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("mobile-nav-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("mobile-nav-open");
    };
  }, [open, close]);

  return (
    <div className="md:hidden">
      <div className="border-border bg-surface-low relative z-30 flex items-center justify-between border-b px-3 py-2">
        <Link
          href="/"
          aria-label="Session Review home"
          className="text-text flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-0"
          onClick={close}
        >
          <span aria-hidden="true" className="text-accent font-mono">
            {"›_"}
          </span>
          <span>Session Review</span>
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          onClick={toggle}
          className="border-border-strong bg-surface text-text relative z-30 inline-flex h-9 w-9 items-center justify-center rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-0"
        >
          <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        </button>
      </div>
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
        hidden={!open}
        className="bg-surface-low fixed inset-x-0 top-[52px] bottom-0 z-20 flex flex-col gap-2 px-3 pt-3 pb-6"
      >
        <nav aria-label="Sections" className="grid gap-1">
          <NavLink href="/" className={DRAWER_NAV_ITEM} onNavigate={close}>
            <span aria-hidden="true" className="font-mono text-sm">
              ▣
            </span>
            <span className="flex-1">Sessions</span>
            <span
              className="bg-surface-raised text-muted-strong inline-flex min-w-max justify-center rounded px-1.5 text-xs"
              aria-hidden="true"
              data-slot="sessions-count"
            >
              {sessionsCountLabel}
            </span>
          </NavLink>
          <NavLink href="/tools" className={DRAWER_NAV_ITEM} onNavigate={close}>
            <span aria-hidden="true" className="font-mono text-sm">
              ⊙
            </span>
            <span className="flex-1">Tools</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
