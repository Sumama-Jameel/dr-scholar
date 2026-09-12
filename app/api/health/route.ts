import { llmBackends } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const backends = llmBackends();
  const primary = backends.find((b) => b.available)?.model ?? null;
  return Response.json({
    ok: true,
    model: primary,
    hasKey: Boolean(primary),
    backends,
    extras: {
      tavily: Boolean(process.env.TAVILY_API_KEY),
      adzuna: Boolean(process.env.ADAZUNA_APP_ID && process.env.ADAZUNA_API_KEY),
      usajobs: Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_EMAIL),
    },
  });
}

