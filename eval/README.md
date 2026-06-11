# Accuracy Eval Harness

Measures how accurate the Gemini analyzer actually is, by comparing its output
against possessions you logged by hand while watching the footage. Run it
before and after every accuracy change — if the numbers don't move, the change
didn't work.

## 1. Label a game (no JSON needed — it's a spreadsheet)

Open [labels/example-game.csv](labels/example-game.csv) in **Excel or Google
Sheets**, save a copy as `labels/<your-game-name>.csv`, delete the example
rows, and log one row per possession while you watch the video. (If Excel asks
about the format when saving, keep it as **CSV**.)

| Column | What to put there |
|---|---|
| `possession` | Just count up: 1, 2, 3... |
| `start` | When the possession starts, as `m:ss` from the **start of the video file** (e.g. `4:07`). Plain seconds also work. |
| `end` | When it ends — shot hits the rim/goes in, turnover happens, or whistle blows. |
| `outcome` | One of: `made-2`, `made-3`, `missed`, `turnover`, `defensive-stop`, `foul` (see below). |
| `type` | Optional. One of: `half_court`, `transition`, `pick_and_roll`, `isolation`, `post_up`, `early_offense`, `late_clock`, `baseline_out_of_bounds`, `sideline_out_of_bounds`, `scramble`, `special_situation`. Leave blank if unsure. |
| `notes` | Optional, for yourself. Anything goes. |

### Outcome cheat sheet
- `made-2` / `made-3` — basket scored (the harness treats both as "made" when grading, but keeps the points for future stats checks)
- `missed` — shot attempt that doesn't go in (offensive rebound = the **same** possession continues; only start a new row when the other team gets the ball)
- `turnover` — steal, bad pass, travel, out of bounds
- `defensive-stop` — defense clearly ends the possession without a shot (e.g. shot-clock violation)
- `foul` — possession ends in a whistle/free throws (counted for detection, skipped when grading outcomes, since the analyzer can't say "foul" yet)

### Possession type cheat sheet (all optional — blank is always safe)
- `half_court` — the default; offense sets up against a set defense (~60-70% of possessions)
- `transition` — fast break; scored/attempted before the defense got set (~first 7s)
- `early_offense` — flowed straight into an action quickly, but not a true fast break
- `late_clock` — forced/hurried shot as the clock ran out
- `pick_and_roll` — the possession was *defined* by a ball screen action
- `isolation` — one-on-one with everyone else cleared out
- `post_up` — possession ran through a big with his back to the basket
- `baseline_out_of_bounds` / `sideline_out_of_bounds` — set inbounds play
- `scramble` — chaos: loose balls, broken plays, putback madness
- `special_situation` — end-of-quarter heaves and other weird one-offs

A possession that merely *contains* a ball screen but ends with something else
is still `half_court` — only use the specific types when that action was the
whole story.

### Labeling tips
- A **possession ends when the other team gains control** — not on every pass or dribble.
- Use the video player's timestamp display; pausing at each change of possession is the fastest workflow.
- One labeled **quarter (~8 min)** is enough to start. Two quarters from different games is better.
- Don't agonize over ±1 second on boundaries — the scorer is lenient about drift and reports it separately.

## 2. Run the eval

First time on a video (calls Gemini — costs tokens, takes minutes):

```bash
npm run eval -- --labels eval/labels/game1.csv --video "C:\path\to\game1.mp4"
```

The full analysis is cached at `eval/results/<video-name>.analysis.json`, so
every later run with the same video is **free and instant**. After changing
the analyzer, re-run with `--fresh` to get a new analysis to grade:

```bash
npm run eval -- --labels eval/labels/game1.csv --video "C:\path\to\game1.mp4" --fresh
```

You can also grade any saved analysis JSON directly:

```bash
npm run eval -- --labels eval/labels/game1.csv --analysis eval/results/game1.analysis.json
```

## 3. Read the report

```
POSSESSION DETECTION
  recall   — % of real possessions the analyzer found        (target ≥ 90%)
  precision — % of detected possessions that actually existed (target ≥ 90%)
BOUNDARIES
  how far off the start/end timestamps are, in seconds
OUTCOMES
  accuracy — % of matched possessions with the right outcome  (target ≥ 85%)
  confusion table — e.g. "truth made -> missed=3" means 3 made baskets were called misses
MISSED / HALLUCINATED / OUTCOME MISTAKES
  the exact possessions and timestamps to go re-watch
```

Every run also writes a machine-readable copy to
`eval/results/<labels-name>.report.json` — keep these around to track progress
over time.
