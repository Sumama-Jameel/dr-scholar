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
        <header className="sticky top-0 z-20 border-b border-[--border] bg-[--bg-base]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[--accent-primary] to-[--accent-primary-light] text-xs text-white">DS</span>
              Dr<span className="text-[--accent-primary-light]">Scholar</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-[--text-secondary] transition-colors hover:bg-[--bg-surface-hover] hover:text-[--text-primary]">
                Profile
              </Link>
              <Link href="/chat" className="rounded-lg px-3 py-1.5 text-[--text-secondary] transition-colors hover:bg-[--bg-surface-hover] hover:text-[--text-primary]">
                Agent
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-[--text-muted]">
          Dr Scholar · built on free tiers (Gemini free API + keyless search & job APIs) · the agent researches, you verify — always double-check deadlines on official pages before applying.
        </footer>
      </body>
    </html>
  );
}
