# Basketball Film Analyzer — Work Tracker

> Updated 2026-06-10. The old SYSTEM AUDIT REPORT described the retired GPT-4o
> 5-frame pipeline and was fully stale — removed. Current pipeline is the
> Gemini 3-pass cascade (see README).

## Done

- [x] Gemini cascade: motion scan → wide pass → deep pass → synthesis
- [x] Streaming SSE progress + busboy streaming uploads
- [x] Supabase persistence (videos, sequences, possessions, patterns) + History UI
- [x] Async ffmpeg everywhere — server no longer blocks during video processing
      (also removed the 50MB motion-scan buffer cap)
- [x] Dead-code cleanup: removed OpenAI pipeline + `openai` dep, moved shared
      types to `lib/types.ts`, README rewritten for the Gemini architecture

## Next up (from codebase review, 2026-06-09)

- [ ] **Auth + rate limiting** — before any public deploy:
      - `DELETE/PATCH /api/videos/[id]` use the service-role key with no auth
      - `POST /api/analyze` has no rate limit (each call costs Gemini money)
      - browser writes to `videos` via anon key (RLS effectively open)
- [ ] **Batch DB inserts** — `analyze/route.ts` inserts sequences/possessions
      one row per round-trip; Supabase `.insert()` accepts arrays
- [ ] **Focus Player feature** — UI is hidden (page.tsx) because the analyzer
      returns `playerReport: null` unconditionally. Wire jersey tracking into
      the deep pass + add a player synthesis step, then re-enable
      `FocusPlayerInput`
- [ ] **Frontend cleanup** — `page.tsx` has ~20 useState hooks (→ useReducer);
      split FilmRoom/GamePatterns/PlayerReport; add an error boundary
- [ ] `npm audit` — 3 vulnerabilities reported (1 critical); triage
