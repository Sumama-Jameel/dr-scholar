"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import MiniMarkdown from "@/components/MiniMarkdown";
import ToolChip, { type ToolEvent } from "@/components/ToolChip";
import {
  profileToText,
  readProfileFromStorage,
  type ProfileInput,
} from "@/lib/profile";

type Health = { ok: boolean; model: string; hasKey: boolean; keySource?: string | null; extras: { tavily: boolean; adzuna: boolean; usajobs: boolean } };
type Msg = { id: string; role: "user" | "assistant"; text: string; tools: ToolEvent[] };

const SUGGESTIONS = [
  { icon: "🔬", label: "Full deep scan", desc: "Scholarships + internships matched to your profile" },
  { icon: "🎓", label: "Scholarships only", desc: "Focus on funding opportunities" },
  { icon: "💼", label: "Internships only", desc: "Find work experiences and placements" },
  { icon: "💬", label: "Ask me first", desc: "I haven't filled my profile — ask the key questions" },
];

let idCounter = 0;
const nextId = () => `m${++idCounter}-${Date.now()}`;

type StreamEv = {
  t: "meta" | "delta" | "tool" | "tool-done" | "error" | "done";
  model?: string;
  v?: string;
  name?: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  summary?: string;
  ms?: number;
  top?: { title: string; url: string; source?: string; deadline?: string }[];
  message?: string;
};

