import type { ReactNode } from "react";

interface TopbarProps {
  title: string;
  subtitle?: string;
  /**
   * Right-aligned controls slot — filter toggles, project select, search box,
   * etc. Filled by route-level pages (T08 wires this up for `/`).
   */
  controls?: ReactNode;
}

/**
 * Page header strip rendered at the top of the main column. Server component:
 * pages pass title text and any controls as children.
 */
export function Topbar({ title, subtitle, controls }: TopbarProps) {
  return (
    <header className="border-border flex flex-wrap items-baseline justify-between gap-4 border-b px-4 py-4 md:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-text text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <span className="text-muted text-sm">{subtitle}</span>
        ) : null}
      </div>
      {controls ? (
        <div className="flex items-center gap-2">{controls}</div>
      ) : null}
    </header>
  );
}
