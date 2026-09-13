"use client";

import { useEffect, useState } from "react";

export default function SkillPage() {
  const [skill, setSkill] = useState<string>("Loading skill file…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/skill")
      .then((r) => r.json())
      .then((d) => setSkill(String(d?.skill ?? "Skill file not found.")))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8">
        <div className="mb-3 text-[8px] uppercase tracking-widest text-[--text-muted]" style={{ fontFamily: "var(--font-display)" }}>
          System
        </div>
        <h1
          className="text-[11px] font-bold tracking-wide text-[--text-primary]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Agent Skill File
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[--text-secondary]">
          This is{" "}
          <code className="rounded border border-[--border] bg-[--bg-surface] px-1.5 py-0.5 text-[11px]" style={{ fontFamily: "var(--font-mono)" }}>
            skills/dr-scholar/SKILL.md
          </code>{" "}
          — the operating manual the AI agent loads before every conversation. Edit it to change how the agent thinks.
        </p>
      </div>

      {error ? (
        <div className="border border-[--accent-danger]/20 bg-[--accent-danger]/5 p-3 text-[12px] text-[--accent-danger]">{error}</div>
      ) : null}

      <div className="overflow-hidden border border-[--border] bg-[--bg-content]">
        <div className="flex items-center justify-between border-b border-[--border] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[--accent-danger]/50" />
            <span className="h-2 w-2 rounded-full bg-[--accent-gold]/50" />
            <span className="h-2 w-2 rounded-full bg-[--accent-success]/50" />
          </div>
          <span className="text-[9px] text-[--text-muted]" style={{ fontFamily: "var(--font-mono)" }}>
            skills/dr-scholar/SKILL.md
          </span>
        </div>
        <pre
          className="max-h-[70vh] overflow-auto p-5 text-[12px] leading-relaxed text-[--text-secondary]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {skill}
        </pre>
      </div>
    </div>
  );
}
