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
  "w-full rounded-lg border border-[--border] bg-[--bg-base]/60 px-3.5 py-2.5 text-sm text-[--text-primary] placeholder-[--text-muted] outline-none transition-colors focus:border-[--accent-primary] focus:ring-1 focus:ring-[--accent-primary]/30";

function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <span className="mb-1.5 flex items-baseline gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[--text-muted]">
        {children}{required ? <span className="text-[--accent-danger]">*</span> : null}
      </span>
      {hint ? <span className="text-[11px] normal-case text-[--text-muted]/60">{hint}</span> : null}
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
      className={`h-4 w-4 text-[--text-muted] transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function StatusDot({ status }: { status: "complete" | "partial" | "empty" }) {
  if (status === "complete")
    return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[--accent-success]/20 text-[10px] text-[--accent-success]">✓</span>;
  if (status === "partial")
    return <span className="h-2 w-2 rounded-full bg-[--accent-gold]" />;
  return <span className="h-2 w-2 rounded-full bg-[--text-muted]/30" />;
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

    // PDF handling
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

    // Text file handling
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

      // Build summary message
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

      // Auto-expand first section with missing required fields
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
    if (typeof v === "boolean") return true; // checkboxes are always "filled"
    return v !== undefined && v !== null && String(v).trim() !== "";
  }

  const missingRequired = REQUIRED_FIELDS.filter((f) => !isFieldFilled(f.key));
  const requiredFieldsMet = missingRequired.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
          Build your student profile
        </h1>
        <p className="mt-1.5 text-sm text-[--text-secondary]">
          Everything stays in <strong className="text-[--text-primary]">your browser</strong> (localStorage). The agent uses it to personalize research. Fill what you can — it asks for anything critical that&apos;s missing.
        </p>
      </div>

      {/* tabs */}
      <div className="mb-5 flex gap-2">
        {(["form", "doc"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t
                ? "bg-[--accent-primary] text-white shadow-lg shadow-[--accent-primary]/20"
                : "bg-[--bg-surface] text-[--text-secondary] hover:bg-[--bg-surface-hover] hover:text-[--text-primary]"
            }`}
          >
            {t === "form" ? "Quick form" : "Fill the document"}
          </button>
        ))}
        <a
          href="/student-profile-template.md"
          download
          className="ml-auto rounded-lg border border-[--border] px-4 py-2 text-sm text-[--text-secondary] transition-colors hover:border-[--accent-primary] hover:text-[--text-primary]"
        >
          Download template (.md)
        </a>
      </div>

      {tab === "doc" ? (
        <div className="rounded-xl border border-[--border] bg-[--bg-surface] p-6">
          <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-[--text-secondary]">
            <li>Download the template above (or use any CV/notes file).</li>
            <li>Fill it in with your details (.md / .txt / .pdf / any plain text).</li>
            <li>Upload it here or paste the text — the AI extracts your profile.</li>
          </ol>
          <input
            type="file"
            accept=".pdf,.md,.txt,.json,.csv"
            onChange={onFile}
            className="mb-3 block w-full text-sm text-[--text-muted] file:mr-3 file:rounded-lg file:border-0 file:bg-[--accent-primary] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[--accent-primary-light]"
          />
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value.slice(0, 20000))}
            placeholder="…or paste your filled document / CV text here"
            className={`${inputCls} h-48 font-[--font-mono] text-[13px]`}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={parseDoc}
              disabled={parsing || docText.trim().length < 20}
              className="rounded-lg bg-[--accent-primary] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[--accent-primary]/20 hover:bg-[--accent-primary-light] disabled:opacity-40"
            >
              {parsing ? "Parsing…" : "Parse with AI"}
            </button>
            {parseMsg ? (
              <span className={`text-sm ${parseMsg.ok ? "text-[--accent-success]" : "text-[--accent-danger]"}`}>
                {parseMsg.text}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map((sec) => {
            const isOpen = openSection === sec.id;
            const status = sectionStatus(sec.id, p);
            return (
              <div
                key={sec.id}
                className={`rounded-xl border bg-[--bg-surface] transition-all duration-200 ${
                  isOpen ? "border-[--accent-primary]/40 shadow-lg shadow-[--accent-primary]/5" : "border-[--border] hover:border-[--border]/80"
                }`}
              >
                <button
                  onClick={() => setOpenSection(isOpen ? null : sec.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <ChevronIcon open={isOpen} />
                  <span className="text-lg">{sec.icon}</span>
                  <span className="flex-1 text-sm font-semibold text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
                    {sec.label}
                  </span>
                  <StatusDot status={status} />
                </button>

                {isOpen && (
                  <div className="border-t border-[--border] px-5 py-5">
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
                          <FieldLabel>Field keywords <span className="normal-case">(comma separated)</span></FieldLabel>
                          <input className={inputCls} value={draftFor("fieldKeywords")} onChange={(e) => setDrafts({ ...drafts, fieldKeywords: e.target.value })} placeholder="AI, machine learning, web dev" />
                        </label>
                        <label>
                          <FieldLabel>GPA / grades <span className="normal-case">(as-is)</span></FieldLabel>
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
                          <FieldLabel required>Target countries <span className="normal-case">(comma separated)</span></FieldLabel>
                          <input className={inputCls} value={(p.targetCountries ?? []).join(", ")} onChange={(e) => set("targetCountries", parseList(e.target.value))} placeholder="Germany, Canada, remote" />
                        </label>
                        <label>
                          <FieldLabel>Availability window</FieldLabel>
                          <input className={inputCls} value={p.deadlineWindow ?? ""} onChange={(e) => set("deadlineWindow", e.target.value)} placeholder="programs starting Fall 2027" />
                        </label>
                        <label>
                          <FieldLabel>Languages <span className="normal-case">(comma separated)</span></FieldLabel>
                          <input className={inputCls} value={draftFor("languages")} onChange={(e) => setDrafts({ ...drafts, languages: e.target.value })} placeholder="English (fluent), French (A2)" />
                        </label>
                        <label>
                          <FieldLabel>Interests <span className="normal-case">(comma separated)</span></FieldLabel>
                          <input className={inputCls} value={draftFor("interests")} onChange={(e) => setDrafts({ ...drafts, interests: e.target.value })} placeholder="open source, robotics, climate" />
                        </label>
                        <label className="md:col-span-2">
                          <FieldLabel>Links <span className="normal-case">(LinkedIn / GitHub / portfolio)</span></FieldLabel>
                          <input className={inputCls} value={draftFor("links")} onChange={(e) => setDrafts({ ...drafts, links: e.target.value })} placeholder="github.com/you, linkedin.com/in/you" />
                        </label>
                        <div className="flex gap-6 md:col-span-2">
                          <label className="flex items-center gap-2.5 text-sm text-[--text-secondary]">
                            <input
                              type="checkbox"
                              checked={Boolean(p.needsFullFunding)}
                              onChange={(e) => set("needsFullFunding", e.target.checked)}
                              className="h-4 w-4 rounded border-[--border] bg-[--bg-base] accent-[--accent-primary]"
                            />
                            I need fully-funded options only <span className="text-[--accent-danger]">*</span>
                          </label>
                          <label className="flex items-center gap-2.5 text-sm text-[--text-secondary]">
                            <input
                              type="checkbox"
                              checked={Boolean(p.remoteOnly)}
                              onChange={(e) => set("remoteOnly", e.target.checked)}
                              className="h-4 w-4 rounded border-[--border] bg-[--bg-base] accent-[--accent-primary]"
                            />
                            Remote-only internships
                          </label>
                        </div>
                      </div>
                    )}

                    {sec.id === "experience" && (
                      <div className="space-y-4">
                        <label>
                          <FieldLabel>Experience <span className="normal-case">(jobs, projects, volunteering — one per line)</span></FieldLabel>
                          <textarea
                            className={`${inputCls} h-28`}
                            value={draftFor("experience")}
                            onChange={(e) => setDrafts({ ...drafts, experience: e.target.value })}
                            placeholder={"Hackathon winner — 2026\nBuilt a school website (WordPress)\nVolunteer math tutor"}
                          />
                        </label>
                        <label>
                          <FieldLabel>Achievements <span className="normal-case">(awards, publications, competitions)</span></FieldLabel>
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
                          <FieldLabel>Constraints <span className="normal-case">(visa, money, relocation limits…)</span></FieldLabel>
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

      {/* save button */}
      <div className="sticky bottom-4 mt-8 flex flex-col items-end gap-2">
        {!requiredFieldsMet ? (
          <span className="text-xs text-[--text-muted]">
            Fill required fields: {missingRequired.map((f) => f.label).join(", ")}
          </span>
        ) : null}
        <button
          onClick={save}
          disabled={!requiredFieldsMet}
          className="rounded-xl bg-[--accent-primary] px-7 py-3 text-sm font-bold text-white shadow-xl shadow-[--accent-primary]/25 transition-all hover:bg-[--accent-primary-light] hover:shadow-[--accent-primary]/30 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Save profile & meet your agent →
        </button>
      </div>
    </div>
  );
}
