import { buildSystemPrompt } from "@/lib/prompt";
import { createExecutors, TOOL_DECLARATIONS } from "@/lib/tools";
import type { Finding } from "@/lib/deep-research";
import type { ProfileInput } from "@/lib/profile";
import { streamTurn, llmBackends, type ToolSpec, type StreamEvent } from "@/lib/llm";

export const runtime = "nodejs";
// Vercel Hobby (Fluid compute) allows up to 300s — deep research needs it.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ClientMessage = { role: "user" | "assistant"; text: string };

/** Compact one-line summary of a tool result for the UI chips. */
function summarize(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (r.error) return `error: ${String(r.error).slice(0, 90)}`;
  switch (name) {
    case "deep_research": {
      const stats = (r.stats ?? {}) as Record<string, number>;
      const findings = (r.findings as Finding[]) ?? [];
      return `${findings.length} findings · ${stats.pagesFetched ?? 0} pages read · ${(
        (stats.elapsedMs ?? 0) / 1000
      ).toFixed(0)}s`;
    }
    case "search_web":
      return `${((r.hits as unknown[]) ?? []).length} results`;
    case "fetch_page":
      return r.title ? `read: ${String(r.title).slice(0, 70)}` : "read";
    case "jobs_api":
      return `${r.count ?? 0} listings (${((r.sources as string[]) ?? []).join(", ")})`;
    case "seed_catalog":
      return `${r.count ?? 0} curated programs`;
    case "eligibility_check": {
      const v = (r.verdicts as { verdict?: string }[]) ?? [];
      return `${v.length} checked · ${v.filter((x) => x.verdict === "likely").length} likely`;
    }
    default:
      return "done";
  }
}

type ToolFinding = {
  title: string;
  url: string;
  source?: string;
  deadline?: string;
  funding?: string;
};

function topFindings(result: unknown, max = 8): ToolFinding[] {
  const r = (result ?? {}) as Record<string, unknown>;
  const findings = r.findings as Finding[] | undefined;
  if (Array.isArray(findings)) {
    return findings
      .filter((f) => f.url)
      .slice(0, max)
      .map((f) => ({
        title: f.title,
        url: f.url,
        source: f.source,
        deadline: f.deadline,
        funding: f.funding,
      }));
  }
  const hits = r.hits as { title?: string; url?: string }[] | undefined;
  if (Array.isArray(hits) && hits.length) {
    return hits
      .filter((h) => h.url)
      .slice(0, max)
      .map((h) => ({ title: h.title ?? "result", url: h.url as string, source: "web" }));
  }
  const jobs = r.jobs as { title?: string; url?: string }[] | undefined;
  if (Array.isArray(jobs) && jobs.length) {
    return jobs
      .filter((j) => j.url)
      .slice(0, max)
      .map((j) => ({ title: j.title ?? "listing", url: j.url as string, source: "jobs-api" }));
  }
  const items = r.items as { name?: string; url?: string; funding?: string }[] | undefined;
  if (Array.isArray(items) && items.length) {
    return items
      .filter((i) => i.url)
      .slice(0, max)
      .map((i) => ({
        title: i.name ?? "program",
        url: i.url as string,
        source: "catalog",
        funding: i.funding,
      }));
  }
  return [];
}

/**
 * Compact a tool result into a small one-line-per-item digest before re-feeding it
 * to the LLM. deep_research alone can carry ~15-20KB of JSON (32 findings with full
 * snippets + engine statuses + stats), which blows past free-tier context in the
 * synthesis step — this shrinks it ~90% so synthesis succeeds first try.
 */
