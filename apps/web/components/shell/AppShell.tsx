import type { ReactNode } from "react";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  /**
   * Reserved slot for the right-hand Pi sidebar (filled by T13).
   * Hidden under the 720 px breakpoint per `docs/review/10-mobile.md`.
   */
  pi?: ReactNode;
}

/**
 * Three-zone application chrome:
 *   1. Left sidebar (216 px on desktop; off-canvas drawer on mobile)
 *   2. Main column (page content)
 *   3. Right Pi sidebar slot (placeholder for T13)
 */
export function AppShell({ children, pi }: AppShellProps) {
  return (
    <div className="text-text flex min-h-screen flex-col md:flex-row">
      <MobileNav />
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      {pi ? (
        <aside
          data-slot="pi-sidebar"
          aria-label="Pi assistant"
          className="border-border bg-surface-low hidden w-[320px] shrink-0 border-l md:block"
        >
          {pi}
        </aside>
      ) : (
        <div data-slot="pi-sidebar" hidden />
      )}
    </div>
  );
}
