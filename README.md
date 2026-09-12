# 🩺 Dr Scholar — AI Scholarship & Internship Scout

An AI agent that **deep-researches real scholarships and internships matched to one
student's profile**, verifies deadlines on official pages, screens eligibility, and hands
over a ranked apply-plan. Built 100% on **free tiers** — deployable on **Vercel Hobby**.

```
Student profile (form or filled .md document)
        │
        ▼
┌────────────────────────────── Next.js on Vercel ─────────────────────────────┐
│  /chat  ── streamText ──►  AGENT (Gemini free tier)                          │
│                             │  system prompt = skills/dr-scholar/SKILL.md    │
│                             ▼                                                │
│              ┌───────────── TOOLS ─────────────┐                             │
│              │ 🔬 deep_research  (heavy sweep) │                             │
│              │ 🔎 search_web     (Tavily? →    │                             │
│              │                   DuckDuckGo →  │                             │
│              │                   Mojeek)       │                             │
│              │ 📄 fetch_page     (verify)      │                             │
│              │ 💼 jobs_api       (Remotive,    │                             │
│              │                   Arbeitnow…)   │                             │
│              │ 🗂️ seed_catalog   (~90 official │                             │
│              │                   programs)     │                             │
│              │ ✅ eligibility_check             │                             │
│              └─────────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Ranked report: table + details + 30-day action plan + sources  (downloadable .md)
```

## Why judges will like it

- **A real skill file** — `skills/dr-scholar/SKILL.md` is the agent's operating manual
  (query templates, tool budgets, verification phases, output format). The agent *follows*
  it; you can watch it happening live in the UI (tool chips stream as they run).
- **A real deep-research tool** — `deep_research` runs 4–8 planned queries through a
  multi-engine chain, ranks against the profile, deep-reads top pages in parallel,
  extracts deadlines/funding amounts, and merges live job APIs + a curated catalog.
- **A real student document** — downloadable fillable template → upload/paste → AI parses
  it into a structured profile.
- **Free forever** — one free Gemini key; every other source is keyless or optional-free.
- **Honest AI** — hard anti-hallucination rules: only tool-sourced URLs, unverified labels,
  deadline discipline, no pay-to-apply recommendations.

## The stack (all free)

| Piece | Choice | Cost |
|---|---|---|
| LLM | **Qwen 3.8 27B** via Groq (free tier) as primary, **Gemini 3.1 Pro** as secondary, **Gemini 2.5 Flash** fallback | free keys |
| Agent runtime | Multi-backend LLM router (`lib/llm.ts`): tries Qwen → Gemini 3.1 Pro → 2.5 Flash on SSE. Hand-rolled streaming + function-calling loop. No AI SDK, no extra deps. | zero deps |
| Search | Tavily (optional free tier) → DuckDuckGo HTML/Lite → Mojeek | 0 keys needed |
| Internship listings | Remotive + Arbeitnow APIs (+ Adzuna/USAJobs optional free keys) | 0 keys needed |
| Catalog | 60+ curated official scholarships & internships (in-repo) | none |
| Hosting | Vercel Hobby (Fluid compute, 300s functions) | free |
| DB | none — profile & reports live in your browser | none |

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # paste your free key into GEMINI_API_KEY= (GOOGLE_API_KEY also works)
npm run dev                  # http://localhost:3000
```

Get the free Gemini key in 2 minutes: **https://aistudio.google.com/apikey** →
"Create API key" → paste into `.env.local` (or if you already exported `GOOGLE_API_KEY`
in your shell, nothing to do) → restart `npm run dev`.

## Deploy to Vercel (free) with the CLI

You already have `vercel` set up, so:

```bash
vercel link                     # once
vercel env add GEMINI_API_KEY   # paste the key (name can be GOOGLE_API_KEY too), choose Production + Preview
vercel --prod                   # ship it 🚀
```

(Or `vercel` for a preview URL first.) No database, no other services needed.

## Optional free keys (better results, never required)

| Key | Get it at | Free quota | Adds |
|---|---|---|---|
| `TAVILY_API_KEY` | tavily.com | 1,000 searches/mo | cleaner search results |
| `ADAZUNA_APP_ID` + `ADAZUNA_API_KEY` | developer.adzuna.com | free tier | more internship listings |
| `USAJOBS_API_KEY` + `USAJOBS_USER_EMAIL` | data.usajobs.gov | free | US federal internships |

## Vercel Hobby limits — and how this project respects them

| Limit | Reality | How we handle it |
|---|---|---|
| Function duration | 300s max (Fluid compute, default on) | `maxDuration = 300` in routes; every pipeline has hard time budgets and degrades gracefully |
| Memory 1 GB | — | no in-memory accumulation; size-capped fetches (≤ 300 KB/page) |
| No cron/websockets needed | — | stateless request/response + streaming only |
| No DB on free | — | localStorage profile + client-side report export |
| Gemini free tier RPM/day caps | ~10–15 RPM | ≤ 12 model steps per reply; search does the heavy lifting, LLM does orchestration/synthesis |

> If your project somehow has Fluid compute disabled, lower `maxDuration` to `60` in
> `app/api/chat/route.ts` — the time budgets in `lib/deep-research.ts` will adapt.

## Repo map

```
skills/dr-scholar/SKILL.md     ← THE agent skill file (deep-research flow)
lib/tools.ts                   ← Gemini function declarations + executors (6 tools)
lib/gemini.ts                  ← zero-dep direct Gemini REST client (SSE, tools, JSON)
lib/deep-research.ts           ← the heavy research pipeline (time-budgeted)
lib/search.ts                  ← multi-engine search chain (keyless fallbacks)
lib/jobs.ts                    ← Remotive/Arbeitnow (+optional Adzuna/USAJobs)
lib/seeds.ts                   ← curated official programs + matcher
lib/eligibility.ts             ← GPA/age/level/citizenship screening
lib/env.ts                     ← key-name resolution (GEMINI_API_KEY/GOOGLE_API_KEY/…)
lib/prompt.ts                  ← skill + runtime context + profile → system prompt
lib/profile.ts · html.ts · fetcher.ts · skill.ts
app/page.tsx                   ← profile builder (form + document parser)
app/chat/page.tsx              ← agent console (custom NDJSON stream client, no SDK)
app/skill/page.tsx             ← renders the skill file for humans/judges
app/api/chat/route.ts          ← hand-rolled agent loop (tool loop + streaming)
app/api/parse-profile/route.ts ← document → structured profile (responseSchema)
public/student-profile-template.md ← the student document to fill
```

## Demo script (3 minutes)

1. **Profile:** fill the quick form (or upload the filled template) → "Save profile".
2. **Agent:** hit "🔬 Do a full deep scan" → watch the tool chips fire:
   `deep_research` (queries → pages read → seconds), `eligibility_check`…
3. **Result:** ranked table with deadlines, money, fit verdicts + 30-day plan.
4. **Verify:** open a source link — it's the official page, not a blog.
5. **Export:** "Download report (.md)" → done.

## System check (no key needed)

`GET /api/selftest` pings every non-LLM layer — search engines, job APIs, page fetching,
seed matcher, eligibility engine and a mini deep-research run — and returns a JSON health
report. Open `/api/selftest` after deploying to verify Vercel's outbound network behaves.


## Honest limitations

- Keyless search engines (DuckDuckGo/Mojeek) can rate-limit datacenter IPs; the chain
  retries across engines and falls back to the curated catalog — but a free Tavily key
  noticeably improves freshness.
- Deadline extraction is regex-based; everything unverified is labeled.
- The catalog is a safety net, not a database — always ~90 hand-checked official links.
