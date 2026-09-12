"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  profileCompleteness,
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
  "w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1 flex items-baseline gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{children}</span>
      {hint ? <span className="text-[11px] text-slate-600">{hint}</span> : null}
    </span>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [p, setP] = useState<ProfileInput>({});
  const [tab, setTab] = useState<"form" | "doc">("form");
  const [docText, setDocText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Raw draft text for list fields — keeps commas/newlines typeable while editing.
  // Values are only split into arrays on save.
  const LIST_KEYS = ["fieldKeywords", "targetCountries", "languages", "interests", "links"];
  const LINE_KEYS = ["experience", "achievements"];
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => setP(readProfileFromStorage()), []);

  const set = (k: keyof ProfileInput, v: unknown) => setP((prev) => ({ ...prev, [k]: v }));
  const c = profileCompleteness(p);

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setDocText(text.slice(0, 20000));
    setParseMsg({ ok: true, text: `Loaded “${f.name}” (${Math.round(text.length / 1024)} KB) — hit Parse.` });
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
      setDrafts({}); // parsed arrays now drive the fields via draftFor()
      setParseMsg({ ok: true, text: "✅ Parsed! Review the fields, then Save & meet your agent." });
      setTab("form");
    } catch (e) {
      setParseMsg({ ok: false, text: `⚠️ ${(e as Error).message}` });
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-white">Build your student profile</h1>
      <p className="mt-1 text-sm text-slate-400">
        Everything stays in <b>your browser</b> (localStorage). The agent uses it to personalize
        research. Fill what you can — the agent asks for anything critical that's missing.
      </p>

      {/* completeness */}
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Profile strength: <b className="text-slate-200">{c.score}%</b>
          </span>
          <span>{c.missing.length ? `missing: ${c.missing.slice(0, 4).join(", ")}` : "all core fields ✓"}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all"
            style={{ width: `${c.score}%` }}
          />
        </div>
      </div>

      {/* tabs */}
      <div className="mt-5 flex gap-2">
        {(["form", "doc"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-indigo-600 text-white" : "bg-slate-800/70 text-slate-300 hover:bg-slate-700/70"
            }`}
          >
            {t === "form" ? "🧾 Quick form" : "📄 Fill the document"}
          </button>
        ))}
        <a
          href="/student-profile-template.md"
          download
          className="ml-auto rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-indigo-500 hover:text-white"
        >
          ⬇ Download template (.md)
        </a>
      </div>

      {tab === "doc" ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-400">
            <li>Download the template above (or use any CV/notes file).</li>
            <li>Fill it in with your details (.md / .txt / any plain text).</li>
            <li>Upload it here or paste the text — the AI extracts your profile.</li>
          </ol>
          <input
            type="file"
            accept=".md,.txt,.json,.csv,text/*"
            onChange={onFile}
            className="mb-3 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500"
          />
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value.slice(0, 20000))}
            placeholder="…or paste your filled document / CV text here"
            className={`${inputCls} h-48 font-mono`}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={parseDoc}
              disabled={parsing || docText.trim().length < 20}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {parsing ? "Parsing…" : "🪄 Parse with AI"}
            </button>
            {parseMsg ? (
              <span className={`text-sm ${parseMsg.ok ? "text-emerald-300" : "text-amber-300"}`}>
                {parseMsg.text}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5 md:grid-cols-2">
          <label><Label>Full name</Label>
            <input className={inputCls} value={p.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} placeholder="Amina Yusuf" />
          </label>
          <label><Label>Age</Label>
            <input type="number" min={10} max={80} className={inputCls} value={p.age ?? ""} onChange={(e) => set("age", e.target.value ? Number(e.target.value) : undefined)} placeholder="21" />
          </label>
          <label><Label>Citizenship</Label>
            <input className={inputCls} value={p.citizenship ?? ""} onChange={(e) => set("citizenship", e.target.value)} placeholder="Kenya" />
          </label>
          <label><Label>Country of residence</Label>
            <input className={inputCls} value={p.residence ?? ""} onChange={(e) => set("residence", e.target.value)} placeholder="Kenya" />
          </label>
          <label><Label>Academic level</Label>
            <select className={inputCls} value={p.level ?? ""} onChange={(e) => set("level", e.target.value || undefined)}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label><Label>Field of study</Label>
            <input className={inputCls} value={p.field ?? ""} onChange={(e) => set("field", e.target.value)} placeholder="Computer Science" />
          </label>
          <label><Label>Field keywords <span className="normal-case">(comma separated)</span></Label>
            <input className={inputCls} value={draftFor("fieldKeywords")} onChange={(e) => setDrafts({ ...drafts, fieldKeywords: e.target.value })} placeholder="AI, machine learning, web dev" />
          </label>
          <label><Label>GPA / grades <span className="normal-case">(as-is)</span></Label>
            <input className={inputCls} value={p.gpa ?? ""} onChange={(e) => set("gpa", e.target.value)} placeholder="8.7/10 CGPA" />
          </label>
          <label><Label>Graduation year</Label>
            <input type="number" className={inputCls} value={p.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value ? Number(e.target.value) : undefined)} placeholder="2027" />
          </label>
          <label><Label>English test</Label>
            <input className={inputCls} value={p.englishTests ?? ""} onChange={(e) => set("englishTests", e.target.value)} placeholder="IELTS 7.5 / TOEFL 100 / none yet" />
          </label>
          <label><Label>Other tests</Label>
            <input className={inputCls} value={p.otherTests ?? ""} onChange={(e) => set("otherTests", e.target.value)} placeholder="GRE 325 / SAT 1400 / none" />
          </label>
          <label><Label>Target countries <span className="normal-case">(comma separated)</span></Label>
            <input className={inputCls} value={(p.targetCountries ?? []).join(", ")} onChange={(e) => set("targetCountries", parseList(e.target.value))} placeholder="Germany, Canada, remote" />
          </label>
          <label><Label>Availability window</Label>
            <input className={inputCls} value={p.deadlineWindow ?? ""} onChange={(e) => set("deadlineWindow", e.target.value)} placeholder="programs starting Fall 2027" />
          </label>
          <label><Label>Languages <span className="normal-case">(comma separated)</span></Label>
            <input className={inputCls} value={draftFor("languages")} onChange={(e) => setDrafts({ ...drafts, languages: e.target.value })} placeholder="English (fluent), French (A2)" />
          </label>
          <label><Label>Interests <span className="normal-case">(comma separated)</span></Label>
            <input className={inputCls} value={draftFor("interests")} onChange={(e) => setDrafts({ ...drafts, interests: e.target.value })} placeholder="open source, robotics, climate" />
          </label>
          <label><Label>Links <span className="normal-case">(LinkedIn/GitHub/portfolio)</span></Label>
            <input className={inputCls} value={draftFor("links")} onChange={(e) => setDrafts({ ...drafts, links: e.target.value })} placeholder="github.com/you, linkedin.com/in/you" />
          </label>
          <label className="md:col-span-2"><Label>Experience <span className="normal-case">(jobs, projects, volunteering — one per line)</span></Label>
            <textarea className={`${inputCls} h-24`} value={draftFor("experience")} onChange={(e) => setDrafts({ ...drafts, experience: e.target.value })} placeholder={"Hackathon winner — 2026\nBuilt a school website (WordPress)\nVolunteer math tutor"} />
          </label>
          <label className="md:col-span-2"><Label>Achievements <span className="normal-case">(awards, publications, competitions)</span></Label>
            <textarea className={`${inputCls} h-20`} value={draftFor("achievements")} onChange={(e) => setDrafts({ ...drafts, achievements: e.target.value })} placeholder="National science fair — 2nd place" />
          </label>
          <label className="md:col-span-2"><Label>Constraints <span className="normal-case">(visa, money, relocation limits…)</span></Label>
            <textarea className={`${inputCls} h-16`} value={p.constraints ?? ""} onChange={(e) => set("constraints", e.target.value)} placeholder="Cannot pay any fees; needs visa-friendly countries" />
          </label>
          <label className="md:col-span-2"><Label>Notes</Label>
            <textarea className={`${inputCls} h-16`} value={p.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else the agent should know" />
          </label>
          <div className="flex gap-6 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={Boolean(p.needsFullFunding)} onChange={(e) => set("needsFullFunding", e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-800" />
              I need fully-funded options only 💸
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={Boolean(p.remoteOnly)} onChange={(e) => set("remoteOnly", e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-800" />
              Remote-only internships 🏠
            </label>
          </div>
        </div>
      )}

      <div className="sticky bottom-4 mt-6 flex justify-end">
        <button
          onClick={save}
          className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/40 hover:bg-indigo-500"
        >
          Save profile & meet your agent →
        </button>
      </div>
    </div>
  );
}
