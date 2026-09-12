"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MiniMarkdown from "@/components/MiniMarkdown";
import ToolChip, { type ToolEvent } from "@/components/ToolChip";
import {
  profileCompleteness,
  profileToText,
  readProfileFromStorage,
  type ProfileInput,
} from "@/lib/profile";

type Health = { ok: boolean; model: string; hasKey: boolean; keySource?: string | null; extras: { tavily: boolean; adzuna: boolean; usajobs: boolean } };
type Msg = { id: string; role: "user" | "assistant"; text: string; tools: ToolEvent[] };

const SUGGESTIONS = [
  "🔬 Do a full deep scan for me — scholarships + internships",
  "🎓 Find scholarships only",
  "💼 Find internships only",
  "❓ I haven't filled the profile — ask me the key questions",
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
            text: (m.text ? m.text + "\n\n" : "") + `⚠️ ${ev.message ?? "error"}`,
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
      // Flush any trailing data that arrived without a final newline.
      processLine(buffer.trim());
      // If the server closed without sending a done event, note truncation.
      if (!gotDoneEvent) {
        patchAssistant(assistantId, (m) => ({
          ...m,
          text: m.text.trim()
            ? m.text.trimEnd() + "\n\n⚠️ _Response appears to have been cut off (stream ended early). Try again or ask for a shorter answer._"
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
  const completeness = useMemo(() => profileCompleteness(profile), [profile]);

  return (
    <div className="mx-auto flex h-[calc(100vh-10rem)] max-w-4xl flex-col">
      {health && !health.hasKey ? (
        <div className="mb-3 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          ⚠️ No Gemini key found (looked for GEMINI_API_KEY / GOOGLE_API_KEY env vars) — the agent
          can&apos;t think. Free key:{" "}
          <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>{" "}
          → then restart the app.
        </div>
      ) : null}
      {health?.hasKey ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded-full bg-emerald-950/60 px-2 py-0.5 text-emerald-300">
            🩺 Dr Scholar · ready
          </span>
          {health.extras.tavily ? (
            <span className="rounded-full bg-slate-800/70 px-2 py-0.5">Tavily ✓</span>
          ) : null}
        </div>
      ) : null}
      {!hasProfile ? (
        <div className="mb-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          No profile yet — the agent will ask you a few questions, or{" "}
          <Link href="/" className="font-semibold underline">
            build your profile first →
          </Link>
        </div>
            ) : (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-400">
          <span>
            🎓 {profile.fullName || "You"} · {(profile.level ?? "level?").replace(/_/g, " ")} ·{" "}
            {profile.field ?? "field?"}{profile.citizenship ? ` · ${profile.citizenship}` : ""}
          </span>
          <Link href="/" className="underline hover:text-slate-200">
            edit
          </Link>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        {msgs.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-5xl">🩺</div>
            <h2 className="mt-3 text-lg font-bold text-white">Dr Scholar is ready</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              I deep-research real scholarships &amp; internships matched to YOUR profile, verify
              deadlines on official pages, and hand you an apply-plan. Pick a starting point:
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 hover:border-indigo-500 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600/90 px-4 py-2.5 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="w-full space-y-1">
              {m.tools.map((ev, i) => (
                <ToolChip key={i} ev={ev} />
              ))}
              {m.text.trim() ? <MiniMarkdown text={m.text} /> : null}
            </div>
          )
        )}
        {busy ? <div className="shimmer h-1.5 w-40 rounded-full" /> : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="mt-2 rounded-lg bg-red-950/50 p-3 text-sm text-red-200">⚠️ {error}</div>
      ) : null}

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
          className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        {busy ? (
          <button
            onClick={stop}
            className="rounded-xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-600"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Send ↵
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
        <span>Enter to send · Shift+Enter for newline · deep scans may take a few minutes</span>
        <button
          onClick={downloadReport}
          disabled={!msgs.some((m) => m.role === "assistant" && m.text.trim())}
          className="rounded-md border border-slate-800 px-2 py-1 text-slate-400 hover:border-indigo-600 hover:text-slate-200 disabled:opacity-30"
        >
          ⬇ Download report (.md)
        </button>
      </div>
    </div>
  );
}

