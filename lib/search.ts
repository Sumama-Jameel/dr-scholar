import { collapse, stripTags } from "./html";

export type SearchHit = { title: string; url: string; snippet: string; engine: string };
export type EngineStatus = {
  engine: string;
  ok: boolean;
  hits: number;
  ms: number;
  error?: string;
};

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Hosts that are useless as research sources for this app. */
export const BLOCKED_HOSTS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "pinterest.",
  "linkedin.com",
  "youtube.com",
  "quora.com",
  "fastweb.com",
  "duckduckgo.com",
  "mojeek.com",
  "google.",
  "bing.com",
  "yandex.",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isBlockedUrl(url: string): boolean {
  const h = hostOf(url);
  if (!h) return true;
  if (url.includes("/y.js") || url.includes("uddg=")) return true;
  return BLOCKED_HOSTS.some((b) => h === b || h.includes(b));
}

export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return u.hostname.replace(/^www\./, "") + path + (u.search || "");
  } catch {
    return url;
  }
}

/* ───────────────────────── engines ───────────────────────── */

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function tavilySearch(query: string, max: number): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  return withTimeout(async (signal) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: max,
        search_depth: "basic",
      }),
      signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        title: String(r.title ?? "").slice(0, 220),
        url: String(r.url),
        snippet: String(r.content ?? "").slice(0, 320),
        engine: "tavily",
      }));
  }, 9000);
}

/**
 * GitHub code/repo search — free API, no key (10 req/min unauthenticated).
 * Works from serverless IPs. Great for finding scholarship/internship lists,
 * application templates, and curated repos. Rate-limited, so guarded.
 */
let ghCalls = 0;
let ghWindow = 0;
async function githubSearch(query: string, max: number): Promise<SearchHit[]> {
  const now = Date.now();
  if (now - ghWindow > 60_000) {
    ghWindow = now;
    ghCalls = 0;
  }
  if (ghCalls >= 8) return []; // stay under the 10 req/min unauth limit
  ghCalls++;
  return withTimeout(async (signal) => {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${max}&sort=stars&order=desc`,
      { headers: { accept: "application/vnd.github+json", "user-agent": "DrScholar/1.0" }, signal }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as {
      items?: { full_name?: string; html_url?: string; description?: string; stargazers_count?: number }[];
    };
    return (data.items ?? [])
      .filter((r) => r.html_url && !isBlockedUrl(r.html_url))
      .slice(0, max)
      .map((r) => ({
        title: `[GitHub] ${r.full_name ?? ""}`,
        url: String(r.html_url),
        snippet: `${(r.description ?? "").slice(0, 260)} · ⭐${r.stargazers_count ?? 0}`,
        engine: "github",
      }));
  }, 7000);
}

/**
 * Wikipedia API — free, no key, works from serverless IPs. Good for program
 * background (e.g. "MEXT scholarship", "DAAD", "Commonwealth Scholarship").
 */
async function wikipediaSearch(query: string, max: number): Promise<SearchHit[]> {
  return withTimeout(async (signal) => {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${Math.min(max, 8)}&srprop=snippet`,
      { headers: { accept: "application/json", "user-agent": "DrScholar/1.0" }, signal }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as { query?: { search?: { title?: string; snippet?: string }[] } };
    const out: SearchHit[] = [];
    for (const r of data.query?.search ?? []) {
      const title = String(r.title ?? "");
      if (!title || out.length >= max) break;
      out.push({
        title: `[Wikipedia] ${title}`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        snippet: String(r.snippet ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
        engine: "wikipedia",
      });
    }
    return out;
  }, 7000);
}

/**
 * Hacker News (Algolia) — free, no key, works from serverless IPs. Surfaces
 * community discussion about programs, deadlines and experiences.
 */
async function hnSearch(query: string, max: number): Promise<SearchHit[]> {
  return withTimeout(async (signal) => {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${Math.min(max, 8)}`,
      { headers: { accept: "application/json", "user-agent": "DrScholar/1.0" }, signal }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as { hits?: { title?: string; url?: string; objectID?: string }[] };
    return (data.hits ?? [])
      .filter((h) => h.title)
      .slice(0, max)
      .map((h) => ({
        title: `[HN] ${String(h.title ?? "")}`,
        url: h.url ? String(h.url) : `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: `Hacker News discussion${h.objectID ? ` · id=${h.objectID}` : ""}`,
        engine: "hn",
      }))
      .filter((h) => h.url && !isBlockedUrl(h.url));
  }, 7000);
}

