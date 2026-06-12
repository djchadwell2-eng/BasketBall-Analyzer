import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { chunkVideo, type VideoChunk } from './chunker'
import { computeStats } from '../computeStats'
import type {
  AnalysisResult,
  PossessionResult,
  SequenceResult,
  BasketballEvent,
  FocusPlayer,
  FocusTeam,
  TendencyItem,
  PatternInsight,
  RankedObservation,
  GameIdentity,
  StrategicAdjustment,
  GamePlan,
  GamePlanKey,
} from '../types'
import type {
  PossessionSummary,
  RawWideResponse,
  RawDeepPossession,
  RawSynthesisOutput,
  RawGamePlan,
  RawGamePlanKey,
  ChunkError,
} from './gemini-video-analyzer.types'

const execFileAsync = promisify(execFile)

// --- Constants ---
export const GEMINI_MODEL = 'gemini-3.5-flash'
export const CONFIDENCE_THRESHOLD = 0.6
// SDK v0.24.0 doesn't declare mediaResolution in GenerationConfig; the REST API accepts it.
export const MEDIA_RESOLUTION = 'MEDIA_RESOLUTION_MEDIUM'
type ExtendedGenerationConfig = GenerationConfig & { mediaResolution?: string }

const WIDE_MEDIA_RESOLUTION   = 'MEDIA_RESOLUTION_LOW'
// maxOutputTokens includes the model's hidden thinking tokens. At 4000 the
// thinking alone could eat the budget on busy chunks, truncating the JSON
// mid-stream and silently dropping every possession in a 5-minute window.
const WIDE_MAX_OUTPUT_TOKENS  = 16000

export const BURST_FPS    = 4    // frames per second for deep-analysis burst; tune empirically
export const BURST_BEFORE = 1.0  // seconds before peak motion to start burst
export const BURST_AFTER  = 2.0  // seconds after peak motion to end burst
const BURST_FRAME_CAP     = 15   // hard max frames per burst
const DEEP_MAX_OUTPUT_TOKENS     = 8000
const SYNTHESIS_MAX_OUTPUT_TOKENS = 8000  // includes the game_plan section

const MAX_CONCURRENCY  = 4  // wide-pass (1 video request per chunk)
const DEEP_CONCURRENCY = 4  // deep-pass — raise to 6 or 8 if 503s stay low
const MAX_RETRIES = 5

// --- Motion scan constants ---
const MOTION_WIDTH  = 32
const MOTION_HEIGHT = 18
const FRAME_BYTES   = MOTION_WIDTH * MOTION_HEIGHT
const GRID_COLS = 4
const GRID_ROWS = 3
const CELL_W    = MOTION_WIDTH  / GRID_COLS   // 8 px
const CELL_H    = MOTION_HEIGHT / GRID_ROWS   // 6 px

// --- Validation sets ---
const VALID_DIRECTIONS = new Set(['left', 'right', 'center', 'unknown'])
const VALID_OUTCOMES   = new Set(['made', 'missed', 'turnover', 'defensive-stop', 'unknown'])
const VALID_POSSESSION_TYPES = new Set([
  'transition', 'half_court', 'defensive_sequence', 'special_situation',
  'pick_and_roll', 'isolation', 'post_up', 'scramble',
  'early_offense', 'late_clock', 'baseline_out_of_bounds', 'sideline_out_of_bounds',
])
const VALID_CONFIDENCES = new Set(['high', 'medium', 'low'])

// --- Event derivation ---
const ACTION_TO_EVENT: Record<string, string | null> = {
  drive:           null,            // direction-dependent in deriveEvents
  kick_out:        'kickout_pass',
  pull_up:         null,
  catch_shoot:     'catch_and_shoot',
  pick_roll:       'pick_and_roll',
  post_up:         null,
  iso:             'isolation',
  cut:             null,
  ball_reversal:   'ball_reversal',
  transition_push: 'transition_push',
  corner_three:    'corner_three',
  dribble_handoff: null,
  press_break:     null,
}

const OUTCOME_TO_EVENT: Record<string, string> = {
  made:     'made_basket',
  missed:   'missed_shot',
  turnover: 'turnover',
}

function deriveEvents(
  raw: RawDeepPossession,
  possessionId: number,
  conf: 'high' | 'medium' | 'low'
): BasketballEvent[] {
  const events: BasketballEvent[] = []

  for (const at of toStringArray(raw.action_types)) {
    if (at === 'drive') {
      const dir = raw.direction?.toLowerCase()
      const type = dir === 'left' ? 'drive_left'
        : dir === 'right' ? 'drive_right'
        : 'paint_touch'
      events.push({ type, confidence: conf, relatedSequenceId: possessionId, metadata: {} })
    } else {
      const type = ACTION_TO_EVENT[at]
      if (type) events.push({ type, confidence: conf, relatedSequenceId: possessionId, metadata: {} })
    }
  }

  if (raw.defense) {
    const d = raw.defense
    if (d.switch === true)
      events.push({ type: 'switch', confidence: 'medium', relatedSequenceId: possessionId, metadata: {} })
    const help = (d.help_rotation ?? '').toLowerCase()
    if (help && !['none', 'none visible', 'n/a', 'unknown'].includes(help))
      events.push({ type: 'help_rotation', confidence: 'medium', relatedSequenceId: possessionId, metadata: {} })
    if (d.on_ball_pressure === 'hedge')
      events.push({ type: 'hedge', confidence: 'medium', relatedSequenceId: possessionId, metadata: {} })
    else if (d.on_ball_pressure === 'drop')
      events.push({ type: 'drop_coverage', confidence: 'medium', relatedSequenceId: possessionId, metadata: {} })
  }

  const outcomeType = OUTCOME_TO_EVENT[raw.outcome ?? '']
  if (outcomeType)
    events.push({ type: outcomeType, confidence: conf, relatedSequenceId: possessionId, metadata: {} })

  return events
}

// --- Small helpers ---
function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((v): v is string => typeof v === 'string')
}