function compactToolResult(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (r.error) return `error: ${String(r.error).slice(0, 120)}`;

  switch (name) {
    case "deep_research": {
      const findings = (r.findings as Finding[]) ?? [];
      const stats = (r.stats ?? {}) as Record<string, number | string>;
      const eMs = typeof stats.elapsedMs === "number" ? stats.elapsedMs : 0;
      const note = stats.note ? ` | note:${stats.note}` : "";
      const lines = findings.slice(0, 10).map(
        (f, i) =>
          `${i + 1}. ${f.title} [src:${f.source}]${f.deadline ? ` | deadline:${f.deadline}` : ""}${f.funding ? ` | funding:${f.funding}` : ""} | ${f.url}`
      );
      return [
        `deep_research: ${findings.length} findings, ${stats.pagesFetched ?? 0} pages, ${Math.round(eMs / 1000)}s${note}`,
        ...lines,
      ].join("\n");
    }
    case "search_web": {
      const hits = (r.hits as { title?: string; url?: string }[]) ?? [];
      const lines = hits.slice(0, 8).map((h, i) => `${i + 1}. ${h.title ?? "?"} | ${h.url ?? "?"}`);
      return [`search_web: ${hits.length} results`, ...lines].join("\n");
    }
    case "jobs_api": {
      const jobs = (r.jobs as { title?: string; url?: string; org?: string; location?: string }[]) ?? [];
      const sources = ((r.sources as string[]) ?? []).join(", ");
      const lines = jobs
        .slice(0, 8)
        .map((j, i) => `${i + 1}. ${j.title ?? "?"} | ${[j.org, j.location].filter(Boolean).join(", ")} | ${j.url ?? "?"}`);
      return [`jobs_api: ${r.count ?? jobs.length} listings${sources ? ` from ${sources}` : ""}`, ...lines].join("\n");
    }
    case "seed_catalog": {
      const items = (r.items as { name?: string; url?: string; funding?: string }[]) ?? [];
      const lines = items
        .slice(0, 8)
        .map((i, j) => `${j + 1}. ${i.name ?? "?"}${i.funding ? ` [funding:${i.funding}]` : ""} | ${i.url ?? "?"}`);
      return [`seed_catalog: ${r.count ?? items.length} curated programs`, ...lines].join("\n");
    }
    case "fetch_page": {
      const excerpt = String(r.excerpt ?? "").replace(/\s+/g, " ").slice(0, 350);
      return [
        `fetch_page: ${String(r.title ?? r.url ?? "page")}`,
        ...(r.deadline ? [`deadline: ${r.deadline}`] : []),
        ...(r.funding ? [`funding: ${r.funding}`] : []),
        `excerpt: ${excerpt}`,
      ].join(" | ");
    }
    case "eligibility_check": {
      const verdicts = (r.verdicts as { title?: string; verdict?: string; reason?: string }[]) ?? [];
      const lines = verdicts
        .slice(0, 8)
        .map((v, i) => `${i + 1}. ${v.title ?? "?"}: ${v.verdict ?? "?"}${v.reason ? ` — ${v.reason}` : ""}`);
      return [`eligibility_check: ${verdicts.length} items`, ...lines].join("\n");
    }
    default:
      return `${name}: ${JSON.stringify(result).slice(0, 500)}`;
  }
}

/**
 * Clean markdown digest built from structured tool results. Used when the model
 * dies at synthesis (rate limit / token cap) — NEVER dump raw tool JSON to the user.
 */
