/**
 * THE DEEP RESEARCH PIPELINE — Dr Scholar's heavy research tool.
 *
 * Deterministic, time-budgeted, parallel:
 *   1. runs every query the agent planned through the multi-engine search chain
 *   2. ranks hits (kind keywords + profile tokens + trusted domains)
 *   3. deep-reads the top pages in parallel batches (deadline/funding extraction)
 *   4. enriches with live job APIs (internships)
 *   5. tops up with the curated seed catalog so there is ALWAYS a useful answer
 *
 * Every stage checks the time budget so a reply never exceeds Vercel limits.
 */

import { fetchText } from "./fetcher";
import { extractDeadlines, extractFunding, extractRelevantSnippet } from "./html";
import {
  hostOf,
  isBlockedUrl,
  searchWeb,
  urlKey,
  type EngineStatus,
} from "./search";
import { jobsSearch } from "./jobs";
import { matchSeeds } from "./seeds";
import type { ProfileInput } from "./profile";

export type Finding = {
  title: string;
  url: string;
  source: "web" | "catalog" | "jobs-api";
  engine?: string;
  snippet: string;
  deadline?: string;
  funding?: string;
  score: number;
};

export type DeepResearchOutput = {
  kind: "scholarship" | "internship";
  queries: string[];
  findings: Finding[];
  engineStatuses: EngineStatus[];
  stats: {
    searchHits: number;
    pagesFetched: number;
    pageErrors: number;
    elapsedMs: number;
    budgetMs: number;
    note?: string;
  };
};

const KIND_WORDS: Record<"scholarship" | "internship", string[]> = {
  scholarship: [
    "scholarship",
    "fellowship",
    "grant",
    "bursary",
    "stipend",
    "fully funded",
    "financial aid",
    "tuition waiver",
    "fee waiver",
    "award",
  ],
  internship: [
    "internship",
    "intern",
    "trainee",
    "traineeship",
    "student program",
    "summer program",
    "summer research",
    "placement",
    "working student",
    "fellowship",
  ],
};

const TRUST_HOSTS = [
  ".edu",
  ".gov",
  ".ac.uk",
  ".ac.",
  "daad.de",
  "chevening.org",
  "ec.europa.eu",
  "erasmus-plus",
  "fulbright",
  "cscuk",
  "rhodeshouse",
  "gatescambridge",
  "knight-hennessy",
  "campusfrance",
  "studyinjapan",
  "studyinkorea",
  "campuschina",
  "australiaawards",
  "worldbank.org",
  "imf.org",
  "adb.org",
  "un.org",
  "unicef.org",
  "nasa.gov",
  "careers.cern",
  "esa.int",
  "ethz.ch",
  "epfl.ch",
  "hea.ie",
  "a-star.edu.sg",
  "oist.edu",
  "amgenscholars.com",
  "summerofcode.withgoogle",
  "fellowship.mlh.io",
  "outreachy.org",
  "scholarships.gov.in",
  "turkiyeburslari",
  "isdb.org",
  "mastercardfdn.org",
  "britishcouncil.org",
  "iusstf.org",
];

function isTrustHost(host: string): boolean {
  if (!host) return false;
  return TRUST_HOSTS.some((t) => host === t || host.endsWith(t) || host.includes(t));
}

const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "students",
  "student",
  "university",
  "college",
  "school",
  "international",
]);