function parseEvents(raw: unknown): BasketballEvent[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .filter((e): e is Record<string, unknown> =>
      typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).type === 'string'
    )
    .map(e => ({
      type: e.type as string,
      confidence: VALID_CONFIDENCES.has(e.confidence as string)
        ? (e.confidence as BasketballEvent['confidence'])
        : 'medium',
      relatedSequenceId: typeof e.related_sequence_id === 'number' ? e.related_sequence_id : 0,
      metadata: typeof e.metadata === 'object' && e.metadata !== null
        ? (e.metadata as BasketballEvent['metadata'])
        : {},
    }))
}

function numericConfidence(raw: string | number | undefined): number {
  if (typeof raw === 'number') return raw
  if (raw === 'high')   return 0.8
  if (raw === 'medium') return 0.5
  if (raw === 'low')    return 0.3
  return 1.0
}

function mapConfidenceToString(n: number): PossessionResult['confidence'] {
  if (n >= 0.7) return 'high'
  if (n >= 0.4) return 'medium'
  return 'low'
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

// --- Semaphore (no external dependency) ---
function createSemaphore(maxConcurrent: number) {
  let running = 0
  const queue: (() => void)[] = []
  return function acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const tryRun = () => {
        if (running < maxConcurrent) {
          running++
          resolve(() => {
            running--
            if (queue.length > 0) queue.shift()!()
          })
        } else {
          queue.push(tryRun)
        }
      }
      tryRun()
    })
  }
}

// --- Retry with exponential backoff ---
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = MAX_RETRIES): Promise<T> {
  let lastErr: Error = new Error('No attempts made')
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      const isRetriable = /429|5\d{2}|rate.?limit|quota|internal|unavailable/i.test(lastErr.message)
      if (!isRetriable || attempt === maxAttempts) throw lastErr
      const baseMs  = 1000 * Math.pow(2, attempt - 1)        // 1s, 2s, 4s, 8s, 16s
      const jitter  = Math.random() * baseMs * 0.25           // ±25%
      const delayMs = Math.min(Math.round(baseMs + jitter), 16000)
      console.log(
        `[gemini-video-analyzer] ${label} attempt ${attempt}/${maxAttempts} failed,` +
        ` retrying in ${delayMs}ms: ${lastErr.message}`
      )
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// =============================================================================
// COMPONENT A — Motion Scan (free, no API)
// scoreMotionPerSecond + brightness logic (ported from the retired frame-extraction pipeline).
// =============================================================================

interface MotionScore {
  timestamp: number    // seconds from video start (integer, 1-indexed)
  score: number        // mean pixel diff across frame (0–255 scale)
  activeCells: number  // cells (of 12 grid cells) with meaningful motion
  brightnessStability: number  // 0–1; low = lighting flash/cut
}

async function scoreMotionPerSecond(inputPath: string): Promise<MotionScore[]> {
  // spawn + streamed stdout: doesn't block the event loop and has no maxBuffer cap
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', inputPath,
      '-vf', `fps=1,scale=${MOTION_WIDTH}:${MOTION_HEIGHT}`,
      '-pix_fmt', 'gray',
      '-f', 'rawvideo',
      'pipe:1',
    ])
    const chunks: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.stderr.resume() // drain so ffmpeg never stalls on a full stderr pipe
    proc.on('error', reject)
    proc.on('close', code => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`[motion-scan] ffmpeg exited with code ${code}`))
    })
  })

  const totalFrames = Math.floor(raw.length / FRAME_BYTES)
  const scores: MotionScore[] = []
  let prevBrightness = 0

  if (totalFrames > 0) {
    const firstFrame = raw.subarray(0, FRAME_BYTES)
    for (let j = 0; j < FRAME_BYTES; j++) prevBrightness += firstFrame[j]
    prevBrightness /= FRAME_BYTES
  }

  for (let i = 1; i < totalFrames; i++) {
    const prev = raw.subarray((i - 1) * FRAME_BYTES, i * FRAME_BYTES)
    const curr = raw.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES)

    const cellDiffSums = new Array<number>(GRID_COLS * GRID_ROWS).fill(0)
    let totalDiff = 0
    let currBrightness = 0

    for (let j = 0; j < FRAME_BYTES; j++) {
      const diff = Math.abs(curr[j] - prev[j])
      totalDiff += diff
      currBrightness += curr[j]
      const x = j % MOTION_WIDTH
      const y = Math.floor(j / MOTION_WIDTH)
      const gridRow = Math.min(Math.floor(y / CELL_H), GRID_ROWS - 1)
      const gridCol = Math.min(Math.floor(x / CELL_W), GRID_COLS - 1)
      cellDiffSums[gridRow * GRID_COLS + gridCol] += diff
    }

    const cellArea = CELL_W * CELL_H
    const activeCells = cellDiffSums.filter(s => s / cellArea >= 2.5).length
    currBrightness /= FRAME_BYTES
    const brightnessDelta = Math.abs(currBrightness - prevBrightness)
    const brightnessStability = Math.max(0, 1 - brightnessDelta / 40)
    prevBrightness = currBrightness

    scores.push({ timestamp: i, score: totalDiff / FRAME_BYTES, activeCells, brightnessStability })
  }

  return scores
}

function findPeakMotion(scores: MotionScore[], startTs: number, endTs: number): number {
  const midpoint = (startTs + endTs) / 2
  let best = midpoint
  let bestScore = -1
  for (const s of scores) {
    if (s.timestamp >= startTs && s.timestamp <= endTs && s.score > bestScore) {
      bestScore = s.score
      best = s.timestamp
    }
  }
  return best
}

// =============================================================================
// Team perspective — tells every prompt WHICH team the report is about.
// Without this, Gemini picks a team arbitrarily and "offense"/"defense" in the
// output may flip between possessions.
// =============================================================================

/** Human-readable team label, e.g. `the team in white jerseys (Eagles)`. */
function focusTeamLabel(focusTeam: FocusTeam): string {
  const name = focusTeam.teamName?.trim()
  return `the team in ${focusTeam.jerseyColor.trim()} jerseys${name ? ` (${name})` : ''}`
}

