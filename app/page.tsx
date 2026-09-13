"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  readProfileFromStorage,
  saveProfileToStorage,
  type ProfileInput,
  type StudentProfile,
} from "@/lib/profile";
import { parseList } from "@/lib/html";

const LEVELS: { value: string; label: string }[] = [
  { value: "", label: "Select your level…" },
  { value: "high_school", label: "High school student" },
  { value: "undergraduate", label: "Undergraduate (Bachelor's)" },
  { value: "masters", label: "Master's student / applicant" },
  { value: "phd", label: "PhD student / applicant" },
  { value: "recent_graduate", label: "Recent graduate" },
  { value: "professional", label: "Working professional → study" },
  { value: "other", label: "Other" },
];

const inputCls =
  "w-full rounded-lg border border-[--border] bg-white px-3.5 py-2 text-[13px] text-[--text-primary] placeholder-[--text-muted] outline-none transition-colors focus:border-[--accent-primary] focus:ring-1 focus:ring-[--accent-primary]/10";

function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <span className="mb-1.5 flex items-baseline gap-2">
      <span className="text-[13px] font-medium text-[--text-primary]">
        {children}{required ? <span className="text-[--accent-danger] ml-0.5">*</span> : null}
      </span>
      {hint ? <span className="text-[11px] text-[--text-muted]">{hint}</span> : null}
    </span>
  );
}

type SectionId = "personal" | "academic" | "goals" | "experience" | "extra";

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: "personal", label: "Personal info", icon: "👤" },
  { id: "academic", label: "Academic background", icon: "🎓" },
  { id: "goals", label: "Goals & preferences", icon: "🎯" },
  { id: "experience", label: "Experience & achievements", icon: "💼" },
  { id: "extra", label: "Additional notes", icon: "📝" },
];

