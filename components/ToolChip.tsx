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
    <div className="rounded-lg bg-[--bg-surface] px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="text-[13px]">{icon}</span>
        <span className="font-medium text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
          {ev.name.replace(/_/g, " ")}
        </span>
        {running ? (
          <span className="pulse-dot h-1 w-1 rounded-full bg-[--accent-primary]" />
        ) : failed ? (
          <span className="text-[--accent-danger]">✗</span>
        ) : (
          <span className="text-[--accent-success]">✓</span>
        )}
        <span className="ml-auto truncate text-[--text-muted]">{line}</span>
        {ev.ms ? (
          <span className="text-[10px] text-[--text-muted]">
            {(ev.ms / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      {ev.top?.length ? (
        <div className="mt-2 space-y-1 border-t border-[--border-subtle] pt-2">
          {ev.top.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] text-[--text-secondary]">
              <div className="min-w-0 flex-1">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[--text-primary] underline decoration-[--border] underline-offset-2 hover:decoration-[--text-muted]"
                >
                  {f.title.slice(0, 90)}
                </a>
                {f.deadline ? (
                  <span className="ml-2 text-[10px] text-[--accent-gold]">
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
