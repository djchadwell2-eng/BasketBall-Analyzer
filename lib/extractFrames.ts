import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface ExtractedFrame {
  base64: string
  timestamp: number
  index: number
  sequenceIndex: number
}

// Tiny resolution for the motion scan pass — fast, no image lib needed
const MOTION_WIDTH = 32
const MOTION_HEIGHT = 18
const FRAME_BYTES = MOTION_WIDTH * MOTION_HEIGHT  // 576 bytes per grayscale frame

// Grid for court-activity detection (4×3 = 12 cells of 8×6 pixels)
const GRID_COLS = 4
const GRID_ROWS = 3
const CELL_W = MOTION_WIDTH / GRID_COLS   // 8 pixels
const CELL_H = MOTION_HEIGHT / GRID_ROWS  // 6 pixels

const MAX_SEQUENCES = 8                                       // max for full-game uploads
const FRAMES_PER_SEQUENCE = 4
const SEQUENCE_STEP = 0.5                                     // seconds between frames within a sequence
const TOTAL_FRAMES_CAP = MAX_SEQUENCES * FRAMES_PER_SEQUENCE  // 32 hard cap

// 1 sequence per 3 minutes of video, capped at MAX_SEQUENCES, min 3
function getNumSequences(durationSeconds: number): number {
  return Math.max(3, Math.min(MAX_SEQUENCES, Math.ceil(durationSeconds / 180)))
}

function getVideoDuration(inputPath: string): number {
  const cmd = `ffprobe -v quiet -print_format json -show_streams "${inputPath}"`
  const raw = execSync(cmd, { encoding: 'utf8' })
  const data = JSON.parse(raw)
  const videoStream = data.streams?.find(
    (s: { codec_type: string; duration?: string }) => s.codec_type === 'video'
  )
  const duration = parseFloat(videoStream?.duration ?? '0')
  if (!duration || isNaN(duration)) {
    throw new Error('Could not determine video duration. Ensure ffprobe is installed and in PATH.')
  }
  return duration
}

interface MotionScore {
  timestamp: number
  score: number               // mean pixel diff across full frame (0–255 scale)
  activeCells: number         // how many of 12 grid cells have meaningful motion (≥2.5 diff)
  brightnessStability: number // 0–1: 1 = stable brightness, 0 = large jump (flash/lighting change)
}

// Pass 1: cheap low-res scan — outputs raw grayscale pixels, no AI, no image library
function scoreMotionPerSecond(inputPath: string): MotionScore[] {
  const cmd = `ffmpeg -i "${inputPath}" -vf "fps=1,scale=${MOTION_WIDTH}:${MOTION_HEIGHT}" -pix_fmt gray -f rawvideo pipe:1`
  const raw = execSync(cmd, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 })

  const totalFrames = Math.floor(raw.length / FRAME_BYTES)
  const scores: MotionScore[] = []

  // Initialize brightness tracking from first frame
  let prevBrightness = 0
  if (totalFrames > 0) {
    const firstFrame = raw.subarray(0, FRAME_BYTES)
    for (let j = 0; j < FRAME_BYTES; j++) prevBrightness += firstFrame[j]
    prevBrightness /= FRAME_BYTES
  }

  for (let i = 1; i < totalFrames; i++) {
    const prev = raw.subarray((i - 1) * FRAME_BYTES, i * FRAME_BYTES)
    const curr = raw.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES)

    // Per-cell diff accumulation (4×3 grid = 12 cells)
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

    // Normalize per-cell diffs by cell area (8×6 = 48 pixels)
    const cellArea = CELL_W * CELL_H
    const cellDiffs = cellDiffSums.map(s => s / cellArea)

    // activeCells: number of cells with meaningful motion (threshold ≥2.5)
    // Timeouts/dead ball → 0–1 active cells; active play → 4–10+ active cells
    const activeCells = cellDiffs.filter(d => d >= 2.5).length

    // Brightness stability: penalize large brightness jumps (lighting changes, flashes)
    currBrightness /= FRAME_BYTES
    const brightnessDelta = Math.abs(currBrightness - prevBrightness)
    const brightnessStability = Math.max(0, 1 - brightnessDelta / 40)
    prevBrightness = currBrightness

    scores.push({
      timestamp: i,
      score: totalDiff / FRAME_BYTES,
      activeCells,
      brightnessStability,
    })
  }

  return scores
}

// Multi-signal possession quality score:
// - Hard floor at score<3 eliminates timeouts and dead-ball moments
// - activeCells rewards motion spread across multiple court areas (real gameplay)
// - Single-cell motion (free throws) scores much lower than multi-cell (drives, fast breaks)
function computePossessionQuality(ms: MotionScore): number {
  if (ms.score < 3) return 0                             // hard floor: rejects timeouts/dead ball
  const motionBase = Math.min(1, ms.score / 20)          // normalize raw motion
  const courtActivity = Math.min(1, ms.activeCells / 4)  // 4+ active cells = full score
  return motionBase * courtActivity * ms.brightnessStability
}

