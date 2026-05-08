import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Session Review",
  description: "Local-first review tool for AI agent session transcripts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-text antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
