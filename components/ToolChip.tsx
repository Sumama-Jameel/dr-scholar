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

const STATUS_COLORS = {
  running: { border: "border-l-[--accent-primary]", bg: "bg-[--accent-primary]/5" },
  done: { border: "border-l-[--accent-success]", bg: "bg-[--accent-success]/5" },
  error: { border: "border-l-[--accent-danger]", bg: "bg-[--accent-danger]/5" },
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
  const succeeded = ev.status === "done";
  const line = ev.summary ?? pendingSummary(ev);
  const colors = STATUS_COLORS[ev.status];

  return (
    <div className={`my-1.5 rounded-lg border border-[--border] border-l-[3px] ${colors.border} ${colors.bg} px-3.5 py-2.5 text-xs`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[--bg-surface] text-sm">
          {icon}
        </span>
        <span className="font-medium text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
          {ev.name.replace(/_/g, " ")}
        </span>
        {running ? (
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[--accent-primary]" />
        ) : failed ? (
          <span className="text-[--accent-danger]">✗</span>
        ) : (
          <span className="text-[--accent-success]">✓</span>
        )}
        <span className="ml-auto truncate text-[--text-secondary]">{line}</span>
        {ev.ms ? (
          <span className="rounded-full bg-[--bg-surface] px-2 py-0.5 text-[10px] text-[--text-muted]">
            {(ev.ms / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      {ev.top?.length ? (
        <div className="mt-2 space-y-1.5 border-t border-[--border] pt-2">
          {ev.top.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-[--text-secondary]">
              <span className="mt-0.5 text-[10px]">
                {f.source === "catalog" ? "🗂️" : f.source === "jobs-api" ? "💼" : "🔗"}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[--accent-primary-light] underline decoration-[--accent-primary]/30 hover:decoration-[--accent-primary]"
                >
                  {f.title.slice(0, 90)}
                </a>
                {f.deadline ? (
                  <span className="ml-2 rounded-full bg-[--accent-gold]/10 px-1.5 py-0.5 text-[10px] text-[--accent-gold]">
                    {f.deadline}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
