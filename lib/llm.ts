/**
 * lib/llm.ts — multi-backend LLM router (dependency-free).
 *
 * Priority:
 *   1. Google Gemini 2.5 Flash via Gemini REST  (env: GEMINI_API_KEY / GOOGLE_API_KEY)
 *      — primary: most generous free tier (~250k tokens/min vs Groq 7k ITPM)
 *   2. Qwen 3.8 27B via Groq OpenAI-compatible  (env: GROQ_API_KEY)
 *   3. Fallback: Gemini 3.1 Pro preview         (same gemini key)
 *
 * Reliability:
 *   - Per-provider retry on 429/rate-limit (single retry, 3s backoff)
 *   - Per-fetch timeout (45s) to prevent hanging
 *   - One cascade re-try if all providers fail (3s wait), then a clear error
 */

import { extractTitle } from "./html";

export type ChatMsg = { role: "user" | "assistant" | "system"; text: string };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // object schema
};

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown>; id?: string }
  | { type: "tool_call_done"; id?: string }
  | { type: "finish"; finishReason?: "stop" | "tool_calls" | "length" | "error"; error?: string };

export type StreamTurnResult = {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown>; id?: string }[];
  finishReason?: "stop" | "tool_calls" | "length" | "error";
  backend: string;
  model: string;
};

export type JsonResult = {
  json: unknown;
  text: string;
  backend: string;
  model: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimit(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return /429|rate.?limit|too.many|throttl/i.test(msg);
}

/** Groq/Gemini 429 bodies include a hint like "try again in 10.44s" — honor it
 *  (plus a small margin). Default 11s, which clears a 7k-ITPM token window. */
function rateLimitRetryMs(err: unknown): number {
  const msg = (err as Error)?.message ?? "";
  const m = msg.match(/try again in ([\d.]+)s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 11_000;
}

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

/* ----------------------- backend discovery ----------------------- */

export type BackendDesc = {
  name: string;
  model: string;
  available: boolean;
  reason?: string;
};

export function llmBackends(): BackendDesc[] {
  const out: BackendDesc[] = [];

  if (geminiKey()) {
    out.push({ name: "gemini", model: geminiModel(), available: true });
    out.push({ name: "gemini", model: "gemini-3.1-pro-preview", available: true });
  } else {
    out.push({ name: "gemini", model: geminiModel(), available: false, reason: "no gemini key" });
  }

  if (process.env.GROQ_API_KEY) {
    out.push({ name: "groq", model: "qwen/qwen3.8-27b", available: true });
  } else {
    out.push({ name: "groq", model: "qwen/qwen3.8-27b", available: false, reason: "GROQ_API_KEY not set" });
  }

  return out;
}

/* ----------------------- helpers ----------------------- */

function mergeArgs(base: Record<string, unknown>, frag: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(frag);
    if (typeof parsed === "object" && parsed !== null) {
      return { ...base, ...parsed };
    }
  } catch {
    const joined = Object.keys(base).length
      ? JSON.stringify(base).replace(/\}$/, "," + frag + "}")
      : "{" + frag + "}";
    try {
      const merged = JSON.parse(joined);
      if (typeof merged === "object" && merged !== null) return merged;
    } catch {
      /* keep base */
    }
  }
  return base;
}

function mapFinish(r: string): "stop" | "tool_calls" | "length" | "error" {
  if (r === "tool_calls") return "tool_calls";
  // Gemini reports the output-token cap as "MAX_TOKENS" (OpenAI-style "length").
  // Treating it as "stop" silently accepted truncated reports.
  if (r === "length" || r === "MAX_TOKENS") return "length";
  return "stop";
}

/** Map JSON-Schema `type` values to Gemini's canonical UPPERCASE enum names. */
const TYPE_MAP: Record<string, string> = {
  object: "OBJECT",
  string: "STRING",
  array: "ARRAY",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  number: "NUMBER",
  OBJECT: "OBJECT",
  STRING: "STRING",
  ARRAY: "ARRAY",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  NUMBER: "NUMBER",
};

/** Recursively lowercase all `type` values in a JSON Schema tree. */
function normalizeSchema(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeSchema);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "type" && typeof v === "string" && TYPE_MAP[v]) {
      out[k] = TYPE_MAP[v];
    } else {
      out[k] = normalizeSchema(v);
    }
  }
  return out;
}

