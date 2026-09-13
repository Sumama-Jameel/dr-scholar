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
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
          Agent Skill File
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[--text-secondary]">
          This is{" "}
          <code className="rounded bg-[--bg-surface] px-1.5 py-0.5 text-[12px]" style={{ fontFamily: "var(--font-mono)" }}>
            skills/dr-scholar/SKILL.md
          </code>{" "}
          — the operating manual the AI agent loads before every conversation. Edit it to change how the agent thinks.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-[--accent-danger]/5 p-3 text-[13px] text-[--accent-danger]">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[--border]">
        <div className="flex items-center justify-between border-b border-[--border] bg-[--bg-surface] px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[--accent-danger]/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-[--accent-gold]/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-[--accent-success]/50" />
          </div>
          <span className="text-[11px] text-[--text-muted]" style={{ fontFamily: "var(--font-mono)" }}>
            skills/dr-scholar/SKILL.md
          </span>
        </div>
        <pre
          className="max-h-[70vh] overflow-auto bg-white p-5 text-[13px] leading-relaxed text-[--text-secondary]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {skill}
        </pre>
      </div>
    </div>
  );
}
