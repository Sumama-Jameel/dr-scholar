"use client";

import React from "react";

/**
 * Tiny dependency-free Markdown renderer (headings, tables, lists, links,
 * bold/italic/code). Good enough for agent reports without a heavy lib.
 */

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re =
    /(\*\*[^*]+\**)|(\*[^*\n]+\*)|(`[^`]+`)|(\[[^\]]+\]\((?:https?:\/\/)[^\s)]+\))|((?:https?:\/\/)[^\s<>()]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyBase}-i${i++}`;
    if (token.startsWith("**")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} className="rounded bg-slate-800 px-1 py-0.5 text-[0.85em] text-indigo-200">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const mm = token.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      if (mm) {
        out.push(
          <a key={key} href={mm[2]} target="_blank" rel="noreferrer"
             className="text-indigo-300 underline decoration-indigo-500/40 hover:text-indigo-200">
            {mm[1]}
          </a>
        );
      }
    } else if (token.startsWith("http")) {
      out.push(
        <a key={key} href={token} target="_blank" rel="noreferrer"
           className="break-all text-indigo-300 underline decoration-indigo-500/40 hover:text-indigo-200">
          {token.length > 60 ? token.slice(0, 57) + "…" : token}
        </a>
      );
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "hr" }
  | { type: "table"; rows: string[][] };

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]); i++;
      }
      i++;
      // If the code block actually contains a markdown table (header + separator),
      // render it as a table instead of raw code so tables aren't hidden in <pre>.
      const isTable =
        buf.length >= 2 &&
        /^\s*\|.*\|\s*$/.test(buf[0]) &&
        /^\s*\|[\s:|-]+\|\s*$/.test(buf[1]);
      if (isTable) {
        const rows: string[][] = buf
          .filter((l) => /^\s*\|.*\|\s*$/.test(l))
          .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
        blocks.push({ type: "table", rows });
        continue;
      }
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2] }); i++; continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "")
          .split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, "")); i++;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s|^\s*[-*•]\s|^\s*\d+[.)]\s|^\s*>|^\s*\||^\s*```/.test(lines[i])
    ) {
      buf.push(lines[i]); i++;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }
  return blocks;
}

export default function MiniMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={`md-body space-y-3 ${className}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h": {
            const cls =
              b.level === 1 ? "text-xl font-bold text-white"
              : b.level === 2 ? "text-lg font-bold text-white"
              : b.level === 3 ? "text-base font-semibold text-slate-100"
              : "text-sm font-semibold uppercase tracking-wide text-slate-300";
            return <p key={i} className={cls}>{inline(b.text, `h${i}`)}</p>;
          }
          case "p":
            return <p key={i} className="whitespace-pre-wrap leading-relaxed">{inline(b.text, `p${i}`)}</p>;
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{inline(it, `ul${i}-${j}`)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => <li key={j}>{inline(it, `ol${i}-${j}`)}</li>)}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-indigo-500/50 pl-3 italic text-slate-300">
                {inline(b.text, `q${i}`)}
              </blockquote>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
                <code>{b.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={i} className="border-slate-800" />;
          case "table": {
            const [head, ...rows] = b.rows;
            if (!head) return null;
            return (
              <div key={i} className="overflow-x-auto">
                <table>
                  <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `th${i}-${j}`)}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c, `td${i}-${j}-${k}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