function buildFallbackDigest(log: { name: string; ok: boolean; result: unknown }[]): string {
  const seen = new Set<string>();
  const picks: ToolFinding[] = [];
  for (const e of log) {
    if (!e.ok || e.name === "fetch_page" || e.name === "eligibility_check") continue;
    for (const f of topFindings(e.result, 40)) {
      if (!f.url || seen.has(f.url)) continue;
      seen.add(f.url);
      picks.push(f);
      if (picks.length >= 15) break;
    }
    if (picks.length >= 15) break;
  }

  const out: string[] = [];
  out.push(
    "Research completed, but I hit a temporary API rate limit while writing the summary — here's the report generated from the raw findings:"
  );
  out.push("");
  if (picks.length === 0) {
    out.push("No structured findings were available. Please try again in a moment.");
  } else {
    out.push("## Top opportunities");
    out.push("");
    picks.forEach((f, i) => {
      const meta = [
        f.source ? `*${f.source.toUpperCase()}*` : "",
        f.deadline ? `deadline: **${f.deadline}**` : "",
        f.funding ? `funding: **${f.funding}**` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      out.push(`${i + 1}. **[${f.title}](${f.url})** ${meta}`);
    });
    out.push("");
    out.push("_Always verify deadlines on the official pages — the agent was interrupted before writing the plan._");
  }
  return out.join("\n");
}

/** Run a promise with a timeout. Rejects if it takes too long. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  // If the timeout wins the race, the loser's later rejection must not surface
  // as an unhandled rejection (crashes the serverless function mid-stream).
  // The race itself still propagates the loser's error when it arrives first.
  void p.catch(() => {});
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

export async function POST(req: Request) {
  const backends = llmBackends();
  if (!backends.some((b) => b.available)) {
    return Response.json(
      {
        error: "NO_BACKEND",
        message:
          "No LLM backend configured. Set GROQ_API_KEY (Qwen) or GEMINI_API_KEY/GOOGLE_API_KEY (Gemini).",
        backends,
      },
      { status: 500 }
    );
  }

  let body: { messages?: ClientMessage[]; profile?: ProfileInput } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  // Tight caps: each request must fit tiny free-tier token budgets
  // (Groq free = 7,000 input tokens/MINUTE). Last 6 messages, 1.5k chars each.
  const history = Array.isArray(body.messages) ? body.messages.slice(-6) : [];
  const profile = body.profile ?? null;

  const primary = backends.find((b) => b.available)?.model ?? "gemini-2.5-flash";
  const system = await buildSystemPrompt(profile);
  const executors = createExecutors(profile);

  const messages: { role: "system" | "user" | "assistant"; text: string }[] = [{ role: "system", text: system }];
  for (const m of history.filter((m) => m.text?.trim())) {
    messages.push({ role: m.role as "user" | "assistant", text: m.text.trim().slice(0, 1500) });
  }
  if (!messages.some((m) => m.role === "user")) {
    messages.push({ role: "user", text: "Do a full deep scan for me (scholarships + internships)." });
  }

  const toolSpecs: ToolSpec[] = TOOL_DECLARATIONS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      req.signal.addEventListener("abort", () => {
        closed = true;
      });
      try {
        send({ t: "meta", model: primary });
        const MAX_STEPS = 6;
        const PER_TURN_TIMEOUT_MS = 90_000; // no single LLM turn may eat the whole budget
        const MAX_TOOL_ROUNDS = 2; // research → verify/screen → force synthesis
        const hardDeadline = Date.now() + 270_000; // stay under the 300s function cap

        const toolLog: { name: string; ok: boolean; args: Record<string, unknown>; result: unknown }[] = [];
        let toolRounds = 0;
        let reportSent = false;
        let continued = false; // one bounded continuation for token-capped reports

        for (let step = 0; step < MAX_STEPS && Date.now() < hardDeadline; step++) {
          // After the tool rounds run out — or once research exists and time is
          // running low — REMOVE the tools entirely so the model physically
          // cannot keep searching and must write the report instead.
          const toolsForTurn =
            toolRounds >= MAX_TOOL_ROUNDS ||
            (toolLog.length > 0 && Date.now() > hardDeadline - 45_000)
              ? undefined
              : toolSpecs;
          let turn;
          try {
            turn = await withTimeout(
              streamTurn(messages, toolsForTurn, (ev: StreamEvent) => {
                if (ev.type === "text") send({ t: "delta", v: ev.text });
              }, { temperature: 0.4, maxTokens: 8192 }),
              PER_TURN_TIMEOUT_MS,
              `streamTurn step ${step}`
            );
          } catch (e: unknown) {
            const err = e as Error;
            if (err.message !== "aborted" && !req.signal.aborted) {
              console.warn(`[chat] streamTurn failed at step ${step}:`, err.message);
              // Tools already ran — emit a clean digest built from the structured
              // results instead of dumping raw tool JSON into the chat.
              if (toolLog.length > 0) {
                send({ t: "delta", v: buildFallbackDigest(toolLog) });
                reportSent = true;
              } else {
                send({ t: "error", message: err.message || "model request failed" });
              }
            }
            break;
          }

          if (turn.text.trim()) {
            messages.push({ role: "assistant", text: turn.text });
          }
          if (!turn.toolCalls.length) {
            if (turn.text.trim() && turn.finishReason !== "length") {
              reportSent = true; // final answer fully streamed
              break;
            }
            if (turn.text.trim() && turn.finishReason === "length") {
              // Report hit the output-token cap mid-sentence — continue exactly
              // where it left off (once, only while real time remains).
              if (!continued && Date.now() < hardDeadline - 20_000) {
                continued = true;
                messages.push({
                  role: "user",
                  text: "[system]: Your report was cut off mid-sentence by the output limit. Continue EXACTLY where you left off — same section, same style, no repeated content, no preamble.",
                });
                continue;
              }
              // No time for a continuation, but partial text was streamed.
              reportSent = true;
              break;
            }
            // Empty response (safety block / model refusal) — never mistake it
            // for a report; fall through so the final-synthesis / digest paths run.
            continue;
          }

          toolRounds++;
          const toolResults: { role: "tool"; tool: { name: string; arguments: string }; content: string }[] = [];
          // Run every tool in this step CONCURRENTLY — two deep_research sweeps
          // drop from ~220s to ~110s wall time. Results emit in original order.
          const executed = await Promise.allSettled(turn.toolCalls.map(async (c) => {
            const args = c.args ?? {};
            send({ t: "tool", name: c.name, args });
            const t0 = Date.now();
            let result: unknown;
            let ok = true;
            try {
              const exec = executors[c.name];
              if (!exec) {
                result = { error: `unknown tool: ${c.name}` };
              } else if (c.name === "search_web") {
                result = await withTimeout(exec(args), 25_000, "search_web");
              } else if (c.name === "deep_research") {
                // internal budget is ≤110s; cap slightly above to guarantee progress
                result = await withTimeout(exec(args), 125_000, "deep_research");
              } else {
                result = await exec(args);
              }
            } catch (e: unknown) {
              ok = false;
              result = { error: (e as Error).message || "tool failed" };
              console.warn(`[chat] tool ${c.name} failed:`, (e as Error).message);
            }
            return { name: c.name, args, t0, ok, result };
          }));

          for (const e of executed) {
            if (e.status === "rejected") continue;
            const { name, args, t0, ok, result } = e.value;
            const failed = Boolean((result as { error?: string })?.error);
            send({
              t: "tool-done",
              name,
              ok: ok && !failed,
              summary: summarize(name, result),
              ms: Date.now() - t0,
              top: failed ? undefined : topFindings(result),
            });
            toolLog.push({ name, ok: ok && !failed, args, result });
            toolResults.push({
              role: "tool",
              tool: { name, arguments: JSON.stringify(args) },
              content: compactToolResult(name, result),
            });
          }

          // Re-feed tool results to the model (Groq-style format)
          for (const tr of toolResults) {
            messages.push({ role: "user", text: `[tool result for ${tr.tool.name}]: ${tr.content}` });
          }
          messages.push({
            role: "user",
            text:
              "[research-progress]: All the research data you need is above. If you have 3+ solid matches per category, STOP — do not call more tools — and write the final Phase-5 report now, in the exact skill format.",
          });
        }

        // Last resort: if the loop ended without a report, try ONE final synthesis
        // pass with tools disabled (only while real time remains).
        if (toolLog.length > 0 && !reportSent && Date.now() < hardDeadline - 10_000) {
          try {
            const finalTurn = await withTimeout(
              streamTurn(messages, undefined, (ev: StreamEvent) => {
                if (ev.type === "text") send({ t: "delta", v: ev.text });
              }, { temperature: 0.4, maxTokens: 8192 }),
              Math.min(60_000, Math.max(10_000, hardDeadline - Date.now() - 5_000)),
              "final synthesis"
            );
            if (finalTurn.text.trim()) reportSent = true;
          } catch (e: unknown) {
            console.warn("[chat] final synthesis failed:", (e as Error).message);
          }
        }

        // Hard guarantee: research always ends in a visible report. If the loop
        // exited without a final answer (deadline/cap/failure), emit the digest.
        if (toolLog.length > 0 && !reportSent) {
          console.warn("[chat] no final report streamed — serving structured digest fallback");
          send({ t: "delta", v: buildFallbackDigest(toolLog) });
        }

        send({ t: "done" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
