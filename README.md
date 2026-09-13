# Dr Scholar

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Open%20Source-blue.svg)](#license)

**Free AI agent that finds real, verified scholarships and internships matched to one student. No paywalls. No data harvesting. Runs on free API keys.**

---

## What This Solves

Searching for scholarships is broken. Students spend hours digging through outdated blog posts, scammy aggregator sites, and vague "top 10 lists" that recycle the same five names. The real opportunities are buried behind bad search results and pay-to-apply platforms.

Here is what students are up against:

- **Over $460 billion** in scholarship money goes unclaimed every year in the US alone. Much of it is never applied for because students simply do not know it exists.
- Most scholarship search engines charge **$30 to $80 per month** for access to databases that are often outdated or full of expired listings.
- The average student spends **10 to 15 hours** searching for scholarships before giving up or settling for whatever shows up first on Google.
- International students face an even harder time. Many platforms ignore non-US programs entirely or list them without verifying eligibility.

The few free tools out there are either manual (spreadsheets, bookmarks) or limited (one search engine, no verification). Students need something that actually does the research for them.

**Dr Scholar is different.** You fill out a profile. The AI agent searches multiple engines in parallel, reads official program pages, extracts real deadlines and funding amounts, checks your eligibility, and hands you a ranked report with a 30-day action plan. Every link goes to an official source. Nothing is made up. And it runs entirely on free API keys.

---

## What We Need

Dr Scholar is open source because finding funding should not be a business model built on selling student data.

Here is how you can help:

- **Try it.** Fill out a profile. Run a deep scan. Open an issue if something breaks or finds stale results.
- **Expand the catalog.** The curated catalog has 60-plus scholarships and 30-plus internships. Add programs you know about that are missing.
- **Spread the word.** The student who needs this is probably scrolling past it right now.

---

## Quick Start

```bash
# Clone
git clone https://github.com/Sumama-Jameel/dr-scholar.git
cd dr-scholar

# Install
npm install

# Set up your free API key (pick one)
cp .env.example .env.local
# Edit .env.local and paste your GROQ_API_KEY or GEMINI_API_KEY

# Run
npm run dev

# Open http://localhost:3000
# Fill your profile, then hit "Full deep scan"
```

Get a free Gemini key in 2 minutes: go to https://aistudio.google.com/apikey, click "Create API key", and paste it into `.env.local`.

---

## Features

- **6 research tools working together.** Deep research across multiple search engines, official page reading, live job API feeds, a curated catalog of 90-plus programs, and automated eligibility screening. The agent picks the right tools and runs them in parallel.

- **Multi-engine search chain.** Tavily, DuckDuckGo, Mojeek, and Wikipedia, tried in order. Free keys optional. Every engine has a fallback. If one goes down, the chain keeps going.

- **Real page verification.** The agent reads official program pages to extract deadlines, funding amounts, and eligibility rules. It does not trust third-party aggregators. If it cannot verify something, it marks it as unverified.

- **Curated catalog as safety net.** 60-plus scholarships and 30-plus internships from official sources across 20-plus countries. Updated by hand. Used as a fallback when live search fails and as enrichment when it succeeds.

- **Eligibility screening.** The agent checks GPA requirements, age limits, citizenship rules, academic level, and funding needs against your profile. Conservative by design. If it is not sure, it tells you to verify manually instead of guessing.

- **30-day action plan.** Every report includes a week-by-week breakdown of what to do next. Not vague advice. Specific steps tied to the deadlines found.

- **Hand-rolled LLM routing.** No AI SDK. No LangChain. A custom router that tries Qwen via Groq, then Gemini Flash, then Gemini Pro. Retries on rate limits. Streams responses in real time. Runs on free tiers.

- **Privacy-first by design.** No database. No user accounts. Your profile lives in your browser's localStorage. Reports are generated in memory and streamed to you. Nothing is stored on a server.

- **Document parsing.** Upload a PDF, markdown, or text file with your academic profile and the agent parses it into a structured format. No manual typing required.

---

## Environment Variables

The app needs at least one API key to work. Everything else is optional.

### Required (pick one or both)

| Variable | Where to get it | Free quota | What it does |
|---|---|---|---|
| `GROQ_API_KEY` | console.groq.com | 30,000 tokens per minute | Primary LLM backend (Qwen 3.8 27B) |
| `GEMINI_API_KEY` | aistudio.google.com | Generous free tier | Secondary/fallback LLM (Gemini 2.5 Flash) |

You can also use `GOOGLE_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` as aliases for the Gemini key.

### Optional (better results, never required)

| Variable | Where to get it | Free quota | What it adds |
|---|---|---|---|
| `TAVILY_API_KEY` | tavily.com | 1,000 searches per month | Cleaner, more relevant search results |
| `ADAZUNA_APP_ID` + `ADAZUNA_API_KEY` | developer.adzuna.com | Free tier | More internship listings |
| `USAJOBS_API_KEY` + `USAJOBS_USER_EMAIL` | data.usajobs.gov | Free | US federal government internships |

---

## Architecture

```
Student profile (form or uploaded document)
        |
        v
+---------------------------------------------------+
|            Next.js on Vercel                       |
|                                                    |
|  /chat  -->  streamText  -->  AGENT (LLM)          |
|                               |                    |
|                               v                    |
|              +---------- TOOLS ----------+         |
|              | deep_research (full sweep) |         |
|              | search_web (quick query)   |         |
|              | fetch_page (read one page) |         |
|              | jobs_api (live listings)   |         |
|              | seed_catalog (90+ programs)|         |
|              | eligibility_check (screen) |         |
|              +---------------------------+         |
+---------------------------------------------------+
        |
        v
Ranked report: table + details + 30-day plan + sources (downloadable .md)
```

**The pipeline:** Profile --> Query design --> Multi-engine search --> Rank results --> Deep-read pages --> Extract deadlines and funding --> Check eligibility --> Score and rank --> Write report.

---

## Competitor Comparison

Dr Scholar is the free, open source alternative to paid scholarship search platforms.

| App | Cost | AI Research | Source Verification | Open Source | Privacy |
|---|---|---|---|---|---|
| **Dr Scholar** | **Free** | **Yes, multi-engine** | **Yes, official pages** | **Yes** | **Full, no data stored** |
| ScholarshipOwl | $19.95/month | No, matching only | No | No | Shares data with partners |
| Fastweb | Free with ads | No, database search | No | No | Ad-supported, data collected |
| Scholarships.com | Free with ads | No, database search | No | No | Ad-supported, data collected |
| Chegg Scholarships | $19.95/month | No, matching only | No | No | Part of Chegg data ecosystem |
| Scholly | $8.99/month | No, database search | No | No | Closed source, data collected |
|手动 spreadsheets | Free | No | Manual | N/A | Full control, all manual work |

Paid platforms make money by collecting student data and selling ads. Dr Scholar runs on free API keys and stores nothing.

---

## Project Structure

```
skills/dr-scholar/SKILL.md     <-- the agent's operating manual (deep research flow)
lib/
  llm.ts                      <-- multi-backend LLM router (Gemini + Groq, zero deps)
  tools.ts                     <-- tool declarations and executors (6 tools)
  deep-research.ts             <-- heavy research pipeline (time-budgeted)
  search.ts                    <-- multi-engine search chain (keyless fallbacks)
  jobs.ts                      <-- Remotive/Arbeitnow/Adzuna/USAJobs integrations
  seeds.ts                     <-- curated catalog of 90-plus programs
  eligibility.ts               <-- GPA/age/level/citizenship screening
  prompt.ts                    <-- builds system prompt from skill + profile
  profile.ts                   <-- profile schema, storage, formatting
  fetcher.ts                   <-- safe URL fetcher with timeout and size cap
app/
  page.tsx                     <-- profile builder (form + document upload)
  chat/page.tsx                <-- agent chat interface (NDJSON streaming)
  skill/page.tsx               <-- renders the skill file for humans
  api/chat/route.ts            <-- main agent loop (tool calling + streaming)
  api/parse-profile/route.ts   <-- document to structured profile parser
  api/selftest/route.ts        <-- runtime system health check
  api/health/route.ts          <-- LLM backend availability check
components/
  DotGrid.tsx                  <-- interactive canvas background
  MiniMarkdown.tsx             <-- dependency-free markdown renderer
  ToolChip.tsx                 <-- real-time tool execution status chips
public/
  student-profile-template.md  <-- downloadable profile document template
```

---

## Tests

There is no formal test suite yet. The project uses a runtime self-test endpoint instead.

```bash
# Check system health (search engines, job APIs, catalog, eligibility)
curl http://localhost:3000/api/selftest

# Check which LLM backends are available
curl http://localhost:3000/api/health
```

The self-test probes every non-LLM layer: search engines, job APIs, page fetching, seed catalog matching, and eligibility screening. It returns a JSON health report.

---

## Building for Production

```bash
npm run build       # Next.js production build
npm run start       # Start production server
```

Deploys to Vercel with zero configuration. No database to set up. No other services needed.

### Vercel Hobby Limits

| Limit | How Dr Scholar handles it |
|---|---|
| 300 second function duration | Time budgets in deep research degrade gracefully |
| 1 GB memory | No in-memory accumulation, size-capped page fetches |
| No cron needed | Stateless request and response, streaming only |
| No database needed | Profile lives in browser localStorage |
| Gemini free tier rate limits | Max 12 model steps per reply, search does the heavy lifting |

---

## License

This project is licensed under the MIT License.

Copyright 2026 Dr Scholar Contributors.

Built as the free, open source alternative to scholarship search platforms that charge students for access to information that should be free.
