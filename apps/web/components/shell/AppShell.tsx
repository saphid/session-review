import type { ReactNode } from "react";
import { getSessionsCount } from "@/lib/sessions-count";
import { MobileNav } from "./MobileNav";
import { PiSidebar } from "../pi/PiSidebar";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  /**
   * Optional override for the right-hand Pi sidebar slot. When omitted, the
   * shell renders the default `<PiSidebar />`. Pass `null` to suppress the
   * Pi panel on routes that don't want it.
   */
  pi?: ReactNode;
}

/**
 * Three-zone application chrome:
 *   1. Left sidebar (216 px on desktop; off-canvas drawer on mobile)
 *   2. Main column (page content)
 *   3. Right Pi sidebar (streaming, structured errors)
 */
export function AppShell({ children, pi }: AppShellProps) {
  const { label: sessionsCountLabel } = getSessionsCount();
  return (
    <div className="text-text flex min-h-screen flex-col md:flex-row">
      {/*
       * Skip-to-content link. `sr-only` clips it to a 1×1 px box at the
       * document origin so it doesn't pollute click hit testing; on
       * keyboard focus, `focus:not-sr-only` releases the clip and the
       * fixed positioning lands it at the top-left of the viewport.
       */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:bg-surface-raised focus:text-text focus:border-border-strong focus:focus-ring focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:border focus:px-3 focus:py-2 focus:text-sm focus:no-underline focus:outline-none"
      >
        Skip to content
      </a>
      <MobileNav sessionsCountLabel={sessionsCountLabel} />
      <Sidebar />
      <main id="main-content" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>
      {pi === null ? null : pi !== undefined ? pi : <PiSidebar />}
    </div>
  );
}
