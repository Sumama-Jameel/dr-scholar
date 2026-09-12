/**
 * lib/llm.ts — multi-backend LLM router (dependency-free).
 *
 * Priority:
 *   1. Qwen 3.8 27B via Groq OpenAI-compatible endpoint  (env: GROQ_API_KEY)
 *   2. Google Gemini 3.1 Pro via Gemini REST             (env: GEMINI_API_KEY / GOOGLE_API_KEY)
  *   3. Fallback: Google Gemini 2.5 Flash                 (same key, different model)
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

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
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

  if (process.env.GROQ_API_KEY) {
    out.push({ name: "groq", model: "qwen/qwen3.8-27b", available: true });
  } else {
    out.push({ name: "groq", model: "qwen/qwen3.8-27b", available: false, reason: "GROQ_API_KEY not set" });
  }

  if (geminiKey()) {
    out.push({ name: "gemini", model: "gemini-3.1-pro-preview", available: true });
    out.push({ name: "gemini", model: "gemini-2.5-flash", available: true });
  } else {
    out.push({ name: "gemini", model: "gemini-3.1-pro-preview", available: false, reason: "no gemini key" });
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
  if (r === "length") return "length";
  return "stop";
}

/* ----------------------- groq (Qwen) ----------------------- */

const GROQ_BASE = "https://api.groq.com/openai/v1";

export async function streamTurn(
  messages: ChatMsg[],
  tools: ToolSpec[] | undefined,
  onEvent: (ev: StreamEvent) => void,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<StreamTurnResult> {
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 8192;

  // try groq first (Qwen primary)
  if (process.env.GROQ_API_KEY) {
    try {
      return await groqStream(messages, tools, { temperature, maxTokens }, onEvent);
    } catch (e: unknown) {
      console.warn("[llm] groq failed, falling back to gemini:", (e as Error).message);
    }
  }

  // fallback: gemini 3.1 pro, then 2.5 flash
  const candidates = ["gemini-3.1-pro-preview", "gemini-2.5-flash"];
  for (const model of candidates) {
    try {
      return await geminiStream(model, messages, tools, { temperature, maxTokens }, onEvent);
    } catch (e: unknown) {
      console.warn(`[llm] gemini ${model} failed:`, (e as Error).message);
    }
  }

  throw new Error(
    "LLM backend unavailable. Set GROQ_API_KEY (Qwen) or GEMINI_API_KEY/GOOGLE_API_KEY (Gemini)."
  );
}

async function groqStream(
  messages: ChatMsg[],
  tools: ToolSpec[] | undefined,
  opts: { temperature: number; maxTokens: number },
  onEvent: (ev: StreamEvent) => void
): Promise<StreamTurnResult> {
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
        parameters: t.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

  while (true) {
    const { done, value } = await reader.read();
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
  opts: { temperature: number; maxTokens: number },
  onEvent: (ev: StreamEvent) => void
): Promise<StreamTurnResult> {
  const key = geminiKey();
  if (!key) throw new Error("gemini: no API key");

  const sysIdx = messages.findIndex((m) => m.role === "system");
  const system = sysIdx >= 0 ? messages[sysIdx].text : undefined;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
  };

  const body: Record<string, unknown> = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools && tools.length) {
    body.tools = tools.map((t) => ({
      functionDeclarations: [
        {
          name: t.name,
          description: t.description,
          parameters: {
            type: "object",
            properties: t.parameters,
            ...(t.parameters.required ? { required: t.parameters.required } : {}),
          },
        },
      ],
    }));
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
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
    const { done, value } = await reader.read();
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

function tryParseJson(txt: string): unknown {
  try {
    return JSON.parse(txt);
  } catch {
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(txt.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Generate structured JSON. Tries Qwen first (instruction-based), then
 * Gemini with responseSchema if available.
 */
export async function generateJson(
  messages: ChatMsg[],
  schema?: Record<string, unknown>,
  opts: { temperature?: number } = {}
): Promise<JsonResult> {
  const temperature = opts.temperature ?? 0.1;

  // Try groq first
  if (process.env.GROQ_API_KEY) {
    const model = "qwen/qwen3.8-27b";
    const fullMsgs = [...messages];
    if (schema) {
      fullMsgs.push({
        role: "user",
        text: `Respond with ONLY a JSON object matching this schema, no prose. Schema: ${JSON.stringify(schema)}`,
      });
    }
    try {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
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
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const txt = data.choices?.[0]?.message?.content ?? "";
        const json = tryParseJson(txt);
        return { json, text: txt, backend: "groq", model };
      }
    } catch {
      // ignore, fall through
    }
  }

  // Fallback: Gemini with responseSchema (strict)
  const key = geminiKey();
  if (key && schema) {
    const model = "gemini-2.5-flash";
    const sysIdx = messages.findIndex((m) => m.role === "system");
    const system = sysIdx >= 0 ? messages[sysIdx].text : undefined;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      }));

    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const json = tryParseJson(txt);
      return { json, text: txt, backend: "gemini", model };
    }
  }

  throw new Error("No LLM backend available for JSON generation.");
}