/** Try a provider call with a single fast retry on rate-limit (3s backoff).
 *  `stopRetrying` lets callers abandon retries once content has already been streamed
 *  to the client (re-streaming would duplicate the partial answer on screen). */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 1,
  stopRetrying?: () => boolean
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (isRateLimit(err) && attempt < maxRetries && !stopRetrying?.()) {
        const delay = rateLimitRetryMs(err);
        console.warn(`[llm] ${label} rate-limited, retrying once in ${Math.round(delay / 1000)}s…`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

/* ----------------------- groq (Qwen) ----------------------- */

const GROQ_BASE = "https://api.groq.com/openai/v1";
// Connect-only guard: this bounds time-to-FIRST-BYTE, not the whole generation.
// A long agent turn legitimately streams for 60-120s; aborting at 45s killed
// reports mid-sentence. Body reading is bounded by the route's own deadlines.
const LLM_CONNECT_TIMEOUT_MS = 30_000;

/** Fetch that aborts only if response HEADERS don't arrive in time. Once headers
 *  are in, the connection is healthy and the stream may run as long as needed.
 *
 *  The optional `signal` lets a caller cancel the request mid-body (e.g. when the
 *  route's turn-timeout fires while `reader.read()` is blocked on a stalled SSE
 *  stream). Without it we'd `void p.catch(() => {})` the promise and leave the
 *  in-flight socket/reader live on the Node event loop, which on Vercel keeps the
 *  response channel open and freezes the browser reader forever ("Writing your
 *  report…" with no end). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function streamTurn(
  messages: ChatMsg[],
  tools: ToolSpec[] | undefined,
  onEvent: (ev: StreamEvent) => void,
  opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {}
): Promise<StreamTurnResult> {
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 8192;
  const signal = opts.signal;
  const errors: string[] = [];

  // Streaming guard: once any text/tool event has been streamed to the client, a
  // retry would re-answer on top of the partial reply (duplicated/garbled text).
  // After the first emission we stop retrying this provider AND skip the cascade,
  // propagating the error so the route can fall back to a clean digest instead.
  let emitted = false;
  const guardedOnEvent = (ev: StreamEvent) => {
    emitted = true;
    onEvent(ev);
  };
  const stopRetrying = () => emitted;

  // Try the full cascade up to 2 times (global retry for transient failures)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      console.warn("[llm] all providers failed, retrying entire cascade once in 3s…");
      await sleep(3_000);
    }

    // PRIMARY: Gemini 2.5 Flash — by far the most generous free tier
    // (~250k tokens/min vs Groq's 7,000 input tokens/min), so it can absorb
    // multi-round agent turns without 429ing on every request.
    if (geminiKey()) {
      try {
        return await withRetry(
                    () => geminiStream(geminiModel(), messages, tools, { temperature, maxTokens, signal }, guardedOnEvent),
          `gemini:${geminiModel()}`,
          1,
          stopRetrying
        );
      } catch (e: unknown) {
        const msg = (e as Error).message;
        errors.push("gemini 2.5-flash: " + msg);
        console.warn("[llm] gemini 2.5-flash failed:", msg);
        // Partial answer already streamed — re-streaming would duplicate it.
        if (emitted) throw new Error("gemini 2.5-flash stream interrupted after partial output: " + msg);
      }
    }

    // FALLBACK: Groq Qwen (tight free tier: 7,000 input tokens/minute).
    if (process.env.GROQ_API_KEY) {
      try {
        return await withRetry(
                    () => groqStream(messages, tools, { temperature, maxTokens, signal }, guardedOnEvent),
          "groq",
          1,
          stopRetrying
        );
      } catch (e: unknown) {
        const msg = (e as Error).message;
        errors.push(`groq: ${msg}`);
        console.warn("[llm] groq failed:", msg);
        // Partial answer already streamed — re-streaming would duplicate it.
        if (emitted) throw new Error(`groq stream interrupted after partial output: ${msg}`);
      }
    }

    // LAST: Gemini 3.1 Pro preview (only exists on some keys — harmless miss).
    if (geminiKey()) {
      try {
        return await withRetry(
                    () => geminiStream("gemini-3.1-pro-preview", messages, tools, { temperature, maxTokens, signal }, guardedOnEvent),
          "gemini:gemini-3.1-pro-preview",
          1,
          stopRetrying
        );
      } catch (e: unknown) {
        const msg = (e as Error).message;
        errors.push("gemini 3.1-pro: " + msg);
        console.warn("[llm] gemini 3.1-pro failed:", msg);
        if (emitted) throw new Error("gemini 3.1-pro stream interrupted after partial output: " + msg);
      }
    }
  }

  // All providers failed on all attempts — build a helpful error message
  const allRateLimited = errors.every((e) => /429|rate.?limit|too.many|throttl/i.test(e));
  const anyAuthError = errors.some((e) => /401|403|auth|invalid.*key/i.test(e));

  if (allRateLimited) {
    throw new Error("All LLM backends are rate-limited. Please wait a moment and try again.");
  }
  if (anyAuthError) {
    throw new Error("LLM API key is invalid. Check your GROQ_API_KEY or GEMINI_API_KEY in Vercel.");
  }
  throw new Error(
    "LLM backend unavailable. Set GROQ_API_KEY (Qwen) or GEMINI_API_KEY/GOOGLE_API_KEY (Gemini)."
  );
}

async function groqStream(
  messages: ChatMsg[],
     tools: ToolSpec[] | undefined,
  opts: { temperature: number; maxTokens: number; signal?: AbortSignal },
  onEvent: (ev: StreamEvent) => void
): Promise<StreamTurnResult> {
  const signal = opts.signal;
  const body: Record<string, unknown> = {
    model: "qwen/qwen3.8-27b",
    messages: messages.map((m) => ({ role: m.role, content: m.text })),
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: true,
    stream_options: { include_usage: false },
  };
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: normalizeSchema(t.parameters),
      },
    }));
    body.tool_choice = "auto";
  }

    const res = await fetchWithTimeout(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, LLM_CONNECT_TIMEOUT_MS, signal);

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    throw new Error(`groq error ${res.status}: ${txt}`);
  }

    const reader = res.body?.getReader();
  if (!reader) throw new Error("groq: no body");
  const dec = new TextDecoder();
  let buffer = "";
  let text = "";
  let toolCalls: StreamTurnResult["toolCalls"] = [];
  let finishReason: "stop" | "tool_calls" | "length" | "error" | undefined;

  try {
    while (true) {
      let done = false;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        // request was aborted (route turn-timeout) — stop spinning and return
        // whatever partial result we already have so the route can fall back
        // to the digest instead of leaving the stream open.
        break;
      }
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 2);
        if (!chunk || chunk === "data: [DONE]") continue;
        const line = chunk.startsWith("data: ") ? chunk.slice(6) : chunk;
        try {
          const evt = JSON.parse(line);
          for (const choice of evt.choices ?? []) {
            const delta = choice.delta;
            if (delta?.content) {
              text += delta.content;
              onEvent({ type: "text", text: delta.content });
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? toolCalls.length;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = {
                    name: tc.function?.name ?? "",
                    args: {} as Record<string, unknown>,
                    id: tc.id,
                  };
                  onEvent({
                    type: "tool_call",
                    name: toolCalls[idx].name,
                    args: {},
                    id: tc.id,
                  });
                }
                if (tc.function?.arguments) {
                  toolCalls[idx].args = mergeArgs(toolCalls[idx].args, tc.function.arguments);
                }
              }
            }
            if (choice.finish_reason) {
              finishReason = mapFinish(choice.finish_reason);
            }
          }
        } catch {
          /* ignore malformed sse chunk */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* reader already released */
    }
  }

  // final partial line
  if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
    const line = buffer.replace(/^data: /, "").trim();
    if (line.startsWith("{")) {
      try {
        const evt = JSON.parse(line);
        for (const choice of evt.choices ?? []) {
          const delta = choice.delta;
          if (delta?.content) {
            text += delta.content;
            onEvent({ type: "text", text: delta.content });
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? toolCalls.length;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  name: tc.function?.name ?? "",
                  args: {} as Record<string, unknown>,
                  id: tc.id,
                };
                onEvent({ type: "tool_call", name: toolCalls[idx].name, args: {}, id: tc.id });
              }
              if (tc.function?.arguments) {
                toolCalls[idx].args = mergeArgs(toolCalls[idx].args, tc.function.arguments);
              }
            }
          }
          if (choice.finish_reason) {
            finishReason = mapFinish(choice.finish_reason);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (toolCalls.length) {
    onEvent({ type: "tool_call_done" });
    if (!finishReason) finishReason = "tool_calls";
  } else {
    onEvent({ type: "finish", finishReason: finishReason ?? "stop" });
  }

    return { text, toolCalls, finishReason, backend: "groq", model: "qwen/qwen3.8-27b" };
}

