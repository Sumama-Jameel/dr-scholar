/** The agent's toolbox — Gemini-native declarations + plain async executors (no SDK). */

import { searchWeb } from "./search";
import { fetchText } from "./fetcher";
import { deepResearch } from "./deep-research";
import { jobsSearch } from "./jobs";
import { matchSeeds } from "./seeds";
import { eligibilityAssess, type EligibilityItem } from "./eligibility";
import { extractDeadlines, extractFunding } from "./html";
import type { FunctionDeclaration } from "./gemini";
import type { ProfileInput } from "./profile";

export type ToolArgs = Record<string, unknown>;
export type ToolExecutor = (args: ToolArgs) => Promise<unknown>;

/** Gemini function-calling declarations (OpenAPI subset, UPPERCASE types). */
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "deep_research",
    description:
      "HEAVY deep research pipeline. Runs ALL your planned queries through a multi-engine " +
      "search chain in one call, ranks results against the student profile, deep-reads the top " +
      "pages (extracts deadlines + funding), adds live job APIs (internships) and a curated " +
      "official-program catalog. Budget <=110s per call, <=2 calls per reply. Always design " +
      "specific queries first (see skill file Phase 1).",
    parameters: {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", enum: ["scholarship", "internship"], description: "What to research" },
        queries: {
          type: "ARRAY",
          items: { type: "STRING" },
          description:
            "4-8 specific search queries, e.g. 'fully funded masters scholarships Kenya students 2027 deadline'",
        },
        time_budget_seconds: { type: "INTEGER", description: "Hard time budget; default 80, max 110" },
        max_pages: { type: "INTEGER", description: "How many top results to deep-read; default 10" },
      },
      required: ["kind", "queries"],
    },
  },
  {
    name: "search_web",
    description:
      "Lightweight single web search (multi-engine with fallback). Use for one-off lookups; " +
      "use deep_research for the full sweep.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Search query" },
        max_results: { type: "INTEGER", description: "1-10 results, default 6" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description:
      "Reads ONE official page and extracts title, deadline, funding signals and an excerpt. " +
      "Use to verify deadline/eligibility of a top candidate (<=4 per reply).",
    parameters: {
      type: "OBJECT",
      properties: {
        url: { type: "STRING", description: "Exact URL from search results — never a guessed URL" },
      },
      required: ["url"],
    },
  },
  {
    name: "jobs_api",
    description:
      "Live internship/job listings from free job APIs (Remotive, Arbeitnow, + Adzuna/USAJobs " +
      "if keys are configured). Keyless sources work out of the box.",
    parameters: {
      type: "OBJECT",
      properties: {
        keywords: { type: "STRING", description: "e.g. 'software engineering intern'" },
        limit: { type: "INTEGER", description: "3-20 listings, default 12" },
      },
    },
  },
  {
    name: "seed_catalog",
    description:
      "Curated catalog of ~90 REAL programs (official URLs) matched to the student's country, " +
      "level and field. Use it when search engines fail, or as a guaranteed baseline shortlist.",
    parameters: {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", enum: ["scholarship", "internship"] },
        limit: { type: "INTEGER", description: "1-20 entries, default 15" },
      },
      required: ["kind"],
    },
  },
  {
    name: "eligibility_check",
    description:
      "Screens up to 12 opportunities against the student profile (level, GPA, age, citizenship) " +
      "and returns a fit verdict (likely/possible/stretch) with reasons. Run AFTER research, " +
      "BEFORE the final report.",
    parameters: {
      type: "OBJECT",
      properties: {
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              url: { type: "STRING" },
              kind: { type: "STRING", enum: ["scholarship", "internship"] },
              requirements: { type: "STRING", description: "Eligibility text you gathered for this program" },
            },
            required: ["name", "url", "kind", "requirements"],
          },
        },
      },
      required: ["items"],
    },
  },
];

export function createExecutors(profile: ProfileInput | null): Record<string, ToolExecutor> {
  return {
    deep_research: async (args) => {
      try {
        const kind = String(args.kind ?? "scholarship") as "scholarship" | "internship";
        const queries = Array.isArray(args.queries) ? (args.queries as string[]) : [];
        const budget = Number(args.time_budget_seconds) || 80;
        const maxPages = Number(args.max_pages) || 10;
        return await deepResearch({
          kind,
          queries,
          profile,
          timeBudgetMs: Math.min(110, Math.max(20, budget)) * 1000,
          maxPages: Math.min(12, Math.max(2, maxPages)),
        });
      } catch (e: unknown) {
        return { error: (e as Error).message || "deep research failed" };
      }
    },

    search_web: async (args) => {
      try {
        const query = String(args.query ?? "");
        if (!query.trim()) return { error: "query required" };
        const max = Math.min(10, Math.max(1, Number(args.max_results) || 6));
        const { hits, statuses } = await searchWeb(query, { max });
        return {
          query,
          hits: hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })),
          engines: statuses.map((s) => `${s.engine}:${s.ok ? s.hits : "err"}`),
        };
      } catch (e: unknown) {
        return { error: (e as Error).message || "search failed" };
      }
    },

    fetch_page: async (args) => {
      const url = String(args.url ?? "");
      const page = await fetchText(url, { timeoutMs: 9000, maxChars: 8000 });
      if (page.error) return { url, error: page.error };
      return {
        url: page.finalUrl,
        status: page.status,
        title: page.title,
        deadline: extractDeadlines(page.text)[0] ?? null,
        funding: extractFunding(page.text)[0] ?? null,
        excerpt: page.text.slice(0, 2000),
      };
    },

    jobs_api: async (args) => {
      const keywords = args.keywords ? String(args.keywords) : undefined;
      const limit = Math.min(20, Math.max(3, Number(args.limit) || 12));
      const { jobs, sources } = await jobsSearch({ keywords, limit });
      return { count: jobs.length, sources, jobs };
    },

    seed_catalog: async (args) => {
      const kind = String(args.kind ?? "scholarship") as "scholarship" | "internship";
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 15));
      const countries = [
        profile?.citizenship,
        profile?.residence,
        ...(profile?.targetCountries ?? []),
      ].filter(Boolean) as string[];
      const items = matchSeeds(kind, {
        countries,
        levels: profile?.level ? [profile.level] : [],
        fieldTokens: [profile?.field ?? "", ...(profile?.fieldKeywords ?? [])].filter(Boolean),
        needsFullFunding: profile?.needsFullFunding,
        limit,
      });
      return {
        count: items.length,
        items: items.map((s) => ({
          name: s.name,
          url: s.url,
          funding: s.funding,
          levels: s.levels,
          regions: s.regions,
          note: s.note ?? null,
        })),
      };
    },

    eligibility_check: async (args) => {
      const items = Array.isArray(args.items)
        ? (args.items as EligibilityItem[]).slice(0, 12)
        : [];
      return eligibilityAssess(profile, items);
    },
  };
}