// =============================================================================
// COMPONENT B — Wide Pass (coverage: 1fps + LOW res, whole game)
// =============================================================================

function buildWidePassPrompt(focusTeam: FocusTeam | null): string {
  const teamBlock = focusTeam
    ? `\nFOCUS TEAM: This scouting report is about ${focusTeamLabel(focusTeam)}.
Use possession_type "defensive_sequence" ONLY for possessions where the OPPONENT of ${focusTeamLabel(focusTeam)} has the ball.\n`
    : ''
  return `You are a basketball video analyst providing game segmentation data for a coaching tool.
${teamBlock}

Watch this video clip and:
1. List EVERY active basketball possession (live ball, game clock running)
2. For each possession record its start time, end time, and type (all in seconds from clip start)
3. List all continuous live-gameplay windows in this clip

ACTIVE GAMEPLAY = live ball in play, game clock running, players actively competing.
NOT GAMEPLAY = warmups, pregame, national anthem, halftime show, timeouts after whistles,
  team huddles, bench reactions, crowd shots, dead ball stoppages, free throw ceremonies,
  score celebration pauses, coaches talking, player introductions, shot clock resets.

A POSSESSION = one team's continuous ball-handling phase, from inbound/rebound/steal/make
to the next dead ball or change of possession.

Return ONLY valid JSON:
{
  "possessions": [
    {
      "possession_id": 0,
      "start_ts": 2.5,
      "end_ts": 14.0,
      "possession_type": "half_court"
    }
  ],
  "gameplay_ranges": [
    { "start": 0.0, "end": 298.5 }
  ]
}

POSSESSION TYPES:
  half_court | transition | pick_and_roll | isolation | post_up | scramble |
  early_offense | late_clock | baseline_out_of_bounds | sideline_out_of_bounds | defensive_sequence

RULES:
- List EVERY possession in active gameplay -- do not skip or merge possessions
- start_ts and end_ts are seconds from the START OF THIS CLIP
- gameplay_ranges covers the full continuous windows of live game action in this clip
- Omit only possessions under 2 seconds where the ball is clearly dead
- If the entire clip is live gameplay, return one gameplay_range from 0.0 to clip end
- Respond with ONLY the JSON object -- no markdown fences, no preamble, no explanation`
}

async function uploadAndPoll(
  filePath: string,
  label: string,
  fileManager: GoogleAIFileManager
): Promise<{ uri: string; name: string }> {
  return withRetry(`${label} upload`, async () => {
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType: 'video/mp4',
      displayName: `bball_${label}_${Date.now()}`,
    })
    let file = uploadResult.file
    const deadline = Date.now() + 120_000
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) throw new Error('File API processing timeout (120s)')
      await new Promise(r => setTimeout(r, 3000))
      file = await fileManager.getFile(file.name)
    }
    if (file.state === FileState.FAILED) throw new Error(`Gemini file processing failed: ${label}`)
    return { uri: file.uri, name: file.name }
  })
}

async function processWideChunk(
  chunk: VideoChunk,
  totalChunks: number,
  fileManager: GoogleAIFileManager,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  focusTeam: FocusTeam | null
): Promise<PossessionSummary[]> {
  console.log(`[wide-pass] chunk ${chunk.index + 1}/${totalChunks} start (offset=${chunk.startOffset}s)`)
  let uploadedName: string | undefined

  try {
    const { uri, name } = await uploadAndPoll(chunk.path, `wide_${chunk.index}`, fileManager)
    uploadedName = name

    // JSON.parse lives INSIDE the retry: a truncated or malformed response is
    // retried like any other failure instead of silently dropping the chunk's
    // possessions. If all retries fail, the error lands in chunkErrors where
    // the user can see it.
    const raw = await withRetry(`chunk ${chunk.index} wide`, async () => {
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [
          { fileData: { mimeType: 'video/mp4', fileUri: uri } },
          { text: buildWidePassPrompt(focusTeam) },
        ]}],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: WIDE_MAX_OUTPUT_TOKENS,
          mediaResolution: WIDE_MEDIA_RESOLUTION,
        } as ExtendedGenerationConfig,
      })
      const u = res.response.usageMetadata
      const finishReason = res.response.candidates?.[0]?.finishReason
      if (u) {
        const thoughts = (u as unknown as Record<string, unknown>).thoughtsTokenCount
        console.log(`[tokens] chunk ${chunk.index + 1} wide: prompt=${u.promptTokenCount}, output=${u.candidatesTokenCount}, thoughts=${thoughts ?? 'n/a'}, total=${u.totalTokenCount}, finishReason=${finishReason}`)
      }
      const text = stripFences(res.response.text())
      try {
        return JSON.parse(text) as RawWideResponse
      } catch {
        console.warn(`[wide-pass] chunk ${chunk.index} JSON parse failed (finishReason=${finishReason}) -- tail: ...${text.slice(-160)}`)
        throw new Error(`chunk ${chunk.index} wide pass returned unparseable JSON (finishReason=${finishReason})`)
      }
    })

    const rawPossessions = Array.isArray(raw.possessions) ? raw.possessions : []
    const summaries: PossessionSummary[] = rawPossessions
      .filter(rp => typeof rp.start_ts === 'number' && typeof rp.end_ts === 'number')
      .map((rp, i) => ({
        possessionId: i,
        startTs: (rp.start_ts as number) + chunk.startOffset,
        endTs:   (rp.end_ts   as number) + chunk.startOffset,
        possessionType: rp.possession_type ?? 'half_court',
      }))

    console.log(`[wide-pass] chunk ${chunk.index + 1}/${totalChunks}: ${summaries.length} possessions found`)
    return summaries
  } finally {
    if (uploadedName) { try { await fileManager.deleteFile(uploadedName) } catch {} }
  }
}