export default function ChatPage() {
  const [profile, setProfile] = useState<ProfileInput>({});
  const [health, setHealth] = useState<Health | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProfile(readProfileFromStorage());
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const patchAssistant = (id: string, fn: (m: Msg) => Msg) =>
    setMsgs((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const userMsg: Msg = { id: nextId(), role: "user", text, tools: [] };
    const assistantId = nextId();
    const outgoing = [...msgs, userMsg];
    setMsgs([...outgoing, { id: assistantId, role: "assistant", text: "", tools: [] }]);
    setBusy(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: outgoing.map((m) => ({ role: m.role, text: m.text })),
          profile: readProfileFromStorage(),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;
      let gotDoneEvent = false;

      const processLine = (line: string) => {
        if (!line) return;
        let ev: StreamEv;
        try {
          ev = JSON.parse(line);
        } catch {
          return;
        }
        if (ev.t === "meta" && ev.model) setModel(ev.model);
        else if (ev.t === "delta" && ev.v)
          patchAssistant(assistantId, (m) => ({ ...m, text: m.text + ev.v }));
        else if (ev.t === "tool" && ev.name)
          patchAssistant(assistantId, (m) => ({
            ...m,
            tools: [...m.tools, { name: ev.name!, args: ev.args, status: "running" }],
          }));
        else if (ev.t === "tool-done" && ev.name)
          patchAssistant(assistantId, (m) => {
            const tools = [...m.tools];
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === ev.name && tools[i].status === "running") {
                tools[i] = {
                  ...tools[i],
                  status: ev.ok ? "done" : "error",
                  summary: ev.summary,
                  ms: ev.ms,
                  top: ev.top,
                };
                break;
              }
            }
            return { ...m, tools };
          });
        else if (ev.t === "error")
          patchAssistant(assistantId, (m) => ({
            ...m,
            text: (m.text ? m.text + "\n\n" : "") + `${ev.message ?? "error"}`,
          }));
        else if (ev.t === "done") {
          streamDone = true;
          gotDoneEvent = true;
        }
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          processLine(buffer.slice(0, nl).trim());
          buffer = buffer.slice(nl + 1);
        }
        if (done) break;
      }
      processLine(buffer.trim());
      if (!gotDoneEvent) {
        patchAssistant(assistantId, (m) => ({
          ...m,
          text: m.text.trim()
            ? m.text.trimEnd() + "\n\n_Response appears to have been cut off (stream ended early). Try again or ask for a shorter answer._"
            : m.text,
        }));
      }
    } catch (e: unknown) {
      const err = e as Error;
      if (err.name !== "AbortError") setError(err.message || "Request failed");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  function downloadReport() {
    const last = [...msgs].reverse().find((m) => m.role === "assistant" && m.text.trim());
    const md = [
      "# Dr Scholar — Research Report",
      "",
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      "",
      "## My profile",
      profileToText(profile),
      "",
      "## Agent findings",
      "",
      last?.text ?? "(no report yet)",
      "",
      "---",
      "Generated by Dr Scholar (free-stack AI agent). Always verify deadlines on official pages.",
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dr-scholar-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasProfile = Object.keys(profile).length > 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-4xl flex-col">
      {/* health / profile bars */}
      {health && !health.hasKey ? (
        <div className="mb-3 rounded-xl border border-[--accent-danger]/30 bg-[--accent-danger]/5 p-3 text-sm text-[--accent-danger]">
          No Gemini key found (looked for GEMINI_API_KEY / GOOGLE_API_KEY env vars) — the agent
          can&apos;t think. Free key:{" "}
          <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>{" "}
          → then restart the app.
        </div>
      ) : null}
      {health?.hasKey ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[--text-muted]">
          <span className="rounded-full bg-[--accent-success]/10 px-2.5 py-0.5 text-[--accent-success]">
            Dr Scholar · ready
          </span>
          {health.extras.tavily ? (
            <span className="rounded-full bg-[--bg-surface] px-2.5 py-0.5">Tavily ✓</span>
          ) : null}
        </div>
      ) : null}
      {!hasProfile ? (
        <div className="mb-3 rounded-xl border border-[--accent-gold]/30 bg-[--accent-gold]/5 p-3 text-sm text-[--accent-gold]">
          No profile yet — the agent will ask you a few questions, or{" "}
          <Link href="/" className="font-semibold underline">
            build your profile first →
          </Link>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-[--border] bg-[--bg-surface] px-3.5 py-2 text-xs text-[--text-muted]">
          <span>
            <strong className="text-[--text-primary]">{profile.fullName || "You"}</strong> · {(profile.level ?? "level?").replace(/_/g, " ")} ·{" "}
            {profile.field ?? "field?"}{profile.citizenship ? ` · ${profile.citizenship}` : ""}
          </span>
          <Link href="/" className="text-[--accent-primary-light] underline decoration-[--accent-primary]/30 hover:decoration-[--accent-primary]">
            edit
          </Link>
        </div>
      )}

      {/* messages area */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-[--border] bg-[--bg-surface]/50 p-4">
        {msgs.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[--accent-primary] to-[--accent-primary-light] text-2xl text-white shadow-xl shadow-[--accent-primary]/20">
              DS
            </div>
            <h2 className="text-xl font-bold text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
              Dr Scholar is ready
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[--text-secondary]">
              I deep-research real scholarships &amp; internships matched to YOUR profile, verify
              deadlines on official pages, and hand you an apply-plan. Pick a starting point:
            </p>
            <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 gap-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => send(s.label === "Ask me first" ? s.desc : `Do a full ${s.label.toLowerCase()} for me`)}
                  className="group rounded-xl border border-[--border] bg-[--bg-surface] p-4 text-left transition-all hover:border-[--accent-primary]/40 hover:bg-[--bg-surface-hover] hover:shadow-lg hover:shadow-[--accent-primary]/5"
                >
                  <span className="text-xl">{s.icon}</span>
                  <p className="mt-2 text-sm font-semibold text-[--text-primary]" style={{ fontFamily: "var(--font-display)" }}>
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[--text-muted]">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-gradient-to-br from-[--accent-primary] to-[#4F46E5] px-4 py-2.5 text-sm text-white shadow-md shadow-[--accent-primary]/10">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="w-full space-y-1.5">
              {m.tools.map((ev, i) => (
                <ToolChip key={i} ev={ev} />
              ))}
              {m.text.trim() ? (
                <div className="rounded-xl border-l-2 border-[--accent-primary]/20 pl-4">
                  <MiniMarkdown text={m.text} />
                </div>
              ) : null}
            </div>
          )
        )}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-[--text-muted]">
            <span className="pulse-dot h-2 w-2 rounded-full bg-[--accent-primary]" />
            <span>Thinking…</span>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* error */}
      {error ? (
        <div className="mt-2 rounded-lg bg-[--accent-danger]/10 p-3 text-sm text-[--accent-danger]">{error}</div>
      ) : null}

      {/* input area */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask anything: 'find me internships for next summer', 'am I eligible for DAAD?', …"
          rows={2}
          disabled={busy}
          className="flex-1 resize-none rounded-xl border border-[--border] bg-[--bg-surface] px-4 py-3 text-sm text-[--text-primary] placeholder-[--text-muted] outline-none transition-colors focus:border-[--accent-primary] focus:ring-1 focus:ring-[--accent-primary]/30 disabled:opacity-50"
        />
        {busy ? (
          <button
            onClick={stop}
            className="rounded-xl bg-[--bg-surface] border border-[--border] px-5 py-3 text-sm font-semibold text-[--text-primary] transition-colors hover:bg-[--accent-danger]/10 hover:border-[--accent-danger]/30 hover:text-[--accent-danger]"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="rounded-xl bg-[--accent-primary] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[--accent-primary]/20 transition-all hover:bg-[--accent-primary-light] disabled:opacity-40"
          >
            Send ↵
          </button>
        )}
      </div>

      {/* footer hints */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-[--text-muted]">
        <span>Enter to send · Shift+Enter for newline · deep scans may take a few minutes</span>
        <button
          onClick={downloadReport}
          disabled={!msgs.some((m) => m.role === "assistant" && m.text.trim())}
          className="rounded-md border border-[--border] px-2.5 py-1 text-[--text-muted] transition-colors hover:border-[--accent-primary] hover:text-[--text-primary] disabled:opacity-30"
        >
          Download report (.md)
        </button>
      </div>
    </div>
  );
}
