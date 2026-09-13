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
        <header className="sticky top-0 z-20 border-b border-[--border] bg-white/90 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[--accent-primary] text-[11px] font-bold text-white">DS</span>
              DrScholar
            </Link>
            <nav className="flex items-center gap-1 text-[13px]">
              <Link href="/" className="rounded-md px-3 py-1.5 text-[--text-muted] transition-colors hover:text-[--text-primary]">
                Profile
              </Link>
              <Link href="/chat" className="rounded-md px-3 py-1.5 text-[--text-muted] transition-colors hover:text-[--text-primary]">
                Agent
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
      </body>
    </html>
  );
}
