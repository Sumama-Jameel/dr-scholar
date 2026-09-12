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

const EXTRACTION_SYSTEM_PROMPT = `You are a student profile extractor. Given a document (CV, resume, notes, or free-form text), extract structured data into a JSON object.

FIELDS (only include fields you can extract — never invent values):
- fullName: string — full name of the student
- age: integer (10-80) — extract from "I'm 21", "born 2004", "Age: 22", etc.
- citizenship: string — country of citizenship. Map "I'm Kenyan" → "Kenya", "Nigerian" → "Nigeria"
- residence: string — country of current residence
- level: one of "high_school" | "undergraduate" | "masters" | "phd" | "recent_graduate" | "professional" | "other"
  Mapping: "bachelor's student" → undergraduate, "master's applicant" → masters, "PhD student" → phd, "final year undergrad" → undergraduate, "working professional" → professional
- field: string — field of study (e.g. "Computer Science", "Mechanical Engineering")
- fieldKeywords: string[] — specific skills, specializations, research areas (e.g. ["machine learning", "web dev", "climate science"])
- gpa: string — GPA or grade exactly as written (e.g. "3.8/4.0", "87%", "First Class Honours", "8.7 CGPA")
- graduationYear: integer — expected or actual graduation year
- englishTests: string — English proficiency test + score (e.g. "IELTS 7.5", "TOEFL 100", "none")
- otherTests: string — other standardized tests (e.g. "GRE 325", "SAT 1400", "GMAT 700")
- targetCountries: string[] — countries the student wants to study/work in
- remoteOnly: boolean — true if student can only do remote work/internships
- needsFullFunding: boolean — true if student needs fully-funded options (no self-funding)
- experience: string[] — work experience, projects, volunteering (one item per entry)
- achievements: string[] — awards, publications, competitions, certifications
- interests: string[] — academic/personal interests and hobbies
- languages: string[] — languages spoken, with proficiency if mentioned (e.g. "English (fluent)", "French (A2)")
- links: string[] — any URLs found (LinkedIn, GitHub, portfolio, etc.)
- constraints: string — limitations mentioned (visa issues, financial constraints, relocation limits)
- deadlineWindow: string — when the student can start (e.g. "Fall 2027", "January 2028", "immediately")
- notes: string — any other relevant information not captured above

RULES:
- Extract aggressively: if a field can be reasonably inferred from context, include it
- For lists, split on newlines, semicolons, or commas as appropriate
- If a field cannot be determined from the document, OMIT it entirely (do not set to null, empty string, or undefined)
- Convert ages/years to numbers where possible
- Respond with ONLY the JSON object. No markdown fences, no explanation, no prose.`;

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
    const { json, backend, model } = await generateJson(
      [
        { role: "system", text: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          text: `Extract the student profile from this document:\n\n"""\n${text.slice(0, 18000)}\n"""`,
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

    // Count extracted fields (non-empty)
    const fieldCount = Object.entries(profile).filter(([, v]) => {
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "boolean") return true;
      return v !== undefined && v !== null && String(v).trim() !== "";
    }).length;

    return Response.json({
      profile,
      extractedFields: fieldCount,
      totalFields: 20,
      backend,
      model,
    });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[parse-profile] generation failed:", err.message);
    return Response.json(
      { error: "PARSER_FAILED", message: err.message || "Could not parse the document" },
      { status: 502 }
    );
  }
}
