"use client";

import { useEffect, useState } from "react";

export type ToolFinding = {
  title: string;
  url: string;
  source?: string;
  deadline?: string;
  funding?: string;
};

export type ToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  summary?: string;
  ms?: number;
  top?: ToolFinding[];
};

function runningText(ev: ToolEvent): string {
  const a = ev.args ?? {};
  switch (ev.name) {
    case "deep_research":
      return `Researching ${String(a.kind ?? "scholarship")}s…`;
    case "search_web":
      return "Searching the web…";
    case "fetch_page":
      return "Reading page…";
    case "jobs_api":
      return "Finding listings…";
    case "seed_catalog":
      return "Checking catalog…";
    case "eligibility_check":
      return "Checking eligibility…";
    default:
      return "Working…";
  }
}

function countFrom(ev: ToolEvent): number | null {
  const m = ev.summary?.match(/^(\d+) (findings|results|listings|programs)/);
  return m ? Number(m[1]) : null;
}

function nounFor(name: string): string {
  switch (name) {
    case "deep_research":
      return "findings";
    case "search_web":
      return "results";
    case "jobs_api":
      return "listings";
    case "seed_catalog":
      return "programs";
    default:
      return "results";
  }
}

function fmtMs(ms?: number): string {
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  web: {
    label: "WEB",
    cls: "border-(--accent-primary)/30 bg-(--accent-primary-light) text-(--accent-primary)",
  },
  catalog: {
    label: "CATALOG",
    cls: "border-(--accent-success)/30 bg-(--accent-success)/10 text-(--accent-success)",
  },
  "jobs-api": {
    label: "JOBS",
    cls: "border-(--accent-gold)/40 bg-(--accent-gold)/10 text-(--accent-gold)",
  },
};

function badgeFor(source?: string): { label: string; cls: string } {
  return (
    SOURCE_BADGE[source ?? ""] ?? {
      label: (source ?? "WEB").toUpperCase(),
      cls: "border-(--border-strong) bg-(--bg-surface) text-(--text-muted)",
    }
  );
}

function FindingCard({ f }: { f: ToolFinding }) {
  const badge = badgeFor(f.source);
  return (
    <div className="rounded-lg border border-(--border) bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <a
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-medium leading-snug text-(--text-primary) hover:text-(--accent-primary) hover:underline"
        >
          {f.title.length > 90 ? f.title.slice(0, 87) + "…" : f.title}
        </a>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold tracking-wider ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {f.deadline ? (
          <span className="rounded border border-(--accent-gold)/40 bg-(--accent-gold)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--accent-gold)">
            ⏱ Due: {f.deadline}
          </span>
        ) : null}
        {f.funding ? (
          <span className="rounded border border-(--accent-success)/40 bg-(--accent-success)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--accent-success)">
            {f.funding}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function ToolChip({ ev }: { ev: ToolEvent }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (ev.status !== "running") return;
    const t0 = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [ev.status]);

  const count = countFrom(ev);
  const shown = ev.top?.slice(0, 4) ?? [];
  const topLen = ev.top?.length ?? 0;
  const more =
    count !== null && count > shown.length
      ? count - shown.length
      : topLen > 4
        ? topLen - 4
        : 0;

  if (ev.status === "running") {
    return (
      <div className="flex items-center gap-2 py-1 text-[12px] text-(--text-muted)">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-(--accent-primary)" />
        <span>{runningText(ev)}</span>
        {elapsed > 0 ? <span className="tabular-nums">{elapsed}s</span> : null}
      </div>
    );
  }

  if (ev.status === "error") {
    return (
      <div className="flex items-center gap-2 py-1 text-[12px] text-(--accent-danger)">
        <span>✗</span>
        <span>{ev.summary ?? "failed"}</span>
      </div>
    );
  }

  // Done
  const label =
    count !== null
      ? `${count} ${nounFor(ev.name)}`
      : ev.summary
        ? ev.summary.length > 60 ? ev.summary.slice(0, 57) + "…" : ev.summary
        : "done";
  const duration = fmtMs(ev.ms);

  return (
    <div className="py-1">
      <div className="flex items-center gap-2 text-[12px] text-(--text-muted)">
        <span className="text-(--accent-success)">✓</span>
        <span>{label}</span>
        {duration ? <span className="tabular-nums">{duration}</span> : null}
      </div>
      {shown.length ? (
        <div className="mt-2 space-y-2">
          {shown.map((f, i) => (
            <FindingCard key={i} f={f} />
          ))}
          {more > 0 ? (
            <p className="text-[10px] text-(--text-muted)">
              +{more} more in the report below
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
