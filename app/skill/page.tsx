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
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
          Agent Skill File
        </h1>
        <p className="mt-1.5 text-sm text-[--text-secondary]">
          This is <code className="rounded-md bg-[--bg-surface] px-1.5 py-0.5 text-[--accent-primary-light]" style={{ fontFamily: "var(--font-mono)" }}>skills/dr-scholar/SKILL.md</code> — the
          operating manual the AI agent loads before every conversation. It defines the deep-research
          flow, tool budgets, hard rules and the exact output format. Edit it to change how the agent
          thinks.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-[--accent-danger]/10 p-3 text-sm text-[--accent-danger]">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[--border] bg-[--bg-surface]">
        <div className="flex items-center justify-between border-b border-[--border] px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-[--text-muted]">
            <span className="h-2.5 w-2.5 rounded-full bg-[--accent-danger]/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-[--accent-gold]/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-[--accent-success]/60" />
          </div>
          <span className="text-[11px] text-[--text-muted]" style={{ fontFamily: "var(--font-mono)" }}>
            skills/dr-scholar/SKILL.md
          </span>
        </div>
        <pre
          className="max-h-[70vh] overflow-auto p-5 text-[13px] leading-relaxed text-[--text-secondary]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {skill}
        </pre>
      </div>
    </div>
  );
}
