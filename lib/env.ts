/** Env-var resolution — never log or expose values, only names. */

const GEMINI_KEY_NAMES = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

export function geminiApiKey(): string | undefined {
  for (const n of GEMINI_KEY_NAMES) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** Which env var name supplied the Gemini key (name only, never value). */
export function geminiKeySource(): string | null {
  for (const n of GEMINI_KEY_NAMES) {
    const v = process.env[n];
    if (v && v.trim()) return n;
  }
  return null;
}

/** Groq OpenAI-compatible key for the primary backend (name only, never value). */
export function groqApiKey(): string | undefined {
  const v = (process.env.GROQ_API_KEY || "").trim();
  return v || undefined;
}

/** Which env var name supplied the Groq key (name only, never value). */
export function groqKeySource(): string | null {
  if (process.env.GROQ_API_KEY && (process.env.GROQ_API_KEY as string).trim()) return "GROQ_API_KEY";
  return null;
}

/** Optional single-model override for the primary backend.
 *  Example value: "qwen/qwen3.8-27b"  (a Groq model id, not an env key).
 *  When empty the agent picks from the router's default pool.
 */
export function primaryModelOverride(): string | undefined {
  const v = (process.env.PRIMARY_MODEL || "").trim();
  return v || undefined;
}

/** Set to "true" to force Gemini for the current request (debug only). */
export function preferGemini(): boolean {
  return process.env.PREFER_GEMINI === "true";
}

/**
 * BACKEND ROUTERS (all keyless: keys live only in Vercel env / server env, never
 * shipped to the browser or logged anywhere).
 *
 *   - PRIMARY_BACKEND  → Groq (OpenAI-format chat completions over SSE).
 *     Preferred model:   qwen/qwen3.8-27b            (primary)
 *     Fallback model:    meta-llama/llama-4-scout-17b-guat-fp8-tailfree (when Qwen hits
 *                        the Groq free-tier rate limit).
 *     Note:  chatgpt-oss-120b is reported as model_not_found against THIS GROQ_KEY, so we
 *            do NOT route ChatGPT OSS to Groq. Gemini 3.1 Pro from Google is the SECONDARY
 *            backend instead (see below).
 *
 *   - SECONDARY_BACKEND → Google Gemini (Gemini REST, v1beta, native function calling).
 *     Preferred model:   gemini-3.1-pro-preview      (PRIMARY on the Google side)
 *     Fallback model:    gemini-2.5-flash           (when 3.1-pro quota is exhausted)
 *
 * Priority:  Qwen 3.8 27B (primary) → Gemini 3.1 Pro (secondary).
 * The full router lives in lib/llm.ts; this file only resolves keys and exposes
 * optional single-model overrides.
 */
