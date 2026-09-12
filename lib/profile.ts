import { z } from "zod";

/**
 * Student profile schema — shared by the form, the document parser and the agent.
 * Every field is optional: the agent works with whatever the student provides
 * and asks for missing critical fields (see skills/dr-scholar/SKILL.md).
 */
export const ProfileSchema = z.object({
  fullName: z.string().optional().describe("Full name of the student"),
  age: z
    .number()
    .int()
    .min(10)
    .max(80)
    .optional()
    .describe("Age in years (some programs have age limits)"),
  citizenship: z.string().optional().describe("Country of citizenship"),
  residence: z.string().optional().describe("Country of current residence"),
  level: z
    .enum([
      "high_school",
      "undergraduate",
      "masters",
      "phd",
      "recent_graduate",
      "professional",
      "other",
    ])
    .optional()
    .describe("Current or next academic level"),
  field: z.string().optional().describe("Field of study, e.g. Computer Science"),
  fieldKeywords: z
    .array(z.string())
    .optional()
    .describe("Keywords: specialisation, skills, research areas"),
  gpa: z.string().optional().describe("GPA/grade as free text, e.g. '8.7/10 CGPA'"),
  graduationYear: z
    .number()
    .int()
    .optional()
    .describe("Expected or actual graduation year"),
  englishTests: z.string().optional().describe("English test + score, e.g. IELTS 7.5"),
  otherTests: z.string().optional().describe("Other tests: GRE, GMAT, SAT…"),
  targetCountries: z
    .array(z.string())
    .optional()
    .describe("Countries the student wants to study/work in"),
  remoteOnly: z
    .boolean()
    .optional()
    .describe("True if student can only do remote internships"),
  needsFullFunding: z
    .boolean()
    .optional()
    .describe("True if student needs fully-funded options only"),
  experience: z
    .array(z.string())
    .optional()
    .describe("Work, internships, projects, volunteering"),
  achievements: z.array(z.string()).optional().describe("Awards, publications, competitions"),
  interests: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  links: z
    .array(z.string())
    .optional()
    .describe("LinkedIn, GitHub, portfolio URLs"),
  constraints: z
    .string()
    .optional()
    .describe("Constraints: visa issues, relocation windows, financial situation…"),
  deadlineWindow: z
    .string()
    .optional()
    .describe("When the student can start, e.g. 'Fall 2027'"),
  notes: z.string().optional(),
});

export type StudentProfile = z.infer<typeof ProfileSchema>;

export type ProfileInput = Partial<StudentProfile>;

export function emptyProfile(): ProfileInput {
  return {};
}

export function readProfileFromStorage(): ProfileInput {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("drscholar.profile");
    return raw ? (JSON.parse(raw) as ProfileInput) : {};
  } catch {
    return {};
  }
}

export function saveProfileToStorage(p: ProfileInput) {
  try {
    window.localStorage.setItem("drscholar.profile", JSON.stringify(p));
  } catch {
    /* storage may be disabled — non fatal */
  }
}

const CORE_FIELDS: (keyof StudentProfile)[] = [
  "fullName",
  "age",
  "citizenship",
  "level",
  "field",
  "gpa",
  "targetCountries",
  "needsFullFunding",
  "experience",
  "deadlineWindow",
];

export function profileCompleteness(p: ProfileInput): {
  score: number;
  missing: string[];
} {
  const present = CORE_FIELDS.filter((k) => {
    const v = p[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
  const missing = CORE_FIELDS.filter((k) => !present.includes(k));
  return {
    score: Math.round((present.length / CORE_FIELDS.length) * 100),
    missing,
  };
}

/** Human-readable profile digest used in prompts and reports. */
export function profileToText(p: ProfileInput | null | undefined): string {
  if (!p || Object.keys(p).length === 0) return "(no profile provided yet)";
  const lines: string[] = [];
  const add = (label: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      if (v.length) lines.push(`- ${label}: ${v.join("; ")}`);
      return;
    }
    if (typeof v === "boolean") {
      if (v) lines.push(`- ${label}: yes`);
      return;
    }
    if (String(v).trim() !== "") lines.push(`- ${label}: ${String(v).trim()}`);
  };
  add("Name", p.fullName);
  add("Age", p.age);
  add("Citizenship", p.citizenship);
  add("Residence", p.residence);
  add("Academic level", p.level);
  add("Field", p.field);
  add("Field keywords", p.fieldKeywords);
  add("GPA/grades", p.gpa);
  add("Graduation year", p.graduationYear);
  add("English tests", p.englishTests);
  add("Other tests", p.otherTests);
  add("Target countries", p.targetCountries);
  add("Remote only", p.remoteOnly);
  add("Needs full funding", p.needsFullFunding);
  add("Experience", p.experience);
  add("Achievements", p.achievements);
  add("Interests", p.interests);
  add("Languages", p.languages);
  add("Links", p.links);
  add("Constraints", p.constraints);
  add("Availability window", p.deadlineWindow);
  add("Notes", p.notes);
  return lines.length ? lines.join("\n") : "(profile is empty)";
}
