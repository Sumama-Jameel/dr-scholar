import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dr Scholar — AI Scholarship & Internship Scout",
  description:
    "Free AI agent that deep-researches real scholarships and internships matched to your profile. Built for students, runs on free tiers only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-[--border] bg-[--bg-content]/90 backdrop-blur-sm">
          <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2.5 text-[--text-primary]">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[--accent-primary] text-[8px] font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
                DS
              </span>
              <span className="text-[10px] font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
                DrScholar
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-[11px]">
              <Link href="/" className="rounded px-3 py-1.5 text-[--text-muted] transition-colors hover:text-[--text-primary]">
                Profile
              </Link>
              <Link href="/chat" className="rounded px-3 py-1.5 text-[--text-muted] transition-colors hover:text-[--text-primary]">
                Agent
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl">{children}</main>
      </body>
    </html>
  );
}
