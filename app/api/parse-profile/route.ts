import { z } from "zod";
import { generateJson, llmBackends } from "@/lib/llm";
import { ProfileSchema, type ProfileInput } from "@/lib/profile";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Gemini responseSchema (OpenAPI subset) mirroring ProfileSchema. */
const PROFILE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    fullName: { type: "STRING" },
    age: { type: "INTEGER" },
    citizenship: { type: "STRING" },
    residence: { type: "STRING" },
    level: {
      type: "STRING",
      enum: [
        "high_school",
        "undergraduate",
        "masters",
        "phd",
        "recent_graduate",
        "professional",
        "other",
      ],
    },
    field: { type: "STRING" },
    fieldKeywords: { type: "ARRAY", items: { type: "STRING" } },
    gpa: { type: "STRING" },
    graduationYear: { type: "INTEGER" },
    englishTests: { type: "STRING" },
    otherTests: { type: "STRING" },
    targetCountries: { type: "ARRAY", items: { type: "STRING" } },
    remoteOnly: { type: "BOOLEAN" },
    needsFullFunding: { type: "BOOLEAN" },
    experience: { type: "ARRAY", items: { type: "STRING" } },
    achievements: { type: "ARRAY", items: { type: "STRING" } },
    interests: { type: "ARRAY", items: { type: "STRING" } },
    languages: { type: "ARRAY", items: { type: "STRING" } },
    links: { type: "ARRAY", items: { type: "STRING" } },
    constraints: { type: "STRING" },
    deadlineWindow: { type: "STRING" },
    notes: { type: "STRING" },
  },
};

export async function POST(req: Request) {
  const backends = llmBackends();
  if (!backends.some((b) => b.available)) {
    return Response.json(
      {
        error: "NO_BACKEND",
        message: "No LLM backend configured. Set GROQ_API_KEY (Qwen) or GEMINI_API_KEY/GOOGLE_API_KEY (Gemini).",
      },
      { status: 500 }
    );
  }

  let text = "";
  try {
    const b = await req.json();
    text = typeof b?.text === "string" ? b.text : "";
  } catch {
    /* handled below */
  }
  if (text.trim().length < 20) {
    return Response.json(
      { error: "BAD_INPUT", message: "Paste or upload the filled student document (min ~20 chars)." },
      { status: 400 }
    );
  }

  try {
    const { json } = await generateJson(
      [
        {
          role: "system",
          text:
            "You convert filled student documents into a structured profile JSON. " +
            "Fill ONLY fields the document supports; omit unknown fields entirely — never invent values. " +
            "Convert ages/years to numbers where possible. Split lists into arrays. Respond with JSON only.",
        },
        {
          role: "user",
          text: `Extract the student profile from this document.\n\n"""\n${text.slice(0, 18000)}\n"""`,
        },
      ],
      PROFILE_RESPONSE_SCHEMA,
      { temperature: 0.1 }
    );

    if (!json || typeof json !== "object") {
      return Response.json(
        { error: "PARSER_FAILED", message: "Model returned unparseable JSON — try rephrasing the document." },
        { status: 502 }
      );
    }
    const parsed = ProfileSchema.safeParse(json);
    const profile = (parsed.success ? parsed.data : json) as ProfileInput;
    return Response.json({ profile });
  } catch (e: unknown) {
    const err = e as Error;
    return Response.json(
      { error: "PARSER_FAILED", message: err.message || "Could not parse the document" },
      { status: 502 }
    );
  }
}
