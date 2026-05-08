import Link from "next/link";
import { NavLink } from "./NavLink";

const NAV_ITEM_BASE =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-text aria-[current=page]:shadow-[inset_3px_0_var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-0";

/**
 * Desktop sidebar. Renders the brand link and the two top-level nav entries.
 * Width is fixed at 216 px on the >720 px breakpoint; below that the
 * sidebar collapses into the off-canvas drawer driven by `MobileNav`.
 */
export function Sidebar() {
  return (
    <aside
      aria-label="Primary navigation"
      className="border-border bg-surface-low hidden w-[216px] shrink-0 flex-col gap-6 border-r px-3 py-4 md:flex"
    >
      <Link
        href="/"
        aria-label="Session Review home"
        className="text-text hover:text-accent flex items-center gap-3 rounded-md px-2 py-1 text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-0"
      >
        <span
          aria-hidden="true"
          className="text-accent font-mono text-lg leading-none"
        >
          {"›_"}
        </span>
        <span>Session Review</span>
      </Link>
      <nav aria-label="Sections" className="grid gap-1">
        <NavLink href="/" className={NAV_ITEM_BASE}>
          <span aria-hidden="true" className="font-mono text-sm">
            ▣
          </span>
          <span className="flex-1">Sessions</span>
          <span
            className="bg-surface-raised text-muted-strong inline-flex min-w-[1.75rem] justify-center rounded px-1.5 text-xs"
            aria-hidden="true"
            data-slot="sessions-count"
          >
            —
          </span>
        </NavLink>
        <NavLink href="/tools" className={NAV_ITEM_BASE}>
          <span aria-hidden="true" className="font-mono text-sm">
            ⊙
          </span>
          <span className="flex-1">Tools</span>
        </NavLink>
      </nav>
    </aside>
  );
}
