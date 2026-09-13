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

type Msg = { id: string; role: "user" | "assistant"; text: string; tools: ToolEvent[] };

const SUGGESTIONS = [
  { label: "Full deep scan", desc: "Scholarships + internships matched to your profile" },
  { label: "Scholarships only", desc: "Focus on funding opportunities" },
  { label: "Internships only", desc: "Find work experiences and placements" },
  { label: "Ask me first", desc: "I haven't filled my profile — ask the key questions" },
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
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProfile(readProfileFromStorage());
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
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.t === "delta" && ev.v)
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
                tools[i] = { ...tools[i], status: ev.ok ? "done" : "error", summary: ev.summary, ms: ev.ms, top: ev.top };
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
        else if (ev.t === "done") { streamDone = true; gotDoneEvent = true; }
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
            ? m.text.trimEnd() + "\n\n_Response appears to have been cut off. Try again._"
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
      "Generated by Dr Scholar. Always verify deadlines on official pages.",
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
  const lastReportId = [...msgs].reverse().find((m) => m.role === "assistant" && m.text.trim())?.id;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-3xl flex-col">
      {/* Profile bar */}
      {!hasProfile ? (
        <div className="mb-3 border-2 border-(--border-strong) bg-(--bg-content) px-4 py-3 text-[12px] text-(--text-secondary)">
          No profile yet — the agent will ask you, or{" "}
          <Link href="/" className="font-medium text-(--accent-primary) underline decoration-(--accent-primary)/30 underline-offset-2 hover:decoration-(--accent-primary)">
            build your profile first
          </Link>
        </div>
      ) : null}

      {/* Toolbar (outside the bubbles — report download lives here) */}
      {lastReportId ? (
        <div className="flex items-center justify-end border-b border-(--border) pb-2">
          <button onClick={downloadReport} className="btn btn-sm">
            ↓ Report .md
          </button>
        </div>
      ) : null}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {msgs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded bg-(--accent-primary) text-[11px] font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
              DS
            </div>
            <h2
              className="text-[13px] font-bold tracking-wide text-(--text-primary)"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Dr Scholar
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-(--text-secondary)">
              I deep-research real scholarships &amp; internships matched to your profile, verify deadlines on official pages, and hand you an apply-plan.
            </p>
            <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => send(s.label === "Ask me first" ? s.desc : `Do a full ${s.label.toLowerCase()} for me`)}
                  className="rounded-xl border-2 border-(--border-strong) bg-(--bg-content) p-5 text-left transition-colors hover:border-(--accent-primary) hover:bg-(--bg-surface)"
                >
                  <p className="text-[11px] font-bold text-(--text-primary)" style={{ fontFamily: "var(--font-display)" }}>
                    {s.label}
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-(--text-muted)">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-5">
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-(--accent-primary) px-4 py-2.5 text-[13px] leading-relaxed text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="w-full space-y-2 rounded-xl border border-(--border) bg-white px-5 py-4 text-(--text-primary) shadow-sm">
                {m.tools.map((ev, i) => (
                  <ToolChip key={i} ev={ev} />
                ))}
                {m.text.trim() ? (
                  <div className="pl-1">
                    <MiniMarkdown text={m.text} />
                  </div>
                ) : null}
              </div>
            )
          )}
        </div>

        {busy ? (() => {
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          const hasRunningTool = lastAssistant?.tools.some((t) => t.status === "running") ?? false;
          // A running tool chip already shows its own status
          if (hasRunningTool) return null;
          const hasWork = (lastAssistant?.tools.length ?? 0) > 0 || (lastAssistant?.text.trim().length ?? 0) > 0;
          return (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-(--text-muted)">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-(--accent-primary)" />
              <span>{hasWork ? "Writing your report…" : "Thinking…"}</span>
            </div>
          );
        })() : null}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error ? (
        <div className="mb-2 rounded-lg border border-(--accent-danger)/20 bg-(--accent-danger)/5 p-3 text-[12px] text-(--accent-danger)">{error}</div>
      ) : null}

      {/* Input */}
      <div className="flex items-end gap-2 border-t-2 border-(--border-strong) bg-(--bg-content) pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask anything…"
          title="Enter to send · Shift+Enter for newline"
          rows={2}
          disabled={busy}
          className="flex-1 resize-none rounded border-2 border-(--border-strong) bg-(--bg-content) px-3 py-2.5 text-[13px] text-(--text-primary) placeholder-(--text-muted) outline-none transition-colors focus:border-(--accent-primary) focus:ring-1 focus:ring-(--accent-primary)/10 disabled:opacity-50"
        />
        {busy ? (
          <button onClick={stop} className="btn">
            Stop
          </button>
        ) : (
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="btn btn-primary"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