/**
 * Search engine reality (verified live in 2026-09): DuckDuckGo, Mojeek and
 * public SearXNG instances all gate unattended/datacenter clients with
 * bot-challenges. The chain below still tries DDG-HTML → DDG-Lite → Mojeek
 * (they work from many residential IPs); on serverless IPs the curated
 * catalog + jobs APIs + fetch_page keep the agent useful, and the optional
 * free Tavily key (TAVILY_API_KEY) restores real web search.
 *
 * Paid fallback (last in the chain, so free engines answer first):
 * you.com (YOU_API_KEY) — POST ydc-index.io/v1/search. Burns one credit per
 * call, so it only runs if the free engines + catalog didn't fill results.
 */

async function youSearch(query: string, max: number): Promise<SearchHit[]> {
  const key = process.env.YOU_API_KEY;
  if (!key) return [];
  return withTimeout(async (signal) => {
    const res = await fetch("https://ydc-index.io/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ query, count: max }),
      signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()) as {
      results?: { web?: { title?: string; url?: string; description?: string }[] };
    };
    return (data.results?.web ?? [])
      .filter((r) => r.url && !isBlockedUrl(r.url))
      .slice(0, max)
      .map((r) => ({
        title: String(r.title ?? "").slice(0, 220),
        url: String(r.url),
        snippet: String(r.description ?? "").slice(0, 320),
        engine: "you.com",
      }));
  }, 9000);
}

function unwrapDdg(href: string): string | null {
  try {
    let u = href.startsWith("//") ? "https:" + href : href;
    if (u.includes("duckduckgo.com")) {
      if (u.includes("/y.js")) return null; // sponsored link
      const m = u.match(/[?&]uddg=([^&]+)/);
      if (!m) return null;
      u = decodeURIComponent(m[1]);
    }
    return /^https?:\/\//i.test(u) ? u : null;
  } catch {
    return null;
  }
}

async function ddgHtml(query: string, max: number): Promise<SearchHit[]> {
  return withTimeout(async (signal) => {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": BROWSER_UA,
        accept: "text/html",
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const anchors =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    const snips: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = snippets.exec(html)) && snips.length < max * 2) {
      snips.push(collapse(stripTags(m[1])));
    }
    const hits: SearchHit[] = [];
    let i = 0;
    while ((m = anchors.exec(html)) && hits.length < max) {
      const url = unwrapDdg(m[1]);
      i++;
      if (!url || isBlockedUrl(url)) continue;
      hits.push({
        title: collapse(stripTags(m[2])).slice(0, 220),
        url,
        snippet: snips[i - 1] ?? "",
        engine: "duckduckgo",
      });
    }
    return hits;
  }, 9000);
}

async function ddgLite(query: string, max: number): Promise<SearchHit[]> {
  return withTimeout(async (signal) => {
    const res = await fetch(
      "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query),
      { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, signal }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const anchors = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
    const snips: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) && snips.length < max * 2) {
      snips.push(collapse(stripTags(m[1])));
    }
    const hits: SearchHit[] = [];
    let i = 0;
    while ((m = anchors.exec(html)) && hits.length < max) {
      const url = unwrapDdg(m[1]);
      i++;
      if (!url || isBlockedUrl(url)) continue;
      hits.push({
        title: collapse(stripTags(m[2])).slice(0, 220),
        url,
        snippet: snips[i - 1] ?? "",
        engine: "duckduckgo-lite",
      });
    }
    return hits;
  }, 9000);
}

