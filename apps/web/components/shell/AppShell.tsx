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
 *   3. Right Pi sidebar (`PiSidebar` from T13 — streaming, structured errors)
 */
export function AppShell({ children, pi }: AppShellProps) {
  const { label: sessionsCountLabel } = getSessionsCount();
  return (
    <div className="text-text flex min-h-screen flex-col md:flex-row">
      <MobileNav sessionsCountLabel={sessionsCountLabel} />
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      {pi === null ? null : pi !== undefined ? pi : <PiSidebar />}
    </div>
  );
}
