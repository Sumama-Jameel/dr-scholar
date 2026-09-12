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
      <body className="min-h-screen text-slate-200 antialiased">
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-bold tracking-tight text-white">
              🩺 Dr<span className="text-indigo-400">Scholar</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-slate-800/60">
                Profile
              </Link>
              <Link href="/chat" className="rounded-md px-3 py-1.5 hover:bg-slate-800/60">
                Agent
              </Link>
              <Link href="/skill" className="rounded-md px-3 py-1.5 hover:bg-slate-800/60">
                Skill file
              </Link>
              <a
                href="/student-profile-template.md"
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-3 py-1.5 hover:bg-slate-800/60"
              >
                Template
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-xs text-slate-500">
          Dr Scholar · built on free tiers (Gemini free API + keyless search & job APIs) · the agent
          researches, you verify — always double-check deadlines on official pages before applying.
        </footer>
      </body>
    </html>
  );
}
