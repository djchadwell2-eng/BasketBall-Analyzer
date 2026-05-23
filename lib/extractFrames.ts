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

const SEQUENCES = 3
const FRAMES_PER_SEQUENCE = 4
const SEQUENCE_STEP = 0.5          // seconds between frames within a sequence
const TOTAL_FRAMES_CAP = 15        // hard cap — 3 × 4 = 12, well within limit

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
  score: number
}

// Pass 1: cheap low-res scan — outputs raw grayscale pixels, no AI, no image library
function scoreMotionPerSecond(inputPath: string): MotionScore[] {
  const cmd = `ffmpeg -i "${inputPath}" -vf "fps=1,scale=${MOTION_WIDTH}:${MOTION_HEIGHT}" -pix_fmt gray -f rawvideo pipe:1`
  const raw = execSync(cmd, { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 })

  const totalFrames = Math.floor(raw.length / FRAME_BYTES)
  const scores: MotionScore[] = []

  for (let i = 1; i < totalFrames; i++) {
    const prev = raw.subarray((i - 1) * FRAME_BYTES, i * FRAME_BYTES)
    const curr = raw.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES)

    let diff = 0
    for (let j = 0; j < FRAME_BYTES; j++) {
      diff += Math.abs(curr[j] - prev[j])
    }

    scores.push({
      timestamp: i,                  // 1 fps → frame index equals second in video
      score: diff / FRAME_BYTES,     // avg absolute pixel difference, 0–255 scale
    })
  }

  return scores
}

// Pick top N peaks, then generate a sequence of timestamps centered around each peak
function selectBestSequences(
  scores: MotionScore[],
  sequenceCount: number,
  framesPerSeq: number,
  step: number,
  duration: number
): number[][] {
  const minSpacing = duration / (sequenceCount + 1)
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const peaks: number[] = []

  for (const { timestamp } of sorted) {
    if (peaks.length >= sequenceCount) break
    const tooClose = peaks.some((t) => Math.abs(t - timestamp) < minSpacing)
    if (!tooClose) peaks.push(timestamp)
  }

  // Fallback: fill remaining peaks with evenly spaced positions
  if (peaks.length < sequenceCount) {
    for (const p of [0.2, 0.5, 0.8]) {
      if (peaks.length >= sequenceCount) break
      const ts = p * duration
      const tooClose = peaks.some((t) => Math.abs(t - ts) < 1)
      if (!tooClose) peaks.push(ts)
    }
  }

  // Generate 4 timestamps centered around each peak, clamped to valid range
  const halfSpan = ((framesPerSeq - 1) * step) / 2   // = 0.75s for 4 frames at 0.5s step
  return peaks.sort((a, b) => a - b).map((peak) =>
    Array.from({ length: framesPerSeq }, (_, i) => {
      const raw = peak - halfSpan + i * step
      return parseFloat(Math.min(Math.max(raw, 0.1), duration - 0.1).toFixed(3))
    })
  )
}

// Pass 2: extract full-resolution frames at selected sequence timestamps
export function extractFrames(inputPath: string): ExtractedFrame[] {
  const duration = getVideoDuration(inputPath)

  const motionScores = scoreMotionPerSecond(inputPath)
  const sequences = selectBestSequences(
    motionScores, SEQUENCES, FRAMES_PER_SEQUENCE, SEQUENCE_STEP, duration
  )

  // Hard cap: enforce before any extraction
  const totalFrames = sequences.reduce((sum, seq) => sum + seq.length, 0)
  if (totalFrames > TOTAL_FRAMES_CAP) {
    throw new Error(`Frame count ${totalFrames} exceeds hard cap of ${TOTAL_FRAMES_CAP}.`)
  }

  const sessionId = `bball_${Date.now()}`
  const frames: ExtractedFrame[] = []
  const outputPaths: string[] = []
  let globalIndex = 0

  for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
    for (const ts of sequences[seqIdx]) {
      const outPath = path.join(os.tmpdir(), `${sessionId}_s${seqIdx}_f${globalIndex}.jpg`)
      outputPaths.push(outPath)

      // -ss before -i = fast keyframe seek; -frames:v 1 = single frame; -q:v 2 = high quality JPEG
      const cmd = `ffmpeg -y -ss ${ts} -i "${inputPath}" -frames:v 1 -q:v 2 "${outPath}"`
      execSync(cmd, { stdio: 'pipe' })

      const buffer = fs.readFileSync(outPath)
      frames.push({ base64: buffer.toString('base64'), timestamp: ts, index: globalIndex, sequenceIndex: seqIdx })
      globalIndex++
    }
  }

  for (const p of outputPaths) {
    try { fs.unlinkSync(p) } catch {}
  }

  return frames
}

export function cleanupTempFile(filePath: string): void {
  try { fs.unlinkSync(filePath) } catch {}
}
