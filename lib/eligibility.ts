import type { ProfileInput } from "./profile";

export type EligibilityItem = {
  name: string;
  url: string;
  kind: string;
  requirements: string;
};

export type EligibilityVerdict = {
  name: string;
  url: string;
  verdict: "likely" | "possible" | "stretch";
  reasons: string[];
};

/** Converts a free-text GPA like "8.7/10 CGPA" or "3.6 GPA" into ~percentage. */
export function gpaToPercent(gpa?: string): number | null {
  if (!gpa) return null;
  const m = gpa.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (v <= 0) return null;
  if (/\/\s*10|cgpa|cpi|out of 10/i.test(gpa) && v <= 10) return v * 10;
  if (/\/\s*4|gpa|out of 4/i.test(gpa) && v <= 4) return (v / 4) * 100;
  if (gpa.includes("%")) return v;
  if (v >= 40 && v <= 100) return v; // looks like a percentage already
  return null;
}

/** Finds the strictest percentage-style minimum inside a requirements text. */
export function reqPercent(req: string): number | null {
  let best: number | null = null;
  const consider = (pct: number) => {
    if (pct >= 40 && pct <= 100 && (best === null || pct > best)) best = pct;
  };
  for (const m of req.matchAll(/(\d{2,3})\s?%/g)) consider(parseFloat(m[1]));
  for (const m of req.matchAll(/(\d(?:\.\d+)?)\s?\/\s?10/g)) consider(parseFloat(m[1]) * 10);
  for (const m of req.matchAll(/(\d(?:\.\d+)?)\s?\/\s?4(?:\.0)?/g)) consider((parseFloat(m[1]) / 4) * 100);
  for (const m of req.matchAll(/(?:gpa|grade point average)\s?(?:of|:)?\s?(\d(?:\.\d+)?)/g)) {
    const v = parseFloat(m[1]);
    if (v <= 4) consider((v / 4) * 100);
  }
  return best;
}

const LEVEL_WORDS: Record<string, string[]> = {
  high_school: ["high school", "secondary school", "senior school", "school student", "k-12"],
  undergraduate: [
    "undergraduate",
    "bachelor",
    "b.sc",
    "bsc",
    "b.tech",
    "btech",
    "b.e",
    "final year",
    "third year",
    "second year",
    "first year",
    "junior",
    "sophomore",
    "freshman",
  ],
  masters: ["master", "m.sc", "msc", "m.tech", "mtech", "mba", "postgraduate", "graduate student"],
  phd: ["phd", "doctoral", "doctorate", "dphil"],
  recent_graduate: ["recent graduate", "graduated within", "early career", "final year"],
  professional: ["professional", "early career", "mid career"],
  other: [],
};

/**
 * Heuristic eligibility screening: compares captured requirement text with the
 * student profile (level, GPA, age, citizenship). Deliberately conservative —
 * everything fuzzy becomes a "verify manually" note, never a rejection.
 */
export function eligibilityAssess(
  profile: ProfileInput | null,
  items: EligibilityItem[]
): { verdicts: EligibilityVerdict[] } {
  const p = profile ?? {};
  const levelWords = p.level ? LEVEL_WORDS[p.level] ?? [] : [];
  const studentPct = gpaToPercent(p.gpa);
  const citizen = (p.citizenship ?? "").toLowerCase();
  const targets = [...(p.targetCountries ?? []), p.residence]
    .filter(Boolean)
    .map((c) => String(c).toLowerCase());

  const verdicts = items.slice(0, 12).map((item) => {
    const req = (item.requirements ?? "").toLowerCase();
    const reasons: string[] = [];
    let s = 0;

    if (p.level && levelWords.length) {
      if (levelWords.some((w) => req.includes(w))) {
        s += 2;
        reasons.push(`✅ open to your level (${p.level.replace(/_/g, " ")})`);
      }
    }
    const ageLim = req.match(/(?:under|below|younger than|aged?\s*(?:under\s*)?)\s?(\d{2})\b/);
    if (ageLim && p.age) {
      const lim = parseInt(ageLim[1], 10);
      if (lim >= 12 && lim <= 60) {
        if (p.age < lim) {
          s += 2;
          reasons.push(`✅ age ${p.age} is within the ~${lim} limit`);
        } else {
          s -= 2;
          reasons.push(`⚠️ age limit ~${lim} mentioned, you are ${p.age} — verify exact cut-off`);
        }
      }
    }
    const reqPct = reqPercent(req);
    if (reqPct && studentPct) {
      if (studentPct >= reqPct) {
        s += 2;
        reasons.push(`✅ your ${p.gpa} clears the ~${Math.round(reqPct)}% minimum`);
      } else {
        s -= 2;
        reasons.push(
          `⚠️ minimum ≈${Math.round(reqPct)}% vs your ${p.gpa} — below on this scale, verify conversion`
        );
      }
    }
    if (citizen && req.includes("citizen")) {
      if (req.includes(citizen)) {
        s += 2;
        reasons.push(`✅ your citizenship (${p.citizenship}) appears in the eligibility text`);
      } else if (/all nationalit|any nationalit|regardless of nationalit|open to (?:all|international)/.test(req)) {
        s += 2;
        reasons.push("✅ program states it is open to all/international students");
      } else {
        s -= 1;
        reasons.push(`⚠️ citizenship-specific program — verify that ${p.citizenship} qualifies`);
      }
    }
    if (targets.length && req.includes("remote")) {
      reasons.push("ℹ️ mentions remote — relevant if you cannot relocate");
    }
    if (!req.trim()) {
      reasons.push("ℹ️ no requirement text captured — open the link and verify");
    }
    if (reasons.length === 0) {
      reasons.push("ℹ️ no automated conflicts found — verify details on the official page");
    }
    const verdict: EligibilityVerdict["verdict"] = s >= 2 ? "likely" : s >= 0 ? "possible" : "stretch";
    return { name: item.name, url: item.url, verdict, reasons };
  });

  return { verdicts };
}