async function processWidePass(
  videoPath: string,
  fileManager: GoogleAIFileManager,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  focusTeam: FocusTeam | null
): Promise<{ summaries: PossessionSummary[]; chunkErrors: ChunkError[] }> {
  const chunks = await chunkVideo(videoPath)
  const acquire = createSemaphore(MAX_CONCURRENCY)
  const results: PossessionSummary[][] = chunks.map(() => [])
  const chunkErrors: ChunkError[] = []

  await Promise.all(chunks.map(async (chunk) => {
    const release = await acquire()
    try {
      results[chunk.index] = await processWideChunk(chunk, chunks.length, fileManager, model, focusTeam)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[wide-pass] chunk ${chunk.index} FAILED (non-fatal): ${msg}`)
      chunkErrors.push({ chunkIndex: chunk.index, startOffset: chunk.startOffset, error: msg })
    } finally {
      release()
      try { fs.unlinkSync(chunk.path) } catch {}
    }
  }))

  let globalId = 0
  const summaries = results.flat().map(p => ({ ...p, possessionId: globalId++ }))
  return { summaries, chunkErrors }
}

// =============================================================================
// COMPONENT C — Deep Pass (per-possession JPEG burst, inline inlineData, no File API)
// =============================================================================

function buildDeepBurstPrompt(possessionId: number, startTs: number, endTs: number, frameCount: number, focusTeam: FocusTeam | null): string {
  const teamBlock = focusTeam
    ? `\nPERSPECTIVE: This report is for the coach of ${focusTeamLabel(focusTeam)} — the FOCUS TEAM.
- If the focus team has the ball: describe THEIR offense.
- If the opponent has the ball: emphasize how the focus team DEFENDS (the defense fields describe the focus team).
- Write what_it_means and coaching_point as advice to the focus team's coach.\n`
    : ''
  return `Basketball film analyst. ${frameCount} ordered frames, possession ${possessionId}, game time ${startTs.toFixed(1)}s–${endTs.toFixed(1)}s.
${teamBlock}
RULES (all mandatory):
1. Only describe what is physically visible. Never invent.
2. Use "appears to"/"seems to" for anything inferred.
3. OUTCOME: "made"=ball visibly through rim or scoreboard change; "missed"=ball off rim/backboard; "turnover"=steal/OOB/violation; "defensive-stop"=defense clearly prevents score; "unknown"=default for any doubt or cut-away.
4. Assign action_types ONLY if movement pattern is clearly visible.
5. SHOTS: only assign catch_shoot/pull_up if you SEE a shooting motion or ball released toward the rim. If the ball is passed to a teammate, do NOT add catch_shoot/pull_up and do NOT assign a made/missed outcome. When unsure between pass and shot, treat it as a PASS.
6. Unknown or uncertain fields → "unknown" or null.

DEFENSE (fill all 4 fields, no skipping):
pickup_point: paint|mid-range|3-point line|half-court|full-court|unknown
on_ball_pressure: aggressive|passive|switch|hedge|drop|unknown
help_rotation: describe visible help by court position, or "none visible"
switch: true/false/null

Return ONLY this JSON (no fences, no preamble):
{"possession_id":${possessionId},"start_ts":${startTs},"end_ts":${endTs},"possession_type":"half_court","action_types":[],"outcome":"unknown","direction":"unknown","defense":{"pickup_point":"unknown","on_ball_pressure":"unknown","help_rotation":"none visible","switch":null},"confidence":0.0,"what_happened":"","what_it_means":"","why_it_matters":"","coaching_point":"","pattern_context":""}

possession_type: half_court|transition|pick_and_roll|isolation|post_up|scramble|early_offense|late_clock|baseline_out_of_bounds|sideline_out_of_bounds|defensive_sequence
action_types: drive|kick_out|pull_up|catch_shoot|pick_roll|post_up|iso|cut|ball_reversal|transition_push|corner_three|dribble_handoff|press_break
outcome: made|missed|turnover|defensive_stop|unknown  direction: left|right|center|unknown
confidence: 0.8-1.0=clearly visible; 0.5-0.79=inferred (use hedged prose); <0.5={"possession_id":${possessionId},"confidence":0.0,"outcome":"unknown"} only`
}

async function extractBurstFrames(
  videoPath: string,
  startS: number,
  endS: number,
  fps: number,
  cap: number
): Promise<string[]> {
  const duration = Math.max(0.1, endS - startS)
  const sessionId = `burst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const outPattern = path.join(os.tmpdir(), `${sessionId}_%03d.jpg`)
  const frames: string[] = []

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', startS.toFixed(3),
      '-t', duration.toFixed(3),
      '-i', videoPath,
      '-vf', `fps=${fps}`,
      '-frames:v', String(cap),
      '-q:v', '2',
      outPattern,
    ], { maxBuffer: 10 * 1024 * 1024 })
  } catch {
    // ffmpeg may exit non-zero even when frames were written; fall through to read what exists
  }

  for (let i = 1; i <= cap; i++) {
    const p = path.join(os.tmpdir(), `${sessionId}_${String(i).padStart(3, '0')}.jpg`)
    try {
      frames.push((await fs.promises.readFile(p)).toString('base64'))
    } catch {
      break // frame doesn't exist — ffmpeg produced fewer than cap
    }
    fs.promises.unlink(p).catch(() => {})
  }

  return frames
}

function buildKeyObservations(raw: RawDeepPossession): string[] {
  const obs: string[] = []
  if (raw.what_happened) obs.push(`OFFENSE: ${raw.what_happened}`)
  if (raw.defense) {
    const d = raw.defense
    obs.push(
      `DEFENSE: pickup=${d.pickup_point ?? 'unknown'},` +
      ` pressure=${d.on_ball_pressure ?? 'unknown'},` +
      ` help=${d.help_rotation ?? 'none visible'}`
    )
  }
  return obs
}

async function analyzeOnePossession(
  possession: PossessionSummary,
  motionScores: MotionScore[],
  videoPath: string,
  videoDuration: number,
  possessionIndex: number,
  totalPossessions: number,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  focusTeam: FocusTeam | null
): Promise<{ possession: PossessionResult; sequence: SequenceResult } | null> {
  const peakTs     = findPeakMotion(motionScores, possession.startTs, possession.endTs)
  const burstStart = Math.max(0, peakTs - BURST_BEFORE)
  const burstEnd   = Math.min(videoDuration, peakTs + BURST_AFTER)

  const frames = await extractBurstFrames(videoPath, burstStart, burstEnd, BURST_FPS, BURST_FRAME_CAP)
  // DIAG 1: burst extraction result
  console.log(
    `[diag] possession ${possessionIndex + 1}/${totalPossessions}:` +
    ` peak_ts=${peakTs.toFixed(2)}s (window ${burstStart.toFixed(2)}s–${burstEnd.toFixed(2)}s),` +
    ` burst_frames=${frames.length}`
  )
  if (frames.length === 0) {
    console.warn(`[deep-pass] possession ${possessionIndex + 1}/${totalPossessions}: DROP — zero burst frames extracted`)
    return null
  }

  const prompt = buildDeepBurstPrompt(possession.possessionId, possession.startTs, possession.endTs, frames.length, focusTeam)
  const imageParts = frames.map(b64 => ({ inlineData: { mimeType: 'image/jpeg', data: b64 } }))

  const rawText = await withRetry(`possession ${possessionIndex} deep`, async () => {
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: DEEP_MAX_OUTPUT_TOKENS,
        mediaResolution: MEDIA_RESOLUTION,
      } as ExtendedGenerationConfig,
    })
    const u = res.response.usageMetadata
    if (u) {
      const thoughts = (u as unknown as Record<string, unknown>).thoughtsTokenCount
      console.log(`[tokens] possession ${possessionIndex + 1} deep: prompt=${u.promptTokenCount}, output=${u.candidatesTokenCount}, thoughts=${thoughts ?? 'n/a'}, total=${u.totalTokenCount}`)
    }
    // DIAG: finishReason and the literal maxOutputTokens sent on this request
    const finishReason = res.response.candidates?.[0]?.finishReason
    console.log(`[diag] possession ${possessionIndex + 1} finishReason=${finishReason}, maxOutputTokens_sent=${DEEP_MAX_OUTPUT_TOKENS}`)
    return stripFences(res.response.text())
  })
  // DIAG 2: raw model response text before any parsing
  console.log(`[diag] possession ${possessionIndex + 1} raw response: ${rawText}`)

  let raw: RawDeepPossession = {}
  try { raw = JSON.parse(rawText) as RawDeepPossession } catch {
    console.warn(`[deep-pass] possession ${possessionIndex + 1}: DROP — JSON parse failed. Raw: ${rawText.slice(0, 200)}`)
    return null
  }
  // DIAG 3: parsed confidence value and its JS type
  console.log(
    `[diag] possession ${possessionIndex + 1} parsed:` +
    ` confidence=${JSON.stringify(raw.confidence)} (type=${typeof raw.confidence}),` +
    ` outcome=${JSON.stringify(raw.outcome)}, possession_type=${JSON.stringify(raw.possession_type)}`
  )

  const conf = numericConfidence(raw.confidence)
  // DIAG 4: exact drop reason
  if (conf < CONFIDENCE_THRESHOLD) {
    console.log(
      `[deep-pass] possession ${possessionIndex + 1}/${totalPossessions}: DROP — conf=${conf.toFixed(4)}` +
      ` (raw value was ${JSON.stringify(raw.confidence)}, type=${typeof raw.confidence},` +
      ` threshold=${CONFIDENCE_THRESHOLD})`
    )
    return null
  }
  console.log(
    `[deep-pass] possession ${possessionIndex + 1}/${totalPossessions}: KEPT —` +
    ` peak_ts=${peakTs.toFixed(1)}s, frames=${frames.length},` +
    ` outcome=${raw.outcome ?? 'unknown'}, conf=${conf.toFixed(2)}`
  )

  const possessionResult: PossessionResult = {
    possessionId: possession.possessionId,
    possessionType: VALID_POSSESSION_TYPES.has(raw.possession_type ?? '')
      ? raw.possession_type as PossessionResult['possessionType']
      : 'half_court',
    startTimestamp:  possession.startTs,
    endTimestamp:    possession.endTs,
    summary:         raw.what_happened ?? '',
    coachingInsight: raw.coaching_point ?? '',
    keyObservations: buildKeyObservations(raw),
    outcome:         VALID_OUTCOMES.has(raw.outcome ?? '') ? raw.outcome! : 'unknown',
    metadata: {
      directionHint: VALID_DIRECTIONS.has(raw.direction ?? '')
        ? raw.direction as PossessionResult['metadata']['directionHint']
        : 'unknown',
      actionTypes: toStringArray(raw.action_types),
    },
    tacticalTags:    [],
    paceProfile:     'medium',
    confidence:      mapConfidenceToString(conf),
    importanceScore: undefined,
    events:          deriveEvents(raw, possession.possessionId, mapConfidenceToString(conf)),
    sequences:       [],
  }

  const seqResult: SequenceResult = {
    sequenceIndex:    possession.possessionId,
    possessionId:     possession.possessionId,
    timestampStart:   possession.startTs,
    timestampEnd:     possession.endTs,
    playType:         toStringArray(raw.action_types)[0] ?? possession.possessionType,
    whatHappened:     raw.what_happened ?? '',
    whatItMeans:      raw.what_it_means ?? '',
    whyItMatters:     raw.why_it_matters ?? '',
    coachingPoint:    raw.coaching_point ?? '',
    patternContext:   raw.pattern_context ?? '',
    directionHint:    VALID_DIRECTIONS.has(raw.direction ?? '')
      ? raw.direction as SequenceResult['directionHint']
      : 'unknown',
    tags:             [],
    actionTypes:      toStringArray(raw.action_types),
    outcome:          VALID_OUTCOMES.has(raw.outcome ?? '')
      ? raw.outcome as SequenceResult['outcome']
      : 'unknown',
    summary:          raw.what_happened ?? '',
    coachingTakeaway: raw.coaching_point ?? '',
    thumbnail:        '',
  }

  possessionResult.sequences = [seqResult]
  return { possession: possessionResult, sequence: seqResult }
}

async function processDeepPass(
  wideSummaries: PossessionSummary[],
  motionScores: MotionScore[],
  videoPath: string,
  videoDuration: number,
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  focusTeam: FocusTeam | null
): Promise<{ possessions: PossessionResult[]; sequences: SequenceResult[] }> {
  const acquire = createSemaphore(DEEP_CONCURRENCY)
  const results: ({ possession: PossessionResult; sequence: SequenceResult } | null)[] =
    new Array(wideSummaries.length).fill(null)

  await Promise.all(wideSummaries.map(async (poss, i) => {
    const release = await acquire()
    try {
      results[i] = await analyzeOnePossession(
        poss, motionScores, videoPath, videoDuration, i, wideSummaries.length, model, focusTeam
      )
    } catch (err) {
      console.error(`[deep-pass] possession ${i + 1} FAILED: ${err}`)
      results[i] = null
    } finally {
      release()
    }
  }))

  const possessions: PossessionResult[] = []
  const sequences:   SequenceResult[]   = []
  let seqIndex = 0

  for (const r of results) {
    if (!r) continue
    const newPossId = possessions.length
    const poss = { ...r.possession, possessionId: newPossId, sequences: [] as SequenceResult[] }
    const seq  = { ...r.sequence, sequenceIndex: seqIndex++, possessionId: newPossId }
    poss.sequences = [seq]
    possessions.push(poss)
    sequences.push(seq)
  }

  return { possessions, sequences }
}

// =============================================================================
// SYNTHESIS — text-only pass over kept possession records
// =============================================================================

function buildSynthesisPrompt(possessionCount: number, inputJson: string, focusTeam: FocusTeam | null): string {
  const teamBlock = focusTeam
    ? `\nPERSPECTIVE: Every part of this report is about ${focusTeamLabel(focusTeam)} — the FOCUS TEAM.
- offensive_tendencies: how the focus team plays when THEY have the ball
- defensive_tendencies: how the focus team defends when the opponent has the ball
- possible_weaknesses and coaching_takeaways: about the focus team, written for THEIR coach
- game_narrative: a scouting report on the focus team specifically\n`
    : ''
  return `You are a basketball analyst synthesizing a scouting report from verified possession data.
${teamBlock}
You have been given ${possessionCount} analyzed possessions from a basketball game clip.
Each possession was verified by a frame-by-frame video analysis pass. Your job is to
synthesize patterns, tendencies, and coaching insights across ALL possessions.

POSSESSION DATA:
${inputJson}

===========================================
SYNTHESIS RULES -- FOLLOW STRICTLY
===========================================
1. Only reference events, actions, and patterns that appear in the possession data above.
   Do NOT invent plays, outcomes, or observations that are not present in the input.
2. Use hedged language for inferences: "appears to", "tends to", "shows signs of"
3. coaching_takeaways must each be tied to specific evidence in the data -- no generic
   coaching philosophy. Reference action_types, outcomes, and patterns you observe.
4. key_moments: pick 3-5 possessions with the highest tactical value.
   The ts field MUST exactly match a start_ts value from the possession data above.
5. possible_weaknesses: frame as possibilities only ("appears to struggle with...",
   "may have difficulty...") unless the evidence across multiple possessions is clear.
6. game_narrative: 2-3 paragraphs suitable for a scouting report.
   Factual, specific, grounded only in what the data shows. No filler language.
7. game_plan: written for a coach PREPARING TO PLAY AGAINST the analyzed team.
   - offensive_keys: how to attack this team when YOU have the ball -- target the
     weaknesses and defensive habits visible in the data
   - defensive_keys: how to take away what this team does best on offense
   - tempo_advice: should an opponent run with this team or slow them down, and why
   - matchup_notes: personnel or situational notes worth game-planning around
   Every key must be grounded in the possession data (cite supporting_ts where possible).
   Titles are short imperatives a coach would write on a whiteboard ("Pack the paint",
   "Pressure the outlet"). Details are 1-3 specific sentences.

Return ONLY valid JSON:
{
  "offensive_tendencies": [
    "Tendency description tied to observed action_types and possession outcomes"
  ],
  "defensive_tendencies": [
    "Defensive tendency tied to observed key_observations in the data"
  ],
  "transition_analysis": "One paragraph on transition patterns observed across possessions.",
  "possible_weaknesses": [
    "Hedged weakness statement tied to possession evidence"
  ],
  "coaching_takeaways": [
    "Specific actionable takeaway, tied to what was observed (not generic advice)"
  ],
  "game_narrative": "2-3 paragraph scouting narrative grounded in the possession data.",
  "key_moments": [
    { "ts": 12.5, "why": "One sentence on why this moment is tactically significant" }
  ],
  "game_plan": {
    "offensive_keys": [
      { "title": "Short whiteboard imperative", "detail": "1-3 specific sentences grounded in the data", "supporting_ts": [12.5] }
    ],
    "defensive_keys": [
      { "title": "Short whiteboard imperative", "detail": "1-3 specific sentences grounded in the data", "supporting_ts": [] }
    ],
    "tempo_advice": "1-2 sentences on pace strategy against this team",
    "matchup_notes": ["Personnel/situational note"]
  }
}

ARRAY LENGTHS:
- offensive_tendencies: 2-5 items
- defensive_tendencies: 2-5 items
- possible_weaknesses: 1-4 items
- coaching_takeaways: 3-6 items, each unique and specific
- key_moments: 3-5 items; ts values MUST be start_ts values from the possession data
- game_plan.offensive_keys: 2-4 items; game_plan.defensive_keys: 2-4 items; matchup_notes: 0-3 items

Respond with ONLY the JSON object -- no markdown fences, no preamble, no commentary`
}

function parseKeyMoments(val: unknown): { ts: number; why: string }[] {
  if (!Array.isArray(val)) return []
  return (val as unknown[])
    .filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null
    )
    .map(item => ({
      ts:  typeof item.ts  === 'number' ? item.ts  : 0,
      why: typeof item.why === 'string' ? item.why : '',
    }))
}

function tendencyName(text: string): string {
  const commaIdx = text.indexOf(',')
  const dotIdx   = text.indexOf('.')
  const end = Math.min(
    commaIdx > 0 ? commaIdx : text.length,
    dotIdx   > 0 ? dotIdx   : text.length,
    60
  )
  return text.slice(0, end).trim()
}

function parseGamePlanKeys(val: unknown): GamePlanKey[] {
  if (!Array.isArray(val)) return []
  return (val as RawGamePlanKey[])
    .filter(k => typeof k === 'object' && k !== null && (k.title || k.detail))
    .map(k => ({
      title:  typeof k.title  === 'string' ? k.title  : '',
      detail: typeof k.detail === 'string' ? k.detail : '',
      supportingTimestamps: Array.isArray(k.supporting_ts)
        ? (k.supporting_ts as unknown[]).filter((t): t is number => typeof t === 'number')
        : [],
    }))
}

function parseGamePlan(raw: RawGamePlan | undefined): GamePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const offensiveKeys = parseGamePlanKeys(raw.offensive_keys)
  const defensiveKeys = parseGamePlanKeys(raw.defensive_keys)
  const tempoAdvice   = typeof raw.tempo_advice === 'string' ? raw.tempo_advice : ''
  const matchupNotes  = toStringArray(raw.matchup_notes)
  if (offensiveKeys.length === 0 && defensiveKeys.length === 0 && !tempoAdvice) return null
  return { offensiveKeys, defensiveKeys, tempoAdvice, matchupNotes }
}

function mapSynthesisToResult(raw: RawSynthesisOutput) {
  const offStrings = toStringArray(raw.offensive_tendencies)
  const defStrings = toStringArray(raw.defensive_tendencies)
  const weaknesses = toStringArray(raw.possible_weaknesses)
  const takeaways  = toStringArray(raw.coaching_takeaways)
  const keyMoments = parseKeyMoments(raw.key_moments)

  const offensiveTendencies: TendencyItem[] = offStrings.map((t, i) => ({
    name: tendencyName(t),
    description: t,
    significance: (i === 0 ? 'high' : 'medium') as TendencyItem['significance'],
    supportingTimestamps: [],
  }))

  const defensiveTendencies: TendencyItem[] = defStrings.map((t, i) => ({
    name: tendencyName(t),
    description: t,
    significance: (i === 0 ? 'high' : 'medium') as TendencyItem['significance'],
    supportingTimestamps: [],
  }))

  // coaching_takeaways → primary Intelligence layer (Ranked Observations)
  const rankedObservations: RankedObservation[] = takeaways.map((t, i) => ({
    rank: i + 1,
    title: tendencyName(t),
    detailedObservation: t,
    basketballContext: '',
    evidenceStrength:     (i < 2 ? 'high' : 'medium') as RankedObservation['evidenceStrength'],
    confidenceLevel:      (i < 2 ? 'high' : 'medium') as RankedObservation['confidenceLevel'],
    tacticalSignificance: (i === 0 ? 'primary' : 'secondary') as RankedObservation['tacticalSignificance'],
    supportingTimestamps: [],
  }))

  // key_moments → Pattern Insights (collapsible Supporting Intelligence, with timestamps)
  const patternInsights: PatternInsight[] = keyMoments.map((km, i) => ({
    patternName: km.why.split('.')[0].slice(0, 60) || `Key Moment ${i + 1}`,
    occurrences: 1,
    description: km.why,
    coachingImpact: '',
    recommendation: '',
    category: 'general' as PatternInsight['category'],
    supportingTimestamps: km.ts > 0 ? [km.ts] : [],
  }))

  // game_narrative + tendencies → Team Identity card
  const gameIdentity: GameIdentity | null =
    (raw.game_narrative || offStrings.length > 0 || defStrings.length > 0)
      ? {
          offensiveIdentity: offStrings[0] ?? '',
          defensiveIdentity: defStrings[0] ?? '',
          pace: 'medium' as GameIdentity['pace'],
          primaryStrengths: takeaways.slice(0, 3).map(t => tendencyName(t).slice(0, 40)),
          primaryWeaknesses: weaknesses,
        }
      : null

  const narrativeSummary = raw.game_narrative
    ? `## Scouting Report\n\n${raw.game_narrative}`
    : ''

  console.log(
    `[synthesis] complete -- tendencies: ${offStrings.length} off, ${defStrings.length} def,` +
    ` takeaways: ${takeaways.length}, key_moments: ${keyMoments.length}`
  )

  return {
    offensiveTendencies,
    defensiveTendencies,
    transitionAnalysis:  raw.transition_analysis ?? '',
    patternInsights,
    rankedObservations,
    strategicAdjustments: [] as StrategicAdjustment[],
    gameIdentity,
    gamePlan: parseGamePlan(raw.game_plan),
    narrativeSummary,
  }
}

function emptySynthesisDefaults(): ReturnType<typeof mapSynthesisToResult> {
  return {
    offensiveTendencies:  [],
    defensiveTendencies:  [],
    transitionAnalysis:   '',
    patternInsights:      [],
    rankedObservations:   [],
    strategicAdjustments: [],
    gameIdentity:         null,
    gamePlan:             null,
    narrativeSummary:     '',
  }
}

async function runSynthesis(
  possessions: PossessionResult[],
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  focusTeam: FocusTeam | null
): Promise<ReturnType<typeof mapSynthesisToResult>> {
  if (possessions.length === 0) return emptySynthesisDefaults()

  const synthesisInput = possessions.map(p => ({
    possession_type:  p.possessionType,
    start_ts:         p.startTimestamp,
    action_types:     p.metadata.actionTypes,
    outcome:          p.outcome,
    direction:        p.metadata.directionHint,
    key_observations: p.keyObservations,
    confidence:       p.confidence,
  }))

  const inputJson = JSON.stringify(synthesisInput, null, 2)
  const prompt    = buildSynthesisPrompt(possessions.length, inputJson, focusTeam)

  console.log(`[synthesis] running on ${possessions.length} possessions...`)

  let rawText: string
  let synthRawText = ''
  let synthFinishReason: string | undefined
  try {
    rawText = await withRetry('synthesis', async () => {
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: SYNTHESIS_MAX_OUTPUT_TOKENS,
        } as ExtendedGenerationConfig,
      })
      const u = res.response.usageMetadata
      if (u) {
        const thoughts = (u as unknown as Record<string, unknown>).thoughtsTokenCount
        console.log(`[tokens] synthesis: prompt=${u.promptTokenCount}, output=${u.candidatesTokenCount}, thoughts=${thoughts ?? 'n/a'}, total=${u.totalTokenCount}`)
      }
      synthFinishReason = res.response.candidates?.[0]?.finishReason
      synthRawText = res.response.text()
      return stripFences(synthRawText)
    })
  } catch (err) {
    console.warn(`[synthesis] WARNING -- Gemini call failed, degrading gracefully: ${err}`)
    return emptySynthesisDefaults()
  }

  let raw: RawSynthesisOutput
  try {
    raw = JSON.parse(rawText) as RawSynthesisOutput
  } catch {
    console.warn('[synthesis] WARNING -- JSON parse failed, degrading gracefully')
    console.log('[synthesis] PARSE FAIL finishReason:', synthFinishReason)
    console.log('[synthesis] PARSE FAIL raw:', synthRawText)
    console.log('[synthesis] PARSE FAIL post-stripFences:', rawText)
    return emptySynthesisDefaults()
  }

  return mapSynthesisToResult(raw)
}

// =============================================================================
// Public API
// =============================================================================
export async function analyzeVideoWithGemini(
  videoPath: string,
  focusPlayer?: FocusPlayer | null,
  videoDurationSeconds?: number,
  focusTeam?: FocusTeam | null
): Promise<AnalysisResult & { chunkErrors: ChunkError[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[gemini-video-analyzer] GEMINI_API_KEY is not set. Add it to .env.local.')
  const genAI = new GoogleGenerativeAI(apiKey)
  const fileManager = new GoogleAIFileManager(apiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const team = focusTeam ?? null
  if (team) console.log(`[analyzer] focus team: ${focusTeamLabel(team)}`)
  else console.log('[analyzer] no focus team set — analysis is team-agnostic')

  // Component A — motion scan (free, no API call)
  console.log('[motion-scan] scanning full video for motion...')
  const motionScores = await scoreMotionPerSecond(videoPath)
  const highActionCount = motionScores.filter(s => s.activeCells >= 4).length
  console.log(`[motion-scan] done: ${motionScores.length}s scanned, ${highActionCount} high-action seconds`)

  // Component B — wide pass (all possessions, 1fps LOW res)
  const { summaries: wideSummaries, chunkErrors } = await processWidePass(videoPath, fileManager, model, team)
  console.log(`[wide-pass] total possessions across all chunks: ${wideSummaries.length}`)

  if (wideSummaries.length === 0) {
    return {
      summary: '## Basketball Analysis (Gemini Cascade)\n\nNo possessions detected in gameplay.',
      model: GEMINI_MODEL,
      frameCount: videoDurationSeconds ?? motionScores.length,
      sequences: [], possessions: [],
      patternInsights: [], offensiveTendencies: [], defensiveTendencies: [],
      transitionAnalysis: '', gameIdentity: null, gamePlan: null, playerReport: null,
      strategicAdjustments: [], rankedObservations: [],
      computedStats: computeStats([], []),
      chunkErrors,
    }
  }

  const videoDuration = videoDurationSeconds
    ?? (motionScores.length > 0 ? motionScores[motionScores.length - 1].timestamp + 1 : 3600)

  // Component C — deep pass (per-possession burst)
  const { possessions, sequences } = await processDeepPass(
    wideSummaries, motionScores, videoPath, videoDuration, model, team
  )
  console.log(
    `[deep-pass] kept ${possessions.length}/${wideSummaries.length} possessions` +
    ` (confidence >= ${CONFIDENCE_THRESHOLD})`
  )

  // Synthesis — text-only pass over kept possession records
  const synthesis = await runSynthesis(possessions, model, team)

  const computedStats = computeStats(sequences, possessions)

  const errorNote = chunkErrors.length > 0
    ? `\n\n> ${chunkErrors.length} wide-pass segment(s) failed: chunks ${chunkErrors.map(e => e.chunkIndex).join(', ')}`
    : ''

  const fallbackSummary =
    `## Basketball Analysis (Gemini Cascade)\n\n` +
    `Wide pass found ${wideSummaries.length} possession(s). ` +
    `Deep analysis kept ${possessions.length} possession(s).` +
    errorNote

  const summary = synthesis.narrativeSummary
    ? synthesis.narrativeSummary + (errorNote ? '\n\n' + errorNote : '')
    : fallbackSummary

  return {
    summary,
    model: GEMINI_MODEL,
    frameCount: videoDurationSeconds ?? motionScores.length,
    sequences,
    possessions,
    patternInsights:      synthesis.patternInsights,
    offensiveTendencies:  synthesis.offensiveTendencies,
    defensiveTendencies:  synthesis.defensiveTendencies,
    transitionAnalysis:   synthesis.transitionAnalysis,
    gameIdentity:         synthesis.gameIdentity,
    gamePlan:             synthesis.gamePlan,
    // TODO: focus-player tracking not yet implemented in the Gemini cascade —
    // the UI input is hidden until this produces a real report.
    playerReport: null,
    strategicAdjustments: synthesis.strategicAdjustments,
    rankedObservations:   synthesis.rankedObservations,
    computedStats,
    chunkErrors,
  }
}

// Keep parseEvents exported-adjacent (used by tests / downstream if any)
export { parseEvents }