// Temporal smoothing: single-second spikes (camera cuts/flashes) get averaged with neighbors
function smoothQualityScores(scores: MotionScore[]): number[] {
  const raw = scores.map(computePossessionQuality)
  return raw.map((q, i) => {
    const prev = raw[i - 1] ?? q
    const next = raw[i + 1] ?? q
    return (prev + q * 2 + next) / 4
  })
}

// Segment-based selection: divide video into numSeqs equal segments,
// pick the highest-quality timestamp within each segment.
// Guarantees proportional coverage across the full video duration.
function selectBestSequences(
  scores: MotionScore[],
  numSeqs: number,
  framesPerSeq: number,
  step: number,
  duration: number
): number[][] {
  const qualityScores = smoothQualityScores(scores)
  const useQuality = qualityScores.some(q => q > 0)  // fallback to raw score if all zero

  const segmentDuration = duration / numSeqs
  const halfSpan = ((framesPerSeq - 1) * step) / 2   // 0.75s for 4 frames at 0.5s step

  const anchorTimestamps: number[] = []

  for (let seg = 0; seg < numSeqs; seg++) {
    const segStart = seg * segmentDuration
    const segEnd = (seg + 1) * segmentDuration
    const midpoint = (segStart + segEnd) / 2

    let bestTs = midpoint
    let bestScore = -1
    let bestDebugMs: MotionScore | null = null
    let bestDebugQ = 0

    for (let j = 0; j < scores.length; j++) {
      const { timestamp } = scores[j]
      if (timestamp >= segStart && timestamp < segEnd) {
        const q = useQuality ? qualityScores[j] : scores[j].score
        if (q > bestScore) {
          bestScore = q
          bestTs = timestamp
          bestDebugMs = scores[j]
          bestDebugQ = q
        }
      }
    }

    anchorTimestamps.push(bestTs)

    // Debug log: shows why each anchor was selected
    if (bestDebugMs) {
      console.log(
        `[possession] seg ${seg + 1}/${numSeqs} → anchor=${bestTs.toFixed(1)}s` +
        ` | quality=${bestDebugQ.toFixed(3)}` +
        ` | score=${bestDebugMs.score.toFixed(1)}` +
        ` | cells=${bestDebugMs.activeCells}/12` +
        ` | brightness=${bestDebugMs.brightnessStability.toFixed(2)}`
      )
    }
  }

  // Generate framesPerSeq timestamps centered around each anchor, clamped to valid range
  return anchorTimestamps.map((anchor) =>
    Array.from({ length: framesPerSeq }, (_, i) => {
      const raw = anchor - halfSpan + i * step
      return parseFloat(Math.min(Math.max(raw, 0.1), duration - 0.1).toFixed(3))
    })
  )
}

// Pass 2: extract full-resolution frames at selected sequence timestamps
export function extractFrames(inputPath: string, onProgress?: (pct: number, message: string) => void): { frames: ExtractedFrame[], durationSeconds: number } {
  const durationSeconds = getVideoDuration(inputPath)
  onProgress?.(8, 'Video probed')
  const numSeqs = getNumSequences(durationSeconds)

  onProgress?.(10, 'Scanning for motion...')
  const motionScores = scoreMotionPerSecond(inputPath)
  const sequences = selectBestSequences(
    motionScores, numSeqs, FRAMES_PER_SEQUENCE, SEQUENCE_STEP, durationSeconds
  )

  // Hard cap: enforce before any extraction
  const totalFrames = sequences.reduce((sum, seq) => sum + seq.length, 0)
  if (totalFrames > TOTAL_FRAMES_CAP) {
    throw new Error(`Frame count ${totalFrames} exceeds hard cap of ${TOTAL_FRAMES_CAP}.`)
  }
  onProgress?.(28, 'Key moments selected, extracting frames...')

  const sessionId = `bball_${Date.now()}`
  const frames: ExtractedFrame[] = []
  const outputPaths: string[] = []
  let globalIndex = 0

  for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
    for (const ts of sequences[seqIdx]) {
      const outPath = path.join(os.tmpdir(), `${sessionId}_s${seqIdx}_f${globalIndex}.jpg`)
      outputPaths.push(outPath)

      // -ss before -i = fast keyframe seek; scale to 512px wide (matches OpenAI detail:low max); -q:v 5 = good quality, small file
      const cmd = `ffmpeg -y -ss ${ts} -i "${inputPath}" -frames:v 1 -vf "scale=512:-2" -q:v 5 "${outPath}"`
      execSync(cmd, { stdio: 'pipe' })

      const buffer = fs.readFileSync(outPath)
      frames.push({ base64: buffer.toString('base64'), timestamp: ts, index: globalIndex, sequenceIndex: seqIdx })
      onProgress?.(28 + Math.round(((globalIndex + 1) / totalFrames) * 30), `Extracting frame ${globalIndex + 1}/${totalFrames}...`)
      globalIndex++
    }
  }

  for (const p of outputPaths) {
    try { fs.unlinkSync(p) } catch {}
  }
  onProgress?.(58, 'Frames ready, sending to AI...')

  return { frames, durationSeconds }
}

export function cleanupTempFile(filePath: string): void {
  try { fs.unlinkSync(filePath) } catch {}
}
