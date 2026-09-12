import { searchWeb } from "@/lib/search";
import { jobsSearch } from "@/lib/jobs";
import { matchSeeds, seedCounts } from "@/lib/seeds";
import { deepResearch } from "@/lib/deep-research";
import { eligibilityAssess } from "@/lib/eligibility";
import { fetchText } from "@/lib/fetcher";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Keyless system check: verifies every non-LLM layer works in this environment.
 * Open /api/selftest after deploying to Vercel to see what's reachable.
 */
export async function GET() {
  const started = Date.now();

  const search = await searchWeb("fully funded undergraduate scholarships 2026 deadline", {
    max: 4,
  });

  const jobs = await jobsSearch({ keywords: "software engineering intern", limit: 6 });

  const page = await fetchText("https://summerofcode.withgoogle.com/", {
    timeoutMs: 8000,
    maxChars: 1500,
  });

  const seeds = matchSeeds("scholarship", {
    countries: ["Kenya"],
    levels: ["undergraduate"],
    fieldTokens: ["computer science"],
    needsFullFunding: true,
    limit: 5,
  });

  const eligibility = eligibilityAssess(
    { citizenship: "Kenya", level: "undergraduate", gpa: "3.6 GPA", age: 21 },
    [
      {
        name: "Test Program",
        url: "https://example.edu/test",
        kind: "scholarship",
        requirements:
          "Open to undergraduate students. Minimum 3.0 GPA. Must be under 25 years of age. Open to all nationalities.",
      },
    ]
  );

  const mini = await deepResearch({
    kind: "scholarship",
    queries: ["Chevening scholarship 2027 deadline eligibility"],
    profile: null,
    timeBudgetMs: 25000,
    maxPages: 3,
  });

  return Response.json({
    ok: true,
    elapsedMs: Date.now() - started,
    search: {
      engines: search.statuses.map((s) => `${s.engine}:${s.ok ? `${s.hits} hits` : s.error}`),
      sample: search.hits.slice(0, 3).map((h) => ({ title: h.title.slice(0, 60), url: h.url.slice(0, 90) })),
    },
    jobs: { count: jobs.jobs.length, sources: jobs.sources },
    fetchPage: page.error ? { error: page.error } : { title: page.title.slice(0, 80), status: page.status },
    seeds: { catalogSize: seedCounts(), topForKenyaCS: seeds.map((s) => s.name.slice(0, 60)) },
    eligibility: eligibility.verdicts[0],
    miniDeepResearch: {
      findings: mini.findings.length,
      pagesRead: mini.stats.pagesFetched,
      elapsedMs: mini.stats.elapsedMs,
      engines: mini.engineStatuses.map((s) => `${s.engine}:${s.ok ? s.hits : "err"}`).slice(0, 6),
      top: mini.findings.slice(0, 3).map((f) => `${f.title.slice(0, 60)} → ${f.url.slice(0, 60)}`),
    },
  });
}
