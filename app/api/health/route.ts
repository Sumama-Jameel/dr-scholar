import { llmBackends } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function probeGroq(): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, error: "no GROQ_API_KEY" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "user", content: "1" }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ok: true };
    const txt = (await res.text()).slice(0, 120);
    return { ok: false, error: `groq ${res.status}: ${txt}` };
  } catch (e: unknown) {
    return { ok: false, error: `groq probe failed: ${(e as Error).message}` };
  }
}

async function probeGemini(): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) return { ok: false, error: "no GEMINI/GOOGLE_API_KEY" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "1" }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(timer);
    if (res.ok) return { ok: true };
    const txt = (await res.text()).slice(0, 120);
    return { ok: false, error: `gemini ${res.status}: ${txt}` };
  } catch (e: unknown) {
    return { ok: false, error: `gemini probe failed: ${(e as Error).message}` };
  }
}

export async function GET() {
  const backends = llmBackends();
  const primary = backends.find((b) => b.available)?.model ?? null;

  const [groqProbe, geminiProbe] = await Promise.all([probeGroq(), probeGemini()]);
  const anyProbeOk = groqProbe.ok || geminiProbe.ok;

  return Response.json({
    ok: anyProbeOk,
    model: primary,
    hasKey: Boolean(primary),
    llmOk: anyProbeOk,
    probes: { groq: groqProbe, gemini: geminiProbe },
    backends,
    extras: {
      tavily: Boolean(process.env.TAVILY_API_KEY),
      adzuna: Boolean(process.env.ADAZUNA_APP_ID && process.env.ADAZUNA_API_KEY),
      usajobs: Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_EMAIL),
    },
  });
}
