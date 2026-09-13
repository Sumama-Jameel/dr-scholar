"use client";

import React from "react";

/**
 * Dependency-free Markdown renderer for LLM output.
 * Supports: headings (1-6), bold, italic, bold+italic, strikethrough, inline code,
 * links, bare URLs, ordered/unordered/task lists, blockquotes (with paragraphs),
 * fenced code blocks, tables (with alignment), horizontal rules.
 */

/* ─── Inline parser ─── */

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Order matters: *** before ** and *, ~~ before bare text
  const re =
    /(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(~~[^~]+~~)|(`[^`]+`)|(\[[^\]]+\]\((?:https?:\/\/)[^\s)]+\))|((?:https?:\/\/)[^\s<>()]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyBase}-i${i++}`;
    if (token.startsWith("***")) {
      out.push(
        <strong key={key} className="text-(--text-primary)">
          <em>{token.slice(3, -3)}</em>
        </strong>
      );
    } else if (token.startsWith("**")) {
      out.push(<strong key={key} className="text-(--text-primary)">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      out.push(<del key={key} className="text-(--text-muted) line-through">{token.slice(2, -2)}</del>);
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} className="rounded bg-(--bg-surface) px-1.5 py-0.5 text-[0.85em] text-(--text-primary)" style={{ fontFamily: "var(--font-mono)" }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const mm = token.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      if (mm) {
        out.push(
          <a key={key} href={mm[2]} target="_blank" rel="noreferrer"
             className="text-(--accent-primary) underline decoration-(--accent-primary)/30 underline-offset-2 hover:decoration-(--accent-primary)">
            {mm[1]}
          </a>
        );
      }
    } else if (token.startsWith("http")) {
      out.push(
        <a key={key} href={token} target="_blank" rel="noreferrer"
           className="break-all text-(--accent-primary) underline decoration-(--accent-primary)/30 underline-offset-2 hover:decoration-(--accent-primary)">
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

/* ─── Block types ─── */

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: { text: string; task?: boolean; checked?: boolean }[] }
  | { type: "ol"; items: { text: string; task?: boolean; checked?: boolean }[] }
  | { type: "quote"; paragraphs: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" }
  | { type: "table"; align: ("left" | "center" | "right")[]; rows: string[][] };

/* ─── Block parser ─── */

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // blank line → skip
    if (line.trim() === "") { i++; continue; }

    // fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]); i++;
      }
      i++;
      // check if it's actually a table inside a code fence
      const codeText = buf.join("\n");
      const codeLines = buf.filter((l) => l.trim() !== "");
      const isTable =
        codeLines.length >= 2 &&
        /^\s*\|.*\|\s*$/.test(codeLines[0]) &&
        /^\s*\|[\s:|-]+\|\s*$/.test(codeLines[1]);
      if (isTable) {
        const parsed = parseTable(codeLines);
        if (parsed) { blocks.push(parsed); continue; }
      }
      blocks.push({ type: "code", lang, text: codeText });
      continue;
    }

    // heading: # through ######
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2] }); i++; continue; }

    // horizontal rule: 3+ of the same character (-, *, or _) with optional spaces
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }

    // table (pipe-delimited)
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]); i++;
      }
      const parsed = parseTable(tableLines);
      if (parsed) blocks.push(parsed);
      continue;
    }

    // blockquote (collect all > lines, preserve blank lines as paragraph breaks)
    if (/^\s*>\s?/.test(line)) {
      const paras: string[] = [];
      let current: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        const content = lines[i].replace(/^\s*>\s?/, "");
        if (content.trim() === "") {
          // blank line in blockquote → paragraph break
          if (current.length > 0) { paras.push(current.join(" ")); current = []; }
        } else {
          current.push(content);
        }
        i++;
      }
      if (current.length > 0) paras.push(current.join(" "));
      blocks.push({ type: "quote", paragraphs: paras.length > 0 ? paras : [""] });
      continue;
    }

    // task list item: - [ ] or - [x]
    if (/^\s*[-*•]\s+\[[ xX]\]\s+/.test(line)) {
      const items: { text: string; task: boolean; checked: boolean }[] = [];
      while (i < lines.length && /^\s*[-*•]\s+\[[ xX]\]\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*[-*•]\s+\[([ xX])\]\s+(.*)/);
        if (m) items.push({ text: m[2], task: true, checked: m[1] !== " " });
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // unordered list
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: { text: string; task: boolean; checked: boolean }[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push({ text: lines[i].replace(/^\s*[-*•]\s+/, ""), task: false, checked: false });
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: { text: string; task: boolean; checked: boolean }[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push({ text: lines[i].replace(/^\s*\d+[.)]\s+/, ""), task: false, checked: false });
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // paragraph (collect until blank line or block-level syntax)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s|^\s*[-*•]\s|^\s*\d+[.)]\s|^\s*>|^\s*\||^\s*```|^\s*([-*_])\s*(\1\s*){2,}/.test(lines[i])
    ) {
      buf.push(lines[i]); i++;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }

  return blocks;
}