/* ----------------------- gemini ----------------------- */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function geminiStream(
  model: string,
  messages: ChatMsg[],
    tools: ToolSpec[] | undefined,
  opts: { temperature: number; maxTokens: number; signal?: AbortSignal },
  onEvent: (ev: StreamEvent) => void
): Promise<StreamTurnResult> {
  const signal = opts.signal;
  const key = geminiKey();
  if (!key) throw new Error("gemini: no API key");

  const sysIdx = messages.findIndex((m) => m.role === "system");
  const system = sysIdx >= 0 ? messages[sysIdx].text : undefined;
  // Gemini REJECTS consecutive messages with the same role (400 "user role
  // cannot follow user role"). Tool results are re-fed as back-to-back user
  // turns, so without collapsing adjacency every fallback call after the first
  // tool round would fail. Merge same-role neighbors into one message instead.
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text: m.text });
    } else {
      contents.push({ role, parts: [{ text: m.text }] });
    }
  }

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
  };
  // 2.5-flash runs "thinking" by default and silently spends the output-token
  // budget on hidden reasoning — the visible report got truncated. Synthesis
  // doesn't need reasoning tokens: disable them so text gets the full budget.
  if (model.startsWith("gemini-2.5")) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const body: Record<string, unknown> = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({
      functionDeclarations: [
        {
          name: t.name,
          description: t.description,
          // normalizeSchema already emits the full Schema (type/properties/
          // required) — do NOT wrap it again, or Gemini 400s on every call.
          parameters: normalizeSchema(t.parameters),
        },
      ],
    }));
  }

  const res = await fetchWithTimeout(
    `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    LLM_CONNECT_TIMEOUT_MS,
    signal
  );

  if (!res.ok) {
    const txt = (await res.text()).slice(0, 400);
    if (res.status === 404) throw new Error(`gemini: model '${model}' not found`);
    throw new Error(`gemini error ${res.status}: ${txt}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("gemini: no body");
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let toolCalls: StreamTurnResult["toolCalls"] = [];
  let finishReason: "stop" | "tool_calls" | "length" | "error" | undefined;

    while (true) {
    if (signal?.aborted) break;
    let done = false;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch {
      // route turn-timeout aborted the request — return whatever we collected
      break;
    }
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 2);
      if (!chunk || chunk === "data: [DONE]") continue;
      const data = chunk.replace(/^data: /, "").trim();
      if (!data.startsWith("{")) continue;
      try {
        const evt = JSON.parse(data);
        for (const cand of evt.candidates ?? []) {
          const part = cand.content?.parts?.[0];
          if (part?.text) {
            text += part.text;
            onEvent({ type: "text", text: part.text });
          }
          if (part?.functionCall) {
            const fc = part.functionCall;
            const idx = toolCalls.length;
            toolCalls[idx] = {
              name: fc.name,
              args: fc.args ?? {},
              id: fc.id ?? `fc${idx}`,
            };
            onEvent({
              type: "tool_call",
              name: fc.name,
              args: fc.args ?? {},
              id: fc.id,
            });
          }
          if (cand.finishReason) {
            finishReason = mapFinish(cand.finishReason);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // final partial
  if (buf.trim() && buf.trim() !== "data: [DONE]") {
    const data = buf.replace(/^data: /, "").trim();
    if (data.startsWith("{")) {
      try {
        const evt = JSON.parse(data);
        for (const cand of evt.candidates ?? []) {
          const part = cand.content?.parts?.[0];
          if (part?.text) {
            text += part.text;
            onEvent({ type: "text", text: part.text });
          }
          if (part?.functionCall) {
            const fc = part.functionCall;
            const idx = toolCalls.length;
            toolCalls[idx] = {
              name: fc.name,
              args: fc.args ?? {},
              id: fc.id ?? `fc${idx}`,
            };
            onEvent({ type: "tool_call", name: fc.name, args: fc.args ?? {}, id: fc.id });
          }
          if (cand.finishReason) {
            finishReason = mapFinish(cand.finishReason);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (toolCalls.length) {
    onEvent({ type: "tool_call_done" });
    if (!finishReason) finishReason = "tool_calls";
  } else {
    onEvent({ type: "finish", finishReason: finishReason ?? "stop" });
  }

  return { text, toolCalls, finishReason, backend: "gemini", model };
}

/* ----------------------- JSON generation ----------------------- */

/** Strip markdown code fences and try to extract valid JSON from LLM output. */
function tryParseJson(txt: string): { ok: true; data: unknown } | { ok: false; raw: string } {
  // strip ```json ... ``` fences
  const stripped = txt.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try {
    return { ok: true, data: JSON.parse(stripped) };
  } catch {
    // try to find a JSON object in the text
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return { ok: true, data: JSON.parse(stripped.slice(start, end + 1)) };
      } catch {
        // fall through
      }
    }
    return { ok: false, raw: txt.slice(0, 500) };
  }
}

/** Convert a Gemini-format schema into a human-readable prompt string. */
function formatSchemaForPrompt(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: string[]; items?: { type?: string } }>;
  const lines: string[] = ["{"];
  const entries = Object.entries(props);
  for (let i = 0; i < entries.length; i++) {
    const [key, def] = entries[i];
    const comma = i < entries.length - 1 ? "," : "";
    if (def.enum) {
      lines.push(`  "${key}": "one of: ${def.enum.join(", ")}${comma}`);
    } else if (def.type === "array") {
      lines.push(`  "${key}": "array of ${def.items?.type ?? "string"}s${comma}`);
    } else if (def.type === "integer") {
      lines.push(`  "${key}": "integer${comma}`);
    } else if (def.type === "boolean") {
      lines.push(`  "${key}": "boolean${comma}`);
    } else {
      lines.push(`  "${key}": "string${comma}`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Generate structured JSON. Tries Groq first (instruction-based), then
 * Gemini with responseSchema if available.
 */
export async function generateJson(
  messages: ChatMsg[],
  schema?: Record<string, unknown>,
  opts: { temperature?: number } = {}
): Promise<JsonResult> {
  const temperature = opts.temperature ?? 0.1;
  let groqStatus = "skipped";
  let geminiStatus = "skipped";

  // --- Groq (instruction-based JSON) ---
  if (process.env.GROQ_API_KEY) {
    const model = "qwen/qwen3.8-27b";
    // Build messages: append schema instruction to system prompt, not as a separate user message
    const fullMsgs = messages.map((m) => ({ ...m }));
    if (schema) {
      const schemaStr = formatSchemaForPrompt(schema);
      const sysIdx = fullMsgs.findIndex((m) => m.role === "system");
      const schemaInstruction =
        `\n\nRespond with ONLY a JSON object matching this exact schema. No prose, no markdown fences, no explanation.\nSchema:\n${schemaStr}`;
      if (sysIdx >= 0) {
        fullMsgs[sysIdx] = { ...fullMsgs[sysIdx], text: fullMsgs[sysIdx].text + schemaInstruction };
      } else {
        fullMsgs.unshift({ role: "system", text: `You are a JSON extraction assistant.${schemaInstruction}` });
      }
    }
    try {
      const res = await fetchWithTimeout(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: fullMsgs.map((m) => ({ role: m.role, content: m.text })),
          temperature,
          max_tokens: 2048,
        }),
      }, LLM_CONNECT_TIMEOUT_MS);
      groqStatus = String(res.status);
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const txt = data.choices?.[0]?.message?.content ?? "";
        const result = tryParseJson(txt);
        if (result.ok) {
          return { json: result.data, text: txt, backend: "groq", model };
        }
        console.warn("[llm:generateJson] groq returned invalid JSON:", result.raw);
      } else {
        const errTxt = (await res.text()).slice(0, 200);
        console.warn(`[llm:generateJson] groq error ${res.status}:`, errTxt);
      }
    } catch (e: unknown) {
      groqStatus = `error: ${(e as Error).message}`;
      console.warn("[llm:generateJson] groq exception:", (e as Error).message);
    }
  }

  // --- Gemini (responseSchema) ---
  const key = geminiKey();
  if (key && schema) {
    const model = geminiModel();
    const sysIdx = messages.findIndex((m) => m.role === "system");
    const system = sysIdx >= 0 ? messages[sysIdx].text : undefined;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      }));

    try {
      const res = await fetchWithTimeout(`${GEMINI_BASE}/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: {
            temperature,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: normalizeSchema(schema),
          },
        }),
      }, LLM_CONNECT_TIMEOUT_MS);
      geminiStatus = String(res.status);
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const result = tryParseJson(txt);
        if (result.ok) {
          return { json: result.data, text: txt, backend: "gemini", model };
        }
        console.warn("[llm:generateJson] gemini returned invalid JSON:", result.raw);
      } else {
        const errTxt = (await res.text()).slice(0, 200);
        console.warn(`[llm:generateJson] gemini error ${res.status}:`, errTxt);
      }
    } catch (e: unknown) {
      geminiStatus = `error: ${(e as Error).message}`;
      console.warn("[llm:generateJson] gemini exception:", (e as Error).message);
    }
  }

  throw new Error(`JSON generation failed. Groq: ${groqStatus}, Gemini: ${geminiStatus}`);
}
