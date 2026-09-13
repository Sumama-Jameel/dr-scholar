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

function topFindings(
  result: unknown
): { title: string; url: string; source?: string; deadline?: string }[] {
  const r = (result ?? {}) as Record<string, unknown>;
  const findings = (r.findings as Finding[]) ?? [];
  return findings
    .filter((f) => f.url)
    .slice(0, 4)
    .map((f) => ({ title: f.title, url: f.url, source: f.source, deadline: f.deadline }));
}

/** Run a promise with a timeout. Rejects if it takes too long. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
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
  const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  const profile = body.profile ?? null;

  const primary = backends.find((b) => b.available)?.model ?? "gemini-2.5-flash";
  const system = await buildSystemPrompt(profile);
  const executors = createExecutors(profile);

  const messages: { role: "system" | "user" | "assistant"; text: string }[] = [{ role: "system", text: system }];
  for (const m of history.filter((m) => m.text?.trim())) {
    messages.push({ role: m.role as "user" | "assistant", text: m.text.trim().slice(0, 8000) });
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
        const MAX_STEPS = 12;
        const hardDeadline = Date.now() + 270_000; // stay under the 300s function cap

        for (let step = 0; step < MAX_STEPS && Date.now() < hardDeadline; step++) {
          let turn;
          try {
            turn = await streamTurn(messages, toolSpecs, (ev: StreamEvent) => {
              if (ev.type === "text") send({ t: "delta", v: ev.text });
            }, { temperature: 0.4, maxTokens: 8192 });
          } catch (e: unknown) {
            const err = e as Error;
            if (err.message !== "aborted" && !req.signal.aborted) {
              console.warn(`[chat] streamTurn failed at step ${step}:`, err.message);
              send({ t: "error", message: err.message || "model request failed" });
            }
            return;
          }

          if (turn.text.trim()) {
            messages.push({ role: "assistant", text: turn.text });
          }
          if (!turn.toolCalls.length) break; // final answer fully streamed

          const toolResults: { role: "tool"; tool: { name: string; arguments: string }; content: string }[] = [];
          for (const c of turn.toolCalls) {
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
                // Per-tool timeout: search_web gets 25s
                result = await withTimeout(exec(args), 25_000, "search_web");
              } else {
                result = await exec(args);
              }
            } catch (e: unknown) {
              ok = false;
              result = { error: (e as Error).message || "tool failed" };
              console.warn(`[chat] tool ${c.name} failed:`, (e as Error).message);
            }
            const deepOk = c.name === "deep_research" && !(result as { error?: string })?.error;
            send({
              t: "tool-done",
              name: c.name,
              ok,
              summary: summarize(c.name, result),
              ms: Date.now() - t0,
              ...(deepOk ? { top: topFindings(result) } : {}),
            });
            toolResults.push({
              role: "tool",
              tool: { name: c.name, arguments: JSON.stringify(args) },
              content: JSON.stringify(result),
            });
          }

          // Re-feed tool results to the model (Groq-style format)
          for (const tr of toolResults) {
            messages.push({ role: "user", text: `[tool result for ${tr.tool.name}]: ${tr.content}` });
          }
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
