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
      <h1 className="mb-1 text-2xl font-bold text-white">🧠 Agent Skill File</h1>
      <p className="mb-6 text-sm text-slate-400">
        This is <code className="rounded bg-slate-800 px-1">skills/dr-scholar/SKILL.md</code> — the
        operating manual the AI agent loads before every conversation. It defines the deep-research
        flow, tool budgets, hard rules and the exact output format. Edit it to change how the agent
        thinks.
      </p>
      {error ? (
        <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>
      ) : null}
      <pre className="max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-slate-900/70 p-5 text-[13px] leading-relaxed text-slate-300">
        {skill}
      </pre>
    </div>
  );
}
