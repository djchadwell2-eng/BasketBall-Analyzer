# Basketball Film Analyzer — Work Tracker

---

## SYSTEM AUDIT REPORT

---

### 1. API CALL MAP

| # | Location | Line | What triggers it | Call type |
|---|----------|------|-----------------|-----------|
| 1 | `lib/analyzeFrames.ts` | 40 | `client.chat.completions.create()` called by `analyzeFrames()` | OpenAI Vision (GPT-4o) |

**Trigger chain:**
```
User clicks "Analyze Video"
  → POST /api/analyze  (app/api/analyze/route.ts)
    → extractFrames(videoPath)       ← NO AI
    → analyzeFrames(frames)          ← 1 OpenAI call here, unconditionally
      → client.chat.completions.create(gpt-4o, 5 image_url blocks)
```

**Total AI calls per upload: exactly 1, always.**
There are no other OpenAI calls anywhere in the codebase.

---

### 2. FRAME FLOW ANALYSIS

**How many frames per upload:**
- Always exactly 5. Hardcoded via `percentages = [0.1, 0.3, 0.5, 0.7, 0.9]` in `lib/extractFrames.ts:30`.
- No user input, no dynamic scaling, no video-length-based adjustment.

**How frames are selected:**
- Purely by time position: 10%, 30%, 50%, 70%, 90% of total video duration.
- No motion detection. No scene change detection. No heuristic filtering.
- A 60-second video produces frames at 6s, 18s, 30s, 42s, 54s — regardless of what is happening on court at those moments.

**Whether batching is used:**
- YES. All 5 frames are sent in a single `messages` array in one API call (`lib/analyzeFrames.ts:27–33`).
- There is no per-frame loop that calls the API. The `frames.map()` at line 27 builds an array of content blocks, not API calls.

**Image detail setting:**
- `detail: 'high'` on every frame (`lib/analyzeFrames.ts:31`).
- At 1920×1080, `detail: high` costs ~1,105 tokens per image. 5 frames = ~5,525 image tokens per upload, before text tokens.

---

### 3. COST SAFETY CHECK

| Question | Answer |
|----------|--------|
| Can a single upload exceed 3 API calls? | **NO** — always exactly 1 call |
| Can frames be sent one-by-one (per-frame API calls)? | **NO** — all 5 are batched into one call |
| Is there a hard cap on frames? | **SOFT** — 5 is hardcoded in `extractFrames.ts:30` but not enforced by validation anywhere in the route |

**Cost estimate per upload (current):**
- ~5,525 image input tokens (`detail: high`, 5 frames × ~1,105)
- ~50 text input tokens (user message)
- ~1,500 output tokens (max_tokens cap)
- **Total: ~7,075 tokens per upload at GPT-4o pricing (~$0.07 per analysis)**

---

### 4. ARCHITECTURE COMPLIANCE

**Expected architecture:**

| Layer | Expected | Present |
|-------|----------|---------|
| 1. Video Processing (NO AI) | ffmpeg frame/segment extraction | ✅ Present — `lib/extractFrames.ts` |
| 2. Filtering / Selection (NO AI) | Motion detection or heuristic selection of high-action segments | ❌ MISSING — no filtering layer exists |
| 3. AI Processing (CONTROLLED) | Batched frames, max 2–3 calls per upload, no per-frame calls | ✅ Present — 1 batched call, all 5 frames together |

**Verdict: PARTIALLY COMPLIANT**

Layer 1 and Layer 3 are correctly implemented. Layer 2 is entirely absent.

---

### 5. IDENTIFIED PROBLEMS (NOT FIXED)

#### P1 — MISSING FILTERING LAYER (Architecture)
The required "Filtering / Selection Layer" does not exist. Frames are passed directly from ffmpeg to OpenAI with no intermediate selection logic. Every upload sends all 5 frames to the AI, even if those frames show empty court, warmups, dead-ball situations, or timeouts. This is the most significant architectural gap.

#### P2 — SOFT FRAME CAP (Cost Risk)
The 5-frame limit is not enforced by a guard in the API route. The route does:
```ts
const frames = extractFrames(videoPath)      // returns ExtractedFrame[]
const analysis = await analyzeFrames(frames) // accepts any-length array
```
If `extractFrames` is modified to return 20 frames (e.g., for a longer video), the route will pass all 20 to OpenAI without complaint. Cost would multiply 4×.

#### P3 — DETAIL LEVEL NOT CONFIGURABLE (Cost Risk)
`detail: 'high'` is hardcoded in `lib/analyzeFrames.ts:31`. For a development/MVP tool, `detail: 'low'` (85 tokens per image, flat) would cost ~13× less with acceptable quality for tactical analysis. There is no way to downgrade without editing the source.

#### P4 — MISLEADING UI STATE MACHINE (UX / Correctness)
`app/page.tsx` sets state to `'extracting'` before the fetch, then immediately to `'analyzing'` after receiving the response (line 55). The server performs both extraction AND analysis in a single synchronous request. This means:
- The user never sees "Sending frames to OpenAI Vision..." for any meaningful duration
- The UI implies a two-phase server process that the client cannot observe in real time
- The status messages are decorative, not indicative of actual server state

#### P5 — NO RATE LIMITING (Cost Risk / Abuse)
The `POST /api/analyze` route has no rate limiting. Rapid repeated submissions burn API credits with no throttle. Not critical for local MVP use, but a real risk if ever exposed to the internet.

#### P6 — FRAME COUNT NOT VALIDATED IN ROUTE (Defensive Coding)
The API route does not assert `frames.length === 5` before passing to `analyzeFrames`. If extraction fails silently and returns fewer frames (e.g., very short video where a timestamp is past the end), the AI receives fewer images with no warning logged.

#### P7 — NO SEGMENT-BASED APPROACH (Architecture)
Per the intended architecture, the video should be "split into time-based segments." Currently the system extracts individual still frames, not video segments. For basketball analysis, short clips (2–3 second segments showing motion) would give the AI more context than single frozen frames. This is an architectural mismatch between the stated design and the implementation.

---

*Audit complete. Awaiting instructions before making any changes.*
