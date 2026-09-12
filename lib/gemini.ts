/**
 * Zero-dependency Gemini REST client.
 * Direct fetch → generativelanguage.googleapis.com
 *  - SSE streaming (:streamGenerateContent?alt=sse)
 *  - function calling (tools / functionCall / functionResponse)
 *  - structured JSON output (responseSchema)
 * No SDK, no extra deps.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "functionCall"; name: string; args: Record<string, unknown> };

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

type ReqOpts = {
  apiKey: string;
  model: string;
  system?: string;
  contents: GeminiContent[];
  tools?: FunctionDeclaration[];
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
  disableThinking?: boolean;
  signal?: AbortSignal;
};

function buildBody(o: ReqOpts): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    temperature: o.temperature ?? 0.4,
    maxOutputTokens: o.maxOutputTokens ?? 8192,
  };
  if (o.responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = o.responseSchema;
  }
  if (o.disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body: Record<string, unknown> = { contents: o.contents, generationConfig };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  if (o.tools?.length) body.tools = [{ functionDeclarations: o.tools }];
  return body;
}

async function geminiFetch(o: ReqOpts, method: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${o.model}:${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
      body: JSON.stringify(buildBody(o)),
      signal: o.signal,
    });
  } catch (e: unknown) {
    const err = e as Error;
    throw new GeminiError(
      err.name === "AbortError" ? "aborted" : `network error: ${err.message}`,
      err.name === "AbortError" ? 499 : undefined
    );
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string; status?: string } };
      if (data?.error?.message) msg = `${data.error.status ?? res.status}: ${data.error.message.slice(0, 200)}`;
    } catch {
      /* keep generic message */
    }
    const friendly =
      res.status === 429
        ? "Gemini free-tier rate limit hit (429) — wait ~30-60s and retry"
        : res.status === 401 || res.status === 403
          ? "API key rejected (401/403) — check the key is a valid Gemini key"
          : res.status === 404
            ? `Model '${o.model}' not found (404) — set GEMINI_MODEL to a valid model`
            : msg;
    throw new GeminiError(friendly, res.status);
  }
  return res;
}

/** Reads Gemini's SSE stream and yields text / functionCall events as they arrive. */
async function* readSse(
  res: Response
): AsyncGenerator<StreamEvent | { type: "finish"; finishReason: string }, void, unknown> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let chunk: {
          candidates?: {
            content?: {
              parts?: {
                text?: string;
                functionCall?: { name: string; args?: Record<string, unknown> };
              }[];
            };
            finishReason?: string;
          }[];
          promptFeedback?: { blockReason?: string };
        };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        const cand = chunk.candidates?.[0];
        for (const part of cand?.content?.parts ?? []) {
          if (typeof part.text === "string" && part.text) {
            yield { type: "text", text: part.text };
          } else if (part.functionCall?.name) {
            yield {
              type: "functionCall",
              name: part.functionCall.name,
              args: (part.functionCall.args ?? {}) as Record<string, unknown>,
            };
          }
        }
        if (chunk.promptFeedback?.blockReason) {
          throw new GeminiError(`blocked by safety filter: ${chunk.promptFeedback.blockReason}`);
        }
        if (cand?.finishReason) yield { type: "finish", finishReason: cand.finishReason };
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
}

export type TurnResult = {
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  finishReason?: string;
};

/**
 * One streaming model turn. Streams text deltas through `onEvent` while
 * accumulating; returns the full turn (text + any requested function calls).
 */
export async function geminiStreamTurn(
  o: ReqOpts,
  onEvent?: (ev: StreamEvent) => void
): Promise<TurnResult> {
  const res = await geminiFetch(o, "streamGenerateContent?alt=sse");
  const result: TurnResult = { text: "", functionCalls: [] };
  for await (const ev of readSse(res)) {
    if (ev.type === "text") {
      result.text += ev.text;
      onEvent?.(ev);
    } else if (ev.type === "functionCall") {
      result.functionCalls.push({ name: ev.name, args: ev.args });
      onEvent?.(ev);
    } else if ("finishReason" in ev && ev.type === "finish") {
      result.finishReason = ev.finishReason;
    }
  }
  return result;
}

/** Non-streaming JSON generation (used by the document parser). */
export async function geminiJson(
  o: ReqOpts
): Promise<{ text: string; json: unknown | null }> {
  const res = await geminiFetch(o, "generateContent");
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return { text, json: JSON.parse(m[0]) };
      } catch {
        /* fall through */
      }
    }
    return { text, json: null };
  }
}