function sectionStatus(id: SectionId, p: ProfileInput): "complete" | "partial" | "empty" {
  const fields: Record<SectionId, string[]> = {
    personal: ["fullName", "age", "citizenship", "residence"],
    academic: ["level", "field", "gpa", "graduationYear"],
    goals: ["targetCountries", "deadlineWindow", "languages", "interests"],
    experience: ["experience", "achievements"],
    extra: ["constraints", "notes"],
  };
  const filled = fields[id].filter((k) => {
    const v = (p as Record<string, unknown>)[k];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
  if (filled.length === 0) return "empty";
  if (filled.length === fields[id].length) return "complete";
  return "partial";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-[--text-muted] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function StatusDot({ status }: { status: "complete" | "partial" | "empty" }) {
  if (status === "complete")
    return <span className="flex h-5 w-5 items-center justify-center text-[11px] text-[--accent-success]">✓</span>;
  if (status === "partial")
    return <span className="h-1.5 w-1.5 rounded-full bg-[--accent-gold]" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-[--border]" />;
}

export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<ProfileInput>({});
  const [tab, setTab] = useState<"form" | "doc">("form");
  const [docText, setDocText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openSection, setOpenSection] = useState<SectionId | null>("personal");

  const LIST_KEYS = ["fieldKeywords", "targetCountries", "languages", "interests", "links"];
  const LINE_KEYS = ["experience", "achievements"];
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => setP(readProfileFromStorage()), []);

  const set = (k: keyof ProfileInput, v: unknown) => setP((prev) => ({ ...prev, [k]: v }));

  function draftFor(k: string): string {
    if (drafts[k] !== undefined) return drafts[k];
    const arr = (p as Record<string, unknown>)[k];
    return Array.isArray(arr) ? (arr as string[]).join(LINE_KEYS.includes(k) ? "\n" : ", ") : "";
  }

  function commitDrafts(next: ProfileInput): ProfileInput {
    if (Object.keys(drafts).length === 0) return { ...next };
    const out = { ...next } as Record<string, unknown>;
    for (const k of LIST_KEYS) {
      if (drafts[k] !== undefined) out[k] = parseList(drafts[k]);
    }
    for (const k of LINE_KEYS) {
      if (drafts[k] !== undefined) {
        out[k] = drafts[k].split("\n").map((s) => s.trim()).filter(Boolean);
      }
    }
    return out as ProfileInput;
  }

  function save() {
    saveProfileToStorage(commitDrafts(p));
    router.push("/chat");
  }

  async function extractPdfText(data: ArrayBuffer): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .filter((item) => "str" in item)
        .map((item) => (item as { str: string }).str)
        .join(" ");
      pageTexts.push(text);
    }
    return pageTexts.join("\n\n");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "pdf" || f.type === "application/pdf") {
      setParseMsg({ ok: true, text: `Reading "${f.name}"…` });
      try {
        const arrayBuf = await f.arrayBuffer();
        const text = await extractPdfText(arrayBuf);
        if (!text.trim()) {
          setParseMsg({ ok: false, text: "This PDF has no extractable text — it may be a scanned/image PDF. Try a text-based PDF or paste the content manually." });
          return;
        }
        const sliced = text.slice(0, 20000);
        setDocText(sliced);
        const kb = Math.round(text.length / 1024);
        const warn = text.length > 20000 ? ` (truncated from ${kb} KB to 20 KB)` : ` (${kb} KB)`;
        setParseMsg({ ok: true, text: `Extracted ${warn} from "${f.name}" — hit Parse.` });
      } catch (err) {
        setParseMsg({ ok: false, text: `Failed to read PDF: ${(err as Error).message}` });
      }
      return;
    }

    const validExts = ["md", "txt", "json", "csv"];
    const validTypes = ["text/plain", "text/markdown", "text/csv", "application/json", ""];
    if (!validExts.includes(ext) && !validTypes.includes(f.type)) {
      setParseMsg({ ok: false, text: `Unsupported file type ".${ext}" — upload a .pdf, .md, .txt, .csv, or .json file.` });
      return;
    }

    const text = await f.text();
    const sliced = text.slice(0, 20000);
    setDocText(sliced);
    const kb = Math.round(text.length / 1024);
    const warn = text.length > 20000 ? ` (truncated from ${kb} KB to 20 KB)` : ` (${kb} KB)`;
    setParseMsg({ ok: true, text: `Loaded "${f.name}"${warn} — hit Parse.` });
  }

  async function parseDoc() {
    setParsing(true);
    setParseMsg(null);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: docText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Parse failed");
      const parsed = (data.profile ?? {}) as StudentProfile;
      const clean = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) =>
          Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== ""
        )
      );
      setP((prev) => ({ ...prev, ...clean }));
      setDrafts({});

      const extractedCount = data.extractedFields ?? Object.keys(clean).length;
      const missingRequired = REQUIRED_FIELDS.filter((f) => {
        const v = (clean as Record<string, unknown>)[f.key];
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "boolean") return false;
        return v === undefined || v === null || String(v).trim() === "";
      });
      let msg = `Extracted ${extractedCount} fields.`;
      if (missingRequired.length > 0) {
        msg += ` Still needed: ${missingRequired.map((f) => f.label).join(", ")}.`;
      } else {
        msg += " All required fields covered!";
      }

      setParseMsg({ ok: true, text: msg });
      setTab("form");

      if (missingRequired.length > 0) {
        setOpenSection(missingRequired[0].section);
      } else {
        setOpenSection("personal");
      }
    } catch (e) {
      setParseMsg({ ok: false, text: `${(e as Error).message}` });
    } finally {
      setParsing(false);
    }
  }

  const sectionStatuses = SECTIONS.map((s) => ({ ...s, status: sectionStatus(s.id, p) }));

  const REQUIRED_FIELDS: { key: keyof ProfileInput; label: string; section: SectionId }[] = [
    { key: "fullName", label: "Full name", section: "personal" },
    { key: "age", label: "Age", section: "personal" },
    { key: "citizenship", label: "Citizenship", section: "personal" },
    { key: "level", label: "Academic level", section: "academic" },
    { key: "field", label: "Field of study", section: "academic" },
    { key: "targetCountries", label: "Target countries", section: "goals" },
    { key: "needsFullFunding", label: "Funding need", section: "goals" },
  ];

  function isFieldFilled(key: keyof ProfileInput): boolean {
    const v = p[key];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "boolean") return true;
    return v !== undefined && v !== null && String(v).trim() !== "";
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !isFieldFilled(f.key));
  const requiredFieldsMet = missingRequired.length === 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
          Build your student profile
        </h1>
        <p className="mt-2 text-[14px] text-[--text-secondary]">
          Everything stays in your browser. The agent uses it to personalize research — fill what you can, it asks for anything critical that&apos;s missing.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {(["form", "doc"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all ${
              tab === t
                ? "bg-[--accent-primary] text-white"
                : "text-[--text-muted] hover:text-[--text-primary]"
            }`}
          >
            {t === "form" ? "Quick form" : "Upload document"}
          </button>
        ))}
        <a
          href="/student-profile-template.md"
          download
          className="ml-auto text-[13px] text-[--text-muted] underline decoration-[--border] underline-offset-2 hover:text-[--text-primary] hover:decoration-[--text-muted]"
        >
          Download template
        </a>
      </div>

      {tab === "doc" ? (
        <div className="rounded-xl border border-[--border] bg-white p-6">
          <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-[13px] text-[--text-secondary]">
            <li>Download the template above (or use any CV/notes file).</li>
            <li>Fill it in with your details (.md / .txt / .pdf / any plain text).</li>
            <li>Upload it here or paste the text — the AI extracts your profile.</li>
          </ol>
          <input
            type="file"
            accept=".pdf,.md,.txt,.json,.csv"
            onChange={onFile}
            className="mb-4 block w-full text-[13px] text-[--text-muted] file:mr-3 file:rounded-lg file:border file:border-[--border] file:bg-white file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-[--text-primary] hover:file:bg-[--bg-surface]"
          />
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value.slice(0, 20000))}
            placeholder="…or paste your filled document / CV text here"
            className={`${inputCls} h-44 text-[13px]`}
            style={{ fontFamily: "var(--font-mono)" }}
          />
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={parseDoc}
              disabled={parsing || docText.trim().length < 20}
              className="rounded-lg bg-[--accent-primary] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[--accent-primary-light] disabled:opacity-30"
            >
              {parsing ? "Parsing…" : "Parse with AI"}
            </button>
            {parseMsg ? (
              <span className={`text-[13px] ${parseMsg.ok ? "text-[--accent-success]" : "text-[--accent-danger]"}`}>
                {parseMsg.text}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {SECTIONS.map((sec) => {
            const isOpen = openSection === sec.id;
            const status = sectionStatus(sec.id, p);
            return (
              <div
                key={sec.id}
                className={`rounded-xl transition-colors ${isOpen ? "bg-[--bg-surface]" : "hover:bg-[--bg-surface]/50"}`}
              >
                <button
                  onClick={() => setOpenSection(isOpen ? null : sec.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <ChevronIcon open={isOpen} />
                  <span className="flex-1 text-[14px] font-medium text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
                    {sec.label}
                  </span>
                  <StatusDot status={status} />
                </button>

                {isOpen && (
                  <div className="px-4 pb-5 pt-1">
                    {sec.id === "personal" && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          <FieldLabel required>Full name</FieldLabel>
                          <input className={inputCls} value={p.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} placeholder="Amina Yusuf" />
                        </label>
                        <label>
                          <FieldLabel required>Age</FieldLabel>
                          <input type="number" min={10} max={80} className={inputCls} value={p.age ?? ""} onChange={(e) => set("age", e.target.value ? Number(e.target.value) : undefined)} placeholder="21" />
                        </label>
                        <label>
                          <FieldLabel required>Citizenship</FieldLabel>
                          <input className={inputCls} value={p.citizenship ?? ""} onChange={(e) => set("citizenship", e.target.value)} placeholder="Kenya" />
                        </label>
                        <label>
                          <FieldLabel>Country of residence</FieldLabel>
                          <input className={inputCls} value={p.residence ?? ""} onChange={(e) => set("residence", e.target.value)} placeholder="Kenya" />
                        </label>
                      </div>
                    )}

                    {sec.id === "academic" && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          <FieldLabel required>Academic level</FieldLabel>
                          <select className={inputCls} value={p.level ?? ""} onChange={(e) => set("level", e.target.value || undefined)}>
                            {LEVELS.map((l) => (
                              <option key={l.value} value={l.value}>{l.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <FieldLabel required>Field of study</FieldLabel>
                          <input className={inputCls} value={p.field ?? ""} onChange={(e) => set("field", e.target.value)} placeholder="Computer Science" />
                        </label>
                        <label>
                          <FieldLabel hint="comma separated">Field keywords</FieldLabel>
                          <input className={inputCls} value={draftFor("fieldKeywords")} onChange={(e) => setDrafts({ ...drafts, fieldKeywords: e.target.value })} placeholder="AI, machine learning, web dev" />
                        </label>
                        <label>
                          <FieldLabel hint="as-is">GPA / grades</FieldLabel>
                          <input className={inputCls} value={p.gpa ?? ""} onChange={(e) => set("gpa", e.target.value)} placeholder="8.7/10 CGPA" />
                        </label>
                        <label>
                          <FieldLabel>Graduation year</FieldLabel>
                          <input type="number" className={inputCls} value={p.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value ? Number(e.target.value) : undefined)} placeholder="2027" />
                        </label>
                        <label>
                          <FieldLabel>English test</FieldLabel>
                          <input className={inputCls} value={p.englishTests ?? ""} onChange={(e) => set("englishTests", e.target.value)} placeholder="IELTS 7.5 / TOEFL 100 / none yet" />
                        </label>
                        <label className="md:col-span-2">
                          <FieldLabel>Other tests</FieldLabel>
                          <input className={inputCls} value={p.otherTests ?? ""} onChange={(e) => set("otherTests", e.target.value)} placeholder="GRE 325 / SAT 1400 / none" />
                        </label>
                      </div>
                    )}

                    {sec.id === "goals" && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          <FieldLabel required hint="comma separated">Target countries</FieldLabel>
                          <input className={inputCls} value={(p.targetCountries ?? []).join(", ")} onChange={(e) => set("targetCountries", parseList(e.target.value))} placeholder="Germany, Canada, remote" />
                        </label>
                        <label>
                          <FieldLabel>Availability window</FieldLabel>
                          <input className={inputCls} value={p.deadlineWindow ?? ""} onChange={(e) => set("deadlineWindow", e.target.value)} placeholder="programs starting Fall 2027" />
                        </label>
                        <label>
                          <FieldLabel hint="comma separated">Languages</FieldLabel>
                          <input className={inputCls} value={draftFor("languages")} onChange={(e) => setDrafts({ ...drafts, languages: e.target.value })} placeholder="English (fluent), French (A2)" />
                        </label>
                        <label>
                          <FieldLabel hint="comma separated">Interests</FieldLabel>
                          <input className={inputCls} value={draftFor("interests")} onChange={(e) => setDrafts({ ...drafts, interests: e.target.value })} placeholder="open source, robotics, climate" />
                        </label>
                        <label className="md:col-span-2">
                          <FieldLabel hint="LinkedIn / GitHub / portfolio">Links</FieldLabel>
                          <input className={inputCls} value={draftFor("links")} onChange={(e) => setDrafts({ ...drafts, links: e.target.value })} placeholder="github.com/you, linkedin.com/in/you" />
                        </label>
                        <div className="flex gap-6 md:col-span-2">
                          <label className="flex items-center gap-2.5 text-[13px] text-[--text-secondary]">
                            <input
                              type="checkbox"
                              checked={Boolean(p.needsFullFunding)}
                              onChange={(e) => set("needsFullFunding", e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-[--border] accent-[--accent-primary]"
                            />
                            I need fully-funded options only <span className="text-[--accent-danger]">*</span>
                          </label>
                          <label className="flex items-center gap-2.5 text-[13px] text-[--text-secondary]">
                            <input
                              type="checkbox"
                              checked={Boolean(p.remoteOnly)}
                              onChange={(e) => set("remoteOnly", e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-[--border] accent-[--accent-primary]"
                            />
                            Remote-only internships
                          </label>
                        </div>
                      </div>
                    )}

                    {sec.id === "experience" && (
                      <div className="space-y-4">
                        <label>
                          <FieldLabel hint="one per line">Experience</FieldLabel>
                          <textarea
                            className={`${inputCls} h-28`}
                            value={draftFor("experience")}
                            onChange={(e) => setDrafts({ ...drafts, experience: e.target.value })}
                            placeholder={"Hackathon winner — 2026\nBuilt a school website (WordPress)\nVolunteer math tutor"}
                          />
                        </label>
                        <label>
                          <FieldLabel hint="awards, publications, competitions">Achievements</FieldLabel>
                          <textarea
                            className={`${inputCls} h-24`}
                            value={draftFor("achievements")}
                            onChange={(e) => setDrafts({ ...drafts, achievements: e.target.value })}
                            placeholder="National science fair — 2nd place"
                          />
                        </label>
                      </div>
                    )}

                    {sec.id === "extra" && (
                      <div className="space-y-4">
                        <label>
                          <FieldLabel hint="visa, money, relocation limits…">Constraints</FieldLabel>
                          <textarea
                            className={`${inputCls} h-20`}
                            value={p.constraints ?? ""}
                            onChange={(e) => set("constraints", e.target.value)}
                            placeholder="Cannot pay any fees; needs visa-friendly countries"
                          />
                        </label>
                        <label>
                          <FieldLabel>Notes</FieldLabel>
                          <textarea
                            className={`${inputCls} h-20`}
                            value={p.notes ?? ""}
                            onChange={(e) => set("notes", e.target.value)}
                            placeholder="Anything else the agent should know"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-6 mt-10 flex flex-col items-end gap-2.5">
        {!requiredFieldsMet ? (
          <span className="text-[12px] text-[--text-muted]">
            Fill required fields: {missingRequired.map((f) => f.label).join(", ")}
          </span>
        ) : null}
        <button
          onClick={save}
          disabled={!requiredFieldsMet}
          className="rounded-full bg-[--accent-primary] px-8 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[--accent-primary-light] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Save & meet your agent →
        </button>
      </div>
    </div>
  );
}