function profileTokens(p: ProfileInput | null): string[] {
  if (!p) return [];
  const toks: string[] = [];
  const push = (v?: string | string[]) => {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    for (const s of arr) {
      for (const t of s.toLowerCase().split(/[^a-z0-9+#.]+/)) {
        if (t.length > 2 && !STOP_TOKENS.has(t)) toks.push(t);
      }
    }
  };
  push(p.citizenship);
  push(p.field);
  push(p.fieldKeywords);
  push(p.interests);
  push(p.targetCountries);
  if (p.level) push(p.level.replace(/_/g, " "));
  return [...new Set(toks)].slice(0, 25);
}

function scoreHit(
  title: string,
  snippet: string,
  url: string,
  kind: "scholarship" | "internship",
  tokens: string[]
): number {
  const hay = (title + " " + snippet).toLowerCase();
  let s = 0;
  for (const w of KIND_WORDS[kind]) if (hay.includes(w)) s += 2;
  if (/(deadline|apply now|applications open|eligib|requirements)/.test(hay)) s += 1;
  if (/20[2-3]\d/.test(hay)) s += 1;
  for (const t of tokens) if (hay.includes(t)) s += 1.5;
  if (isTrustHost(hostOf(url))) s += 2.5;
  if (isBlockedUrl(url)) s -= 4;
  return Math.round(s * 10) / 10;
}

export async function deepResearch(args: {
  kind: "scholarship" | "internship";
  queries: string[];
  profile: ProfileInput | null;
  timeBudgetMs?: number;
  maxPages?: number;
}): Promise<DeepResearchOutput> {
  const t0 = Date.now();
  const budget = Math.min(120000, Math.max(25000, args.timeBudgetMs ?? 80000));
  const stopAt = t0 + budget;
  const kind = args.kind;
  const profile = args.profile ?? null;
  const queries = (args.queries ?? []).filter((q) => q.trim()).slice(0, 8);
  const tokens = profileTokens(profile);

  const stats = {
    searchHits: 0,
    pagesFetched: 0,
    pageErrors: 0,
    elapsedMs: 0,
    budgetMs: budget,
    note: undefined as string | undefined,
  };
  const engineStatuses: EngineStatus[] = [];
  const findings: Finding[] = [];
  const seenUrls = new Set<string>();
  const hostCount = new Map<string, number>();
  const MAX_PER_HOST = 3;

  const addFinding = (f: Finding) => {
    if (!f.url || isBlockedUrl(f.url)) return;
    const k = urlKey(f.url);
    if (seenUrls.has(k)) return;
    const h = hostOf(f.url);
    if ((hostCount.get(h) || 0) >= MAX_PER_HOST) return;
    seenUrls.add(k);
    hostCount.set(h, (hostCount.get(h) || 0) + 1);
    findings.push(f);
  };

  /* 1) run every planned query through the engine chain */
  for (const q of queries) {
    if (Date.now() > stopAt - 15000) {
      stats.note = "time budget: stopped searches early";
      break;
    }
    try {
      const { hits, statuses } = await searchWeb(q, { max: 8 });
      engineStatuses.push(...statuses);
      stats.searchHits += hits.length;
      for (const hit of hits) {
        addFinding({
          title: hit.title || "(untitled result)",
          url: hit.url,
          source: "web",
          engine: hit.engine,
          snippet: hit.snippet,
          score: scoreHit(hit.title, hit.snippet, hit.url, kind, tokens),
        });
      }
    } catch {
      /* engine errors are recorded inside searchWeb */
    }
  }

  /* 1b) surface total search failure loudly (feeds the report + UI chips) */
  if (!findings.some((f) => f.source === "web")) {
    stats.note = (stats.note ? stats.note + "; " : "") +
      "live web search unavailable (all engines empty or bot-gated) — curated catalog + jobs matches only";
  }

  /* 2) deep-read top candidates in parallel batches within budget */
  const maxPages = Math.min(12, Math.max(2, args.maxPages ?? 10));
  const toRead = findings
    .filter((f) => f.source === "web")
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);
  const BATCH = 4;
  for (let i = 0; i < toRead.length; i += BATCH) {
    if (Date.now() > stopAt - 8000) {
      stats.note =
        (stats.note ? stats.note + "; " : "") +
        `time budget: read ${stats.pagesFetched} pages, cut reading short`;
      break;
    }
    const batch = toRead.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((f) => fetchText(f.url, { timeoutMs: 9000, maxChars: 7000 }))
    );
    results.forEach((r, j) => {
      const f = batch[j];
      if (r.status !== "fulfilled" || r.value.error || r.value.status >= 400 || !r.value.text) {
        stats.pageErrors++;
        return;
      }
      const page = r.value;
      stats.pagesFetched++;
      f.title = page.title || f.title;
      f.url = page.finalUrl || f.url;
      f.snippet = extractRelevantSnippet(page.text) || f.snippet;
      f.deadline = extractDeadlines(page.text)[0];
      f.funding = extractFunding(page.text)[0];
      f.score = scoreHit(f.title, f.snippet, f.url, kind, tokens) + 1; // verified page bonus
    });
  }

  /* 3) live internship APIs */
  if (kind === "internship" && Date.now() < stopAt - 10000) {
    const focus =
      [profile?.field, ...(profile?.fieldKeywords ?? []).slice(0, 3)]
        .filter(Boolean)
        .join(" ") || "intern";
    const { jobs } = await jobsSearch({
      keywords: focus,
      country: profile?.citizenship || profile?.residence || "us",
      limit: 10,
    });
    for (const j of jobs.slice(0, 14)) {
      const snippet = [j.org, j.location, j.tags.slice(0, 5).join(", ")]
        .filter(Boolean)
        .join(" · ");
      addFinding({
        title: j.title,
        url: j.url,
        source: "jobs-api",
        snippet: snippet || "live listing",
        score: Math.max(3, scoreHit(j.title, snippet, j.url, kind, tokens)),
      });
    }
  }

  /* 4) curated catalog top-up — guarantees a useful answer even if engines fail */
  const webCount = findings.filter((f) => f.source === "web").length;
  const seedLimit = webCount < 8 ? 15 : 8;
  const countries = [
    profile?.citizenship,
    profile?.residence,
    ...(profile?.targetCountries ?? []),
  ].filter(Boolean) as string[];
  const fieldTokens = [profile?.field ?? "", ...(profile?.fieldKeywords ?? [])].filter(Boolean);
  const seeds = matchSeeds(kind, {
    countries,
    levels: profile?.level ? [profile.level] : [],
    fieldTokens,
    needsFullFunding: profile?.needsFullFunding,
    limit: seedLimit,
  });
  for (const s of seeds) {
    addFinding({
      title: s.name,
      url: s.url,
      source: "catalog",
      snippet:
        [s.note, `funding: ${s.funding}`, `levels: ${s.levels.join(", ")}`, `regions: ${s.regions.join(", ")}`]
          .filter(Boolean)
          .join(" · "),
      score: 2,
    });
  }

  findings.sort((a, b) => b.score - a.score);
  stats.elapsedMs = Date.now() - t0;
  return {
    kind,
    queries,
    findings: findings.slice(0, 32),
    engineStatuses,
    stats,
  };
}