async function mojeek(query: string, max: number): Promise<SearchHit[]> {
  return withTimeout(async (signal) => {
    const res = await fetch(
      "https://www.mojeek.com/search?q=" + encodeURIComponent(query),
      { headers: { "user-agent": BROWSER_UA, accept: "text/html" }, signal }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const html = await res.text();
    const anchors = /<h2[^>]*>\s*<a[^>]+href="(https?:\/\/([^"]+))"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<p class="s">([\s\S]*?)<\/p>/g;
    const snips: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = snippetRe.exec(html)) && snips.length < max * 2) {
      snips.push(collapse(stripTags(m[1])));
    }
    const hits: SearchHit[] = [];
    let i = 0;
    while ((m = anchors.exec(html)) && hits.length < max) {
      const url = m[1];
      i++;
      if (isBlockedUrl(url)) continue;
      hits.push({
        title: collapse(stripTags(m[3])).slice(0, 220),
        url,
        snippet: snips[i - 1] ?? "",
        engine: "mojeek",
      });
    }
    return hits;
  }, 9000);
}

/* ───────────────────────── orchestrator ───────────────────────── */

const cache = new Map<string, { t: number; hits: SearchHit[]; statuses: EngineStatus[] }>();
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Multi-engine web search with graceful fallback:
 * Tavily (optional key) → DuckDuckGo HTML → DuckDuckGo Lite → Mojeek.
 * Stops as soon as enough hits are collected. Results cached 10 min.
 */
export async function searchWeb(
  query: string,
  opts: { max?: number } = {}
): Promise<{ hits: SearchHit[]; statuses: EngineStatus[] }> {
  const max = Math.min(10, Math.max(1, opts.max ?? 6));
  const key = `${query}::${max}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL) {
    return { hits: cached.hits, statuses: cached.statuses };
  }

  const hits: SearchHit[] = [];
  const statuses: EngineStatus[] = [];
  const seen = new Set<string>();

  const chain: { name: string; fn: () => Promise<SearchHit[]> }[] = [];
  if (process.env.TAVILY_API_KEY)
    chain.push({ name: "tavily", fn: () => tavilySearch(query, max) });
  // API-first engines (work from serverless IPs) — try before the HTML scrapers
  // that get bot-gated on datacenter ranges.
  chain.push({ name: "github", fn: () => githubSearch(query, max) });
  chain.push({ name: "wikipedia", fn: () => wikipediaSearch(query, max) });
  chain.push({ name: "hackernews", fn: () => hnSearch(query, max) });
  chain.push({ name: "duckduckgo", fn: () => ddgHtml(query, max) });
  chain.push({ name: "duckduckgo-lite", fn: () => ddgLite(query, max) });
  chain.push({ name: "mojeek", fn: () => mojeek(query, max) });
  // Paid fallback LAST — only burns a you.com credit if free engines + catalog
  // haven't filled the result quota yet.
  chain.push({ name: "you.com", fn: () => youSearch(query, max) });

  for (const engine of chain) {
    if (hits.length >= max) break;
    const t0 = Date.now();
    try {
      const found = await engine.fn();
      for (const h of found) {
        if (!h.url || isBlockedUrl(h.url)) continue;
        const k = urlKey(h.url);
        if (seen.has(k)) continue;
        seen.add(k);
        hits.push(h);
        if (hits.length >= max + 4) break; // small overflow buffer
      }
      statuses.push({
        engine: engine.name,
        ok: found.length > 0,
        hits: found.length,
        ms: Date.now() - t0,
      });
    } catch (e: unknown) {
      const err = e as Error;
      statuses.push({
        engine: engine.name,
        ok: false,
        hits: 0,
        ms: Date.now() - t0,
        error: err.name === "AbortError" ? "timeout" : err.message || "failed",
      });
    }
  }

  const result = { hits: hits.slice(0, max + 4), statuses };
  cache.set(key, { t: Date.now(), ...result });
  if (cache.size > 200) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  return result;
}