/* ─── Table parser ─── */

function parseTable(lines: string[]): Block | null {
  if (lines.length < 2) return null;

  const parseRow = (l: string): string[] =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const header = parseRow(lines[0]);
  const sepLine = lines[1];
  const sepCells = parseRow(sepLine);

  // alignment from separator row
  const align: ("left" | "center" | "right")[] = sepCells.map((c) => {
    const trimmed = c.trim();
    if (/^:-+:$/.test(trimmed)) return "center";
    if (/^-+:$/.test(trimmed)) return "right";
    return "left";
  });

  // ensure align array matches header width
  while (align.length < header.length) align.push("left");

  const rows: string[][] = [header];
  for (let j = 2; j < lines.length; j++) {
    const cells = parseRow(lines[j]);
    // skip separator-like rows (shouldn't appear but safety)
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue;
    rows.push(cells);
  }

  return { type: "table", align, rows };
}

/* ─── Component ─── */

export default function MiniMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);
  const headingCls = [
    "", // 0 (unused)
    "text-2xl font-bold",   // h1
    "text-xl font-bold",    // h2
    "text-lg font-semibold", // h3
    "text-base font-semibold", // h4
    "text-sm font-semibold uppercase tracking-wide", // h5
    "text-xs font-semibold uppercase tracking-wider", // h6
  ];

  return (
    <div className={`md-body space-y-3 ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "h": {
            const Tag = `h${b.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            return (
              <Tag key={key} className={`${headingCls[b.level] ?? headingCls[6]} text-(--text-primary)`} style={{ fontFamily: "var(--font-display)" }}>
                {inline(b.text, `${key}-h`)}
              </Tag>
            );
          }
          case "p":
            return <p key={key} className="whitespace-pre-wrap leading-relaxed">{inline(b.text, `${key}-p`)}</p>;
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j} className={it.task ? "list-none -ml-5" : ""}>
                    {it.task ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            it.checked
                              ? "border-(--accent-primary) bg-(--accent-primary) text-white"
                              : "border-(--border-strong) bg-(--bg-content)"
                          }`}
                        >
                          {it.checked ? "✓" : ""}
                        </span>
                        <span className={it.checked ? "text-(--text-muted) line-through" : ""}>
                          {inline(it.text, `${key}-li${j}`)}
                        </span>
                      </span>
                    ) : (
                      inline(it.text, `${key}-li${j}`)
                    )}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j} className={it.task ? "list-none -ml-5" : ""}>
                    {it.task ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                            it.checked
                              ? "border-(--accent-primary) bg-(--accent-primary) text-white"
                              : "border-(--border-strong) bg-(--bg-content)"
                          }`}
                        >
                          {it.checked ? "✓" : ""}
                        </span>
                        <span className={it.checked ? "text-(--text-muted) line-through" : ""}>
                          {inline(it.text, `${key}-oli${j}`)}
                        </span>
                      </span>
                    ) : (
                      inline(it.text, `${key}-oli${j}`)
                    )}
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={key} className="border-l-[3px] border-l-(--accent-primary) bg-(--accent-primary-light) pl-4 pr-3 py-2.5 text-(--text-secondary)">
                {b.paragraphs.map((p, j) => (
                  <p key={j} className={j > 0 ? "mt-2" : ""}>
                    {inline(p, `${key}-q${j}`)}
                  </p>
                ))}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-lg border border-(--border) bg-(--bg-surface) p-3.5 text-[12px] text-(--text-secondary)" style={{ fontFamily: "var(--font-mono)" }}>
                {b.lang ? (
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-(--text-muted)">{b.lang}</span>
                ) : null}
                <code>{b.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={key} className="border-(--border-strong)" />;
          case "table": {
            const [head, ...rows] = b.rows;
            if (!head) return null;
            return (
              <div key={key} className="overflow-x-auto rounded-lg border border-(--border)">
                <table>
                  <thead>
                    <tr>
                      {head.map((c, j) => (
                        <th key={j} style={{ textAlign: b.align[j] ?? "left" }}>
                          {inline(c, `${key}-th${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} style={{ textAlign: b.align[k] ?? "left" }}>
                            {inline(c, `${key}-td${j}-${k}`)}
                          </td>
                        ))}
                      </tr>
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
