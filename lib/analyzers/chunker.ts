import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export const DEFAULT_CHUNK_DURATION = 300 // 5 minutes in seconds
const DEFAULT_FPS = 1

export interface VideoChunk {
  path: string
  startOffset: number // seconds from start of original video
  duration: number    // seconds, actual duration of this chunk
  index: number
}

function getVideoDurationSeconds(inputPath: string): number {
  const raw = execFileSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', inputPath,
  ], { encoding: 'utf8' })
  const data = JSON.parse(raw) as { streams?: { codec_type: string; duration?: string }[] }
  const videoStream = data.streams?.find(s => s.codec_type === 'video')
  const duration = parseFloat(videoStream?.duration ?? '0')
  if (!duration || isNaN(duration)) {
    throw new Error(`[chunker] Could not determine video duration from: ${inputPath}`)
  }
  return duration
}

// Pure function — exported for unit testing without ffmpeg
export function computeChunkSegments(
  durationSeconds: number,
  chunkDuration = DEFAULT_CHUNK_DURATION
): Array<{ startOffset: number; duration: number }> {
  const segments: Array<{ startOffset: number; duration: number }> = []
  let offset = 0
  while (offset < durationSeconds) {
    const remaining = durationSeconds - offset
    const dur = Math.min(chunkDuration, remaining)
    segments.push({ startOffset: offset, duration: dur })
    offset += dur
  }
  return segments
}

export function chunkVideo(
  inputPath: string,
  chunkDuration = DEFAULT_CHUNK_DURATION,
  fps = DEFAULT_FPS
): VideoChunk[] {
  const durationSeconds = getVideoDurationSeconds(inputPath)
  const segments = computeChunkSegments(durationSeconds, chunkDuration)
  const sessionId = `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const created: VideoChunk[] = []
  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const outPath = path.join(os.tmpdir(), `${sessionId}_chunk_${i}.mp4`)
      execFileSync('ffmpeg', [
        '-y', '-ss', String(seg.startOffset), '-i', inputPath,
        '-t', String(seg.duration), '-vf', `fps=${fps}`,
        '-an', '-c:v', 'libx264', '-preset', 'ultrafast', outPath,
      ], { stdio: 'pipe' })
      console.log(
        `[chunker] chunk ${i + 1}/${segments.length} written: ${outPath}` +
        ` (${seg.startOffset}s–${seg.startOffset + seg.duration}s)`
      )
      created.push({ path: outPath, startOffset: seg.startOffset, duration: seg.duration, index: i })
    }
    return created
  } catch (err) {
    for (const c of created) { try { fs.unlinkSync(c.path) } catch {} }
    throw err
  }
}
