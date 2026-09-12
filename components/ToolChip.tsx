"use client";

export type ToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  summary?: string;
  ms?: number;
  top?: { title: string; url: string; source?: string; deadline?: string }[];
};

const ICONS: Record<string, string> = {
  deep_research: "🔬",
  search_web: "🔎",
  fetch_page: "📄",
  jobs_api: "💼",
  seed_catalog: "🗂️",
  eligibility_check: "✅",
};

function pendingSummary(ev: ToolEvent): string {
  const a = ev.args ?? {};
  switch (ev.name) {
    case "deep_research":
      return `kind=${String(a.kind ?? "?")} · ${((a.queries as string[]) ?? []).length} queries`;
    case "search_web":
      return String(a.query ?? "");
    case "fetch_page":
      return String(a.url ?? "");
    case "jobs_api":
      return String(a.keywords ?? "intern");
    case "seed_catalog":
      return String(a.kind ?? "");
    case "eligibility_check":
      return `${((a.items as unknown[]) ?? []).length} items`;
    default:
      return "running…";
  }
}

export default function ToolChip({ ev }: { ev: ToolEvent }) {
  const icon = ICONS[ev.name] ?? "🛠️";
  const running = ev.status === "running";
  const failed = ev.status === "error";
  const line = ev.summary ?? pendingSummary(ev);
  return (
    <div className="my-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{ev.name}</span>
        {running ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
        ) : failed ? (
          <span className="text-red-400">✗</span>
        ) : (
          <span className="text-emerald-400">✓</span>
        )}
        <span className="ml-auto truncate text-slate-300">{line}</span>
        {ev.ms ? <span className="text-slate-500">{(ev.ms / 1000).toFixed(1)}s</span> : null}
      </div>
      {ev.top?.length ? (
        <div className="mt-1.5 space-y-1">
          {ev.top.map((f, i) => (
            <div key={i} className="text-xs text-slate-400">
              <span className="mr-1">
                {f.source === "catalog" ? "🗂️" : f.source === "jobs-api" ? "💼" : "🔗"}
              </span>
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-300/90 hover:text-indigo-200"
              >
                {f.title.slice(0, 90)}
              </a>
              {f.deadline ? <span className="ml-2 text-amber-300/80">⏳ {f.deadline}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
