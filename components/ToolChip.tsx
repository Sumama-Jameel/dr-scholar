"use client";

export type ToolEvent = {
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  summary?: string;
  ms?: number;
  top?: { title: string; url: string; source?: string; deadline?: string }[];
};

function runningText(ev: ToolEvent): string {
  const a = ev.args ?? {};
  switch (ev.name) {
    case "deep_research":
      return `Researching ${String(a.kind ?? "scholarship")}s…`;
    case "search_web":
      return "Searching…";
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

function doneCount(ev: ToolEvent): string | null {
  const a = ev.args ?? {};
  switch (ev.name) {
    case "deep_research": {
      const m = ev.summary?.match(/^(\d+) findings/);
      return m ? m[1] : null;
    }
    case "search_web": {
      const m = ev.summary?.match(/^(\d+) results/);
      return m ? m[1] : null;
    }
    default:
      return null;
  }
}

export default function ToolChip({ ev }: { ev: ToolEvent }) {
  const running = ev.status === "running";
  const failed = ev.status === "error";
  const count = doneCount(ev);

  if (running) {
    return (
      <div className="flex items-center gap-2 py-1 text-[12px] text-[--text-muted]">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[--accent-primary]" />
        <span>{runningText(ev)}</span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex items-center gap-2 py-1 text-[12px] text-[--accent-danger]">
        <span>✗</span>
        <span>{ev.summary ?? "failed"}</span>
      </div>
    );
  }

  // Done — show count for deep_research and search_web, plain checkmark for others
  if (count) {
    return (
      <div className="py-1 text-[12px]">
        <div className="flex items-center gap-2 text-[--text-muted]">
          <span className="text-[--accent-success]">✓</span>
          <span>{count} {ev.name === "deep_research" ? "findings" : "results"}</span>
        </div>
        {ev.top?.length ? (
          <div className="mt-1.5 ml-5 space-y-0.5">
            {ev.top.map((f, i) => (
              <div key={i} className="text-[12px]">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[--accent-primary] underline decoration-[--accent-primary]/30 underline-offset-2 hover:decoration-[--accent-primary]"
                >
                  {f.title.slice(0, 80)}
                </a>
                {f.deadline ? (
                  <span className="ml-1.5 text-[10px] text-[--accent-gold]">
                    {f.deadline}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // Done — simple checkmark
  return (
    <div className="flex items-center gap-2 py-1 text-[12px] text-[--text-muted]">
      <span className="text-[--accent-success]">✓</span>
      <span>done</span>
    </div>
  );
}
