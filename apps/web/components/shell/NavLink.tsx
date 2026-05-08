"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /**
   * Optional callback fired when the user activates the link.
   * Used by the mobile drawer to close itself after navigation.
   */
  onNavigate?: () => void;
}

/**
 * Internal navigation link that exposes `aria-current="page"` on the active
 * route and *removes* the attribute on inactive routes (rather than emitting
 * `aria-current="false"`, which screen readers still announce).
 */
export function NavLink({
  href,
  children,
  className,
  onNavigate,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = isMatch(pathname, href);

  // Spread `aria-current` only when active so the attribute is absent otherwise.
  // Likewise, only spread `onClick`/`className` when defined to satisfy
  // `exactOptionalPropertyTypes`.
  const linkProps: {
    "aria-current"?: "page";
    onClick?: () => void;
    className?: string;
  } = {};
  if (isActive) linkProps["aria-current"] = "page";
  if (onNavigate) linkProps.onClick = onNavigate;
  if (className) linkProps.className = className;

  return (
    <Link href={href} {...linkProps}>
      {children}
    </Link>
  );
}

function isMatch(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  // Match the exact route or any sub-route (e.g. `/tools/usage`).
  return pathname === href || pathname.startsWith(`${href}/`);
}
