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
  "w-full rounded border border-(--border) bg-(--bg-content) px-3 py-2 text-[13px] text-(--text-primary) placeholder-(--text-muted) outline-none transition-colors focus:border-(--accent-primary) focus:ring-1 focus:ring-(--accent-primary)/10";

function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <span className="mb-1.5 flex items-baseline gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
        {children}{required ? <span className="text-(--accent-primary) ml-0.5">*</span> : null}
      </span>
      {hint ? <span className="text-[10px] normal-case tracking-normal text-(--text-muted)/70">{hint}</span> : null}
    </span>
  );
}

type SectionId = "personal" | "academic" | "goals" | "experience" | "extra";

const SECTIONS: { id: SectionId; label: string; num: string }[] = [
  { id: "personal", label: "Personal info", num: "01" },
  { id: "academic", label: "Academic background", num: "02" },
  { id: "goals", label: "Goals & preferences", num: "03" },
  { id: "experience", label: "Experience & achievements", num: "04" },
  { id: "extra", label: "Additional notes", num: "05" },
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

function StatusIndicator({ status }: { status: "complete" | "partial" | "empty" }) {
  if (status === "complete")
    return <span className="text-(--accent-success) text-[11px]">✓</span>;
  if (status === "partial")
    return <span className="h-2 w-2 rounded-full bg-(--accent-gold)" />;
  return <span className="h-2 w-2 rounded-full bg-(--border-strong)" />;
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

  useEffect(() => {
    const stored = readProfileFromStorage();
    // Checkboxes must always have explicit boolean values — `undefined` left
    // `needsFullFunding` unfilled forever, silently disabling the Save button.
    setP({ needsFullFunding: false, remoteOnly: false, ...stored });
  }, []);

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
          setParseMsg({ ok: false, text: "This PDF has no extractable text — try a text-based PDF or paste manually." });
          return;
        }
        setDocText(text.slice(0, 20000));
        const kb = Math.round(text.length / 1024);
        const warn = text.length > 20000 ? ` (truncated from ${kb} KB to 20 KB)` : ` (${kb} KB)`;
        setParseMsg({ ok: true, text: `Extracted${warn} from "${f.name}" — hit Parse.` });
      } catch (err) {
        setParseMsg({ ok: false, text: `Failed to read PDF: ${(err as Error).message}` });
      }
      return;
    }

    const validExts = ["md", "txt", "json", "csv"];
    const validTypes = ["text/plain", "text/markdown", "text/csv", "application/json", ""];
    if (!validExts.includes(ext) && !validTypes.includes(f.type)) {
      setParseMsg({ ok: false, text: `Unsupported file type ".${ext}" — upload .pdf, .md, .txt, .csv, or .json.` });
      return;
    }

    const text = await f.text();
    setDocText(text.slice(0, 20000));
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
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r-2 border-(--border-strong) bg-(--bg-content) lg:flex">
        <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
          {/* Section nav */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 text-[9px] uppercase tracking-widest text-(--text-muted)" style={{ fontFamily: "var(--font-display)" }}>
              Sections
            </div>
            <div className="space-y-1">
              {SECTIONS.map((sec) => {
                const isActive = openSection === sec.id && tab === "form";
                const status = sectionStatus(sec.id, p);
                return (
                  <button
                    key={sec.id}
                    onClick={() => { setTab("form"); setOpenSection(sec.id); }}
                    className={`flex w-full items-center gap-3 rounded-r px-3 py-2.5 text-left transition-all ${
                      isActive
                        ? "border-l-[3px] border-l-(--accent-primary) bg-(--accent-primary-light) pl-[9px]"
                        : "border-l-[3px] border-l-transparent hover:bg-(--bg-surface)"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-bold ${isActive ? "text-(--accent-primary)" : "text-(--text-muted)"}`}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {sec.num}
                    </span>
                    <span className={`flex-1 text-[13px] ${isActive ? "font-semibold text-(--text-primary)" : "text-(--text-secondary)"}`}>
                      {sec.label}
                    </span>
                    <StatusIndicator status={status} />
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Sidebar footer */}
          <div className="border-t-2 border-(--border-strong) p-4">
            <div className="mb-3 flex gap-2">
              {(["form", "doc"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`btn flex-1 ${tab === t ? "btn-primary" : ""}`}
                >
                  {t === "form" ? "Form" : "Upload"}
                </button>
              ))}
            </div>
            <a
              href="/student-profile-template.md"
              download
              className="btn w-full text-center"
            >
              Download template
            </a>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-10">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-[13px] font-bold tracking-wide text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
              Build your student profile
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-(--text-secondary)">
              Everything stays in your browser. The agent uses it to personalize research — fill what you can, it asks for anything critical that's missing.
            </p>
            {/* Mobile section switcher (the sidebar is hidden below lg) */}
            <label className="mt-4 flex items-center gap-2 text-[12px] text-(--text-secondary) lg:hidden">
              <span className="shrink-0 text-[10px] uppercase tracking-widest text-(--text-muted)">Section</span>
              <select
                value={tab === "form" ? (openSection ?? "personal") : "doc"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "doc") setTab("doc");
                  else { setTab("form"); setOpenSection(v as SectionId); }
                }}
                className={`${inputCls} flex-1`}
              >
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.num} · {s.label}
                  </option>
                ))}
                <option value="doc">05 · Parse from document</option>
              </select>
            </label>
          </div>

          {tab === "doc" ? (
            /* Document upload */
            <div className="border-2 border-(--border-strong) bg-(--bg-content) p-6">
              <div className="mb-5 text-[10px] uppercase tracking-widest text-(--text-muted)" style={{ fontFamily: "var(--font-display)" }}>
                How it works
              </div>
              <ol className="mb-5 list-decimal space-y-2 pl-5 text-[13px] text-(--text-secondary)">
                <li>Download the template above (or use any CV/notes file).</li>
                <li>Fill it in with your details (.md / .txt / .pdf / any plain text).</li>
                <li>Upload it here or paste the text — the AI extracts your profile.</li>
              </ol>
              <input
                type="file"
                accept=".pdf,.md,.txt,.json,.csv"
                onChange={onFile}
                className="mb-4 block w-full text-[13px] text-(--text-muted) file:mr-3 file:rounded-none file:border-2 file:border-(--border-strong) file:bg-(--bg-content) file:px-4 file:py-2 file:text-[11px] file:font-bold file:text-(--text-primary) file:transition-colors file:hover:border-(--accent-primary) file:hover:text-(--accent-primary)"
                style={{ fontFamily: "var(--font-display)" }}
              />
              <textarea
                value={docText}
                onChange={(e) => setDocText(e.target.value.slice(0, 20000))}
                placeholder="…or paste your filled document / CV text here"
                className={`${inputCls} h-44 text-[12px]`}
                style={{ fontFamily: "var(--font-mono)" }}
              />
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={parseDoc}
                  disabled={parsing || docText.trim().length < 20}
                  className="btn btn-primary"
                >
                  {parsing ? "Parsing…" : "Parse with AI"}
                </button>
                {parseMsg ? (
                  <span className={`text-[12px] ${parseMsg.ok ? "text-(--accent-success)" : "text-(--accent-danger)"}`}>
                    {parseMsg.text}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            /* Active section form */
            <div>
              {SECTIONS.map((sec) => {
                if (openSection !== sec.id) return null;
                return (
                  <div key={sec.id}>
                    <div className="mb-6 flex items-center gap-3">
                      <span
                        className="text-[11px] font-bold text-(--accent-primary)"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {sec.num}
                      </span>
                      <h2
                        className="text-[12px] font-bold uppercase tracking-widest text-(--text-primary)"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {sec.label}
                      </h2>
                    </div>

                    {sec.id === "personal" && (
                      <div className="grid gap-5 md:grid-cols-2">
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
                      <div className="grid gap-5 md:grid-cols-2">
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
                      <div className="grid gap-5 md:grid-cols-2">
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
                          <label className="flex items-center gap-2.5 text-[12px] text-(--text-secondary)">
                            <input
                              type="checkbox"
                              checked={Boolean(p.needsFullFunding)}
                              onChange={(e) => set("needsFullFunding", e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-(--border) accent-(--accent-primary)"
                            />
                            I need fully-funded options only <span className="text-(--accent-primary)">*</span>
                          </label>
                          <label className="flex items-center gap-2.5 text-[12px] text-(--text-secondary)">
                            <input
                              type="checkbox"
                              checked={Boolean(p.remoteOnly)}
                              onChange={(e) => set("remoteOnly", e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-(--border) accent-(--accent-primary)"
                            />
                            Remote-only internships
                          </label>
                        </div>
                      </div>
                    )}

                    {sec.id === "experience" && (
                      <div className="space-y-5">
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
                      <div className="space-y-5">
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
                );
              })}
            </div>
          )}

          {/* Save button */}
          <div className="sticky bottom-0 mt-12 border-t border-(--border) bg-(--bg-content) pt-5 pb-5">
            <div className="flex items-center justify-between gap-4">
              {!requiredFieldsMet ? (
                <span
                  className="min-w-0 flex-1 text-[11px] leading-relaxed text-(--accent-danger)"
                  title="Fill these fields to enable saving"
                >
                  Fill in: {missingRequired.map((f) => f.label).join(", ")}
                </span>
              ) : <span />}
              <button
                onClick={save}
                disabled={!requiredFieldsMet}
                title={
                  requiredFieldsMet
                    ? undefined
                    : `Fill in: ${missingRequired.map((f) => f.label).join(", ")}`
                }
                className="btn btn-primary btn-lg"
              >
                Save & meet your agent →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
