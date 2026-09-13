"use client";

export type ToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  summary?: string;
  ms?: number;
  top?: { title: string; url: string; source?: string; deadline?: string }[];
};

const TOOL_LABELS: Record<string, string> = {
  deep_research: "Deep research",
  search_web: "Web search",
  fetch_page: "Fetch page",
  jobs_api: "Jobs API",
  seed_catalog: "Catalog",
  eligibility_check: "Eligibility",
};

let toolCounter = 0;
const toolNum = () => `${String(++toolCounter).padStart(2, "0")}`;

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
  const label = TOOL_LABELS[ev.name] ?? ev.name.replace(/_/g, " ");
  const running = ev.status === "running";
  const failed = ev.status === "error";
  const line = ev.summary ?? pendingSummary(ev);

  return (
    <div className="border-2 border-[--border-strong] bg-[--bg-content] px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2.5">
        <span
          className={`text-[9px] font-bold ${running ? "text-[--accent-primary]" : "text-[--text-muted]"}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {toolNum()}
        </span>
        <span className="font-medium text-[--text-primary]">{label}</span>
        {running ? (
          <span className="pulse-dot h-1 w-1 rounded-full bg-[--accent-primary]" />
        ) : failed ? (
          <span className="text-[--accent-danger]">✗</span>
        ) : (
          <span className="text-[--accent-success]">✓</span>
        )}
        <span className="ml-auto truncate text-[--text-muted]">{line}</span>
        {ev.ms ? (
          <span className="text-[9px] text-[--text-muted]">
            {(ev.ms / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      {ev.top?.length ? (
        <div className="mt-2 space-y-1 border-t border-[--border] pt-2">
          {ev.top.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-[--text-secondary]">
              <div className="min-w-0 flex-1">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[--accent-primary] underline decoration-[--accent-primary]/30 underline-offset-2 hover:decoration-[--accent-primary]"
                >
                  {f.title.slice(0, 90)}
                </a>
                {f.deadline ? (
                  <span className="ml-2 text-[9px] text-[--accent-gold]">
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
