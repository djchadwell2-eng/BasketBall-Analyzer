# Basketball Film Analyzer

Upload basketball game footage and get AI-powered tactical scouting intelligence: possession-by-possession breakdowns, team tendencies, game patterns, and a coaching-ready scouting report.

**Powered by a 3-pass Gemini video cascade:**

```
Upload video
  │
  ├─ 1. Motion scan (ffmpeg, free — no API)
  │     32×18 grayscale diff per second → finds peak-action moments
  │
  ├─ 2. Wide pass (Gemini, cheap)
  │     Video chunked into 5-min segments, 1fps, LOW media resolution
  │     → detects every possession + its type and time range
  │
  ├─ 3. Deep pass (Gemini, targeted)
  │     Per possession: JPEG burst (4fps, ≤15 frames) around peak motion
  │     → action types, outcome, defense read, coaching notes
  │     Low-confidence possessions are dropped, not guessed at
  │
  └─ 4. Synthesis (Gemini, text-only)
        All kept possessions → tendencies, weaknesses, key moments,
        scouting narrative
```

Results stream to the browser live (SSE progress) and are saved to Supabase for the History page.

---

## Prerequisites

### 1. Node.js
Download from https://nodejs.org (LTS recommended).

### 2. ffmpeg + ffprobe
Must be installed and on your system PATH.

**Windows (winget):**
```powershell
winget install Gyan.FFmpeg
```
Then restart your terminal and verify:
```powershell
ffmpeg -version
ffprobe -version
```

**Mac (Homebrew):**
```bash
brew install ffmpeg
```

### 3. Gemini API key
Get one at https://aistudio.google.com/app/apikey

### 4. Supabase project
Create a free project at https://supabase.com with:
- Tables: `videos`, `sequences`, `possessions`, `analyses`, `game_patterns`, `player_reports`, `folders`
- A public storage bucket named `videos`

---

## Setup

```powershell
# 1. Install dependencies
npm install

# 2. Create your environment file
copy .env.local.example .env.local

# 3. Fill in .env.local (Gemini key + Supabase URL/keys)

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000

---

## Usage

1. Upload a video (MP4, MOV, AVI, or WebM)
2. Watch live progress as the cascade runs (motion scan → wide pass → deep pass → synthesis)
3. Review the analysis tabs: Film Room, Stat Sheet, Game Patterns, Possession Analytics, Timeline
4. Name the game — it's saved to **History** with full playback (if storage upload succeeded)

---

## Project Structure

```
app/
  page.tsx                       Homepage — upload, SSE progress, results
  history/                       Saved analyses (list + detail)
  api/analyze/route.ts           POST: streaming upload → cascade → Supabase
  api/videos/[id]/route.ts       PATCH (move to folder) / DELETE
  api/folders/route.ts           Folder CRUD
lib/
  analyzers/
    gemini-video-analyzer.ts     The 3-pass cascade (motion scan, wide, deep, synthesis)
    chunker.ts                   ffmpeg 5-min chunking for the wide pass
  types.ts                       Shared analysis types
  computeStats.ts                Derived team stats from possessions
  computePlayerStats.ts          Derived player tendencies
  computeTrends.ts               Game-phase trend analysis
  supabase.ts / supabaseAdmin.ts Supabase clients (anon / service-role)
components/                      Analysis UI (tabs, film room, stat sheet, ...)
test/
  fixtures/sample.mp4            Fixture for the integration test
```

---

## Testing

```powershell
# Unit tests (chunker — no ffmpeg or API needed)
npx vitest --run lib/analyzers/__tests__/chunker.test.ts

# Integration test (hits the real Gemini API — costs money)
npm run test:analyzer:int
```

---

## Auth & access (invite-only)

The app is gated behind Supabase Auth (email + password):

- `/` is a public landing page with a request-access form; `/analyze` and `/history` require login.
- Accounts are created manually: Supabase dashboard → Authentication → Users → Add user. Also turn **off** "Allow new users to sign up" in Authentication → Sign In / Up.
- Run `supabase/migrations/2026-06-12_auth_rls_quota.sql` in the SQL Editor (replace `YOUR_EMAIL_HERE` first) — it adds ownership columns, Row Level Security on every table, and the access-requests table.
- Quota: each account gets `MONTHLY_ANALYSIS_LIMIT` analyses per calendar month (default 5). Emails listed in `ADMIN_EMAILS` (comma-separated) are unlimited — put your own email there.

## Notes

- Cost control is built in: the wide pass uses LOW media resolution, deep-pass clips are capped at 45 seconds, and concurrency is limited (4 wide / 4 deep) with exponential-backoff retries.
- Possessions the model isn't confident about (< 0.6) are dropped rather than hallucinated.
- Temp files (upload, chunks, possession clips) are cleaned up after each run.
