import type { Metadata } from "next";
import Link from "next/link";
import DotGrid from "@/components/DotGrid";
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
        <DotGrid />
        <header className="sticky top-0 z-20 border-b-2 border-(--border-strong) bg-(--bg-content)/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-3 text-(--text-primary)">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-(--accent-primary) text-[11px] font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
                DS
              </span>
              <span className="text-[12px] font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>
                DrScholar
              </span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link href="/" className="btn btn-sm">
                Profile
              </Link>
              <Link href="/chat" className="btn btn-sm">
                Agent
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl bg-(--bg-content)">{children}</main>
      </body>
    </html>
  );
}
