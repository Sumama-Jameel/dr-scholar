/** Minimal HTML helpers — no external deps, serverless-friendly and fast. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z#0-9]+);/g, (m, name) => ENTITIES[name] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

export function collapse(text: string): string {
  return text
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}

export function extractTitle(html: string): string {
  const m =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? collapse(stripTags(m[1])).slice(0, 200) : "";
}

/** Converts an HTML page into readable plain text. */
export function htmlToText(html: string): string {
  return collapse(stripTags(html));
}

const MONTHS =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|september|october|november|december|january|february|march|april|june|july|august";
const YEAR = "20[2-3]\\d";

/** Finds deadline-ish strings on a page. Returns up to 4, most relevant first. */
export function extractDeadlines(text: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const v = collapse(s).replace(/^[^a-z0-9]+/i, "");
    if (v.length < 4 || v.length > 80) return;
    if (!out.includes(v)) out.push(v);
  };
  // "deadline", "apply by", "applications close" followed by a date-ish chunk
  const kw = new RegExp(
    `(deadline|apply\\s+by|applications?\\s+(?:close|due)|closing\\s+date|due\\s+date|closes)[:\\s]{0,3}([^\\n]{4,80})`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = kw.exec(text)) && out.length < 8) {
    const tail = m[2];
    const dateish = tail.match(
      new RegExp(
        `((?:${MONTHS})\\.?\\s*\\d{1,2},?\\s*${YEAR}|\\d{1,2}\\s+(?:${MONTHS})\\.?\\s*,?\\s*${YEAR}|${YEAR}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})`,
        "i"
      )
    );
    push(dateish ? dateish[0] : tail);
  }
  // bare dates near the word deadline/apply (same sentence window)
  if (out.length < 4) {
    const bare = new RegExp(
      `((?:${MONTHS})\\.?\\s*\\d{1,2},?\\s*${YEAR}|\\d{1,2}\\s+(?:${MONTHS})\\.?\\s*,?\\s*${YEAR})`,
      "gi"
    );
    while ((m = bare.exec(text)) && out.length < 6) push(m[0]);
  }
  return out.slice(0, 4);
}

/** Extracts funding signals: amounts, "fully funded", stipends… */
export function extractFunding(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\$\s?\d[\d,.]*\s?(?:thousand|million|k\b)?/i,
    /€\s?\d[\d,.]*/i,
    /£\s?\d[\d,.]*/i,
    /\b\d[\d,.]*\s?(?:EUR|USD|GBP)\b/i,
    /\bfully[- ]funded\b/i,
    /\bfull (?:tuition|funding|scholarship)s?\b/i,
    /\bstipend(?:iary)?\b/i,
    /\bmonthly allowance\b/i,
    /\btuition (?:fee )?waiv(?:er|ed)\b/i,
    /\bmonthly\s?(?:salary|payment)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && !out.some((o) => o.toLowerCase().includes(m[0].toLowerCase()))) {
      out.push(m[0]);
    }
    if (out.length >= 4) break;
  }
  return out;
}

/** Grabs a snippet around eligibility/deadline/apply words, else the first paragraph. */
export function extractRelevantSnippet(text: string, max = 420): string {
  const idx = text.search(/eligib|deadline|apply|stipend|funded|requirement/i);
  const start = idx > 120 ? Math.max(0, idx - 150) : 0;
  const slice = text.slice(start, start + max * 2);
  return collapse(slice).slice(0, max);
}

/** Splits a comma separated string into a clean string array. */
export function parseList(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}
