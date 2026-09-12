/** Internship listings from keyless / free job APIs. Core sources need no key. */

export type JobHit = {
  title: string;
  org: string;
  url: string;
  location?: string;
  date?: string;
  tags: string[];
  source: string;
};

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}

function isInternish(...parts: (string | string[] | undefined)[]): boolean {
  const hay = parts
    .flatMap((p) => (Array.isArray(p) ? p : [p ?? ""]))
    .join(" ")
    .toLowerCase();
  return /\bintern|trainee|traineeship|student (?:job|position|program)|working student\b/.test(hay);
}

function clean(html: string | undefined): string {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remotive — free remote-jobs API, no key. */
export async function remotiveJobs(keywords = "intern", limit = 15): Promise<JobHit[]> {
  try {
    return await withTimeout(async (signal) => {
      const url = `https://remotive.com/api/remote-jobs?limit=${Math.min(
        60,
        limit * 4
      )}&search=${encodeURIComponent(keywords)}`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "DrScholar/1.0" },
        signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { jobs?: Record<string, unknown>[] };
      return (data.jobs ?? [])
        .filter((j) =>
          isInternish(
            String(j.title ?? ""),
            String(j.category ?? ""),
            j.tags as string[] | undefined
          )
        )
        .slice(0, limit)
        .map((j) => ({
          title: clean(String(j.title ?? "")),
          org: clean(String(j.company_name ?? "")),
          url: String(j.url ?? ""),
          location: clean(String(j.candidate_required_location ?? "")) || "Remote",
          date: String(j.publication_date ?? "").slice(0, 10) || undefined,
          tags: (j.tags as string[] | undefined) ?? [],
          source: "remotive",
        }))
        .filter((j) => j.url);
    }, 10000);
  } catch {
    return [];
  }
}

/** Arbeitnow — free job board API (EU focus), no key. */
export async function arbeitnowJobs(limit = 15): Promise<JobHit[]> {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
        headers: { accept: "application/json", "user-agent": "DrScholar/1.0" },
        signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { data?: Record<string, unknown>[] };
      return (data.data ?? [])
        .filter((j) =>
          isInternish(
            String(j.title ?? ""),
            j.tags as string[] | undefined,
            j.job_types as string[] | undefined
          )
        )
        .slice(0, limit)
        .map((j) => ({
          title: clean(String(j.title ?? "")),
          org: clean(String(j.company_name ?? "")),
          url: String(j.url ?? ""),
          location: clean(String(j.location ?? "")) || undefined,
          date: String(j.date ?? "").slice(0, 10) || undefined,
          tags: (j.tags as string[] | undefined) ?? [],
          source: "arbeitnow",
        }))
        .filter((j) => j.url);
    }, 10000);
  } catch {
    return [];
  }
}

/** Adzuna — optional free key (https://developer.adzuna.com). */
export async function adzunaJobs(
  keywords = "internship",
  country = "us",
  limit = 15
): Promise<JobHit[]> {
  const appId = process.env.ADAZUNA_APP_ID;
  const apiKey = process.env.ADAZUNA_API_KEY;
  if (!appId || !apiKey) return [];
  try {
    return await withTimeout(async (signal) => {
      const cc = (country || "us").toLowerCase().slice(0, 2);
      const url =
        `https://api.adzuna.com/v1/api/jobs/${cc}/search/1` +
        `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(apiKey)}` +
        `&results_per_page=${limit}&what=${encodeURIComponent(keywords)}&content-type=application/json`;
      const res = await fetch(url, { headers: { accept: "application/json" }, signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as { results?: Record<string, unknown>[] };
      return (data.results ?? [])
        .filter((j) => isInternish(String(j.title ?? "")))
        .slice(0, limit)
        .map((j) => {
          const company = j.company as { display_name?: string } | undefined;
          const location = j.location as { display_name?: string } | undefined;
          return {
            title: clean(String(j.title ?? "")),
            org: clean(String(company?.display_name ?? "")),
            url: String(j.redirect_url ?? ""),
            location: clean(String(location?.display_name ?? "")) || undefined,
            date: String(j.created ?? "").slice(0, 10) || undefined,
            tags: [],
            source: "adzuna",
          };
        })
        .filter((j) => j.url);
    }, 10000);
  } catch {
    return [];
  }
}

/** USAJobs — optional free key (https://data.usajobs.gov). US federal internships. */
export async function usajobs(keywords = "intern", limit = 15): Promise<JobHit[]> {
  const key = process.env.USAJOBS_API_KEY;
  const email = process.env.USAJOBS_USER_EMAIL;
  if (!key || !email) return [];
  try {
    return await withTimeout(async (signal) => {
      const url = `https://data.usajobs.gov/api/search?keyword=${encodeURIComponent(
        keywords
      )}&resultsperpage=${limit}`;
      const res = await fetch(url, {
        headers: {
          "Authorization-Key": key,
          "User-Agent": email,
          accept: "application/json",
        },
        signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = (await res.json()) as {
        SearchResult?: { SearchResultItems?: Record<string, unknown>[] };
      };
      return (data.SearchResult?.SearchResultItems ?? [])
        .slice(0, limit)
        .map((item) => {
          const d = (item.MatchedObjectDescriptor ?? {}) as Record<string, unknown>;
          const locs = d.PositionLocation as
            | Array<{ LocationDisplay?: string }>
            | undefined;
          return {
            title: clean(String(d.PositionTitle ?? "")),
            org: clean(String(d.OrganizationName ?? "")),
            url: String(d.PositionURI ?? ""),
            location: locs?.map((l) => l.LocationDisplay).join(", ") || "United States",
            date: String(d.PositionStartDate ?? "").slice(0, 10) || undefined,
            tags: [],
            source: "usajobs",
          };
        })
        .filter((j) => j.url);
    }, 10000);
  } catch {
    return [];
  }
}

/** Aggregate every configured source, dedupe, return live internship listings. */
export async function jobsSearch(
  opts: { keywords?: string; country?: string; limit?: number } = {}
): Promise<{ jobs: JobHit[]; sources: string[] }> {
  const keywords = opts.keywords?.trim() || "intern";
  const limit = Math.min(20, Math.max(3, opts.limit ?? 12));
  const settled = await Promise.allSettled([
    remotiveJobs(keywords.includes("intern") ? keywords : `${keywords} intern`, limit),
    arbeitnowJobs(limit),
    adzunaJobs(keywords, opts.country ?? "us", limit),
    usajobs(keywords, limit),
  ]);
  const jobs: JobHit[] = [];
  const sources: string[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (s.status !== "fulfilled" || !s.value.length) continue;
    for (const j of s.value) {
      const k = (j.title + "|" + j.org).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      jobs.push(j);
    }
    if (!sources.includes(s.value[0].source)) sources.push(s.value[0].source);
  }
  return { jobs: jobs.slice(0, limit * 2), sources };
}
