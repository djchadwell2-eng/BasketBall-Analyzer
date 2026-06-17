// Cheap outcome bench — iterate on the deep-pass prompt/resolution for ~$0.50
// instead of re-analyzing a whole game (~$10).
//
//   npm run bench -- --labels eval/labels/game1.csv --video eval/videos/game1.mp4 [--n 12] [--offset 9:08] [--fresh]
//
// It extracts clips for a small sample of your labeled possessions ONCE
// (cached in eval/clips/, free to reuse), then runs each through the real
// deep pass and scores outcome accuracy against your labels. Change the
// prompt/resolution and re-run: you only pay for the ~N Gemini calls.

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { parseLabelsCsv, parseTimestamp, type GroundTruthPossession } from './scorer'

const execFileAsync = promisify(execFile)
const CLIPS_DIR = path.join(__dirname, 'clips')

// Gemini 3.5 Flash standard pricing (USD per token)
const INPUT_PER_TOKEN = 1.5 / 1_000_000
const OUTPUT_PER_TOKEN = 9.0 / 1_000_000

// Only these are visually gradeable as a make/miss-type outcome
const GRADEABLE = new Set(['made', 'missed', 'turnover', 'defensive-stop'])

function getArg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

function loadEnvLocal(): void {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}

/** Evenly sample up to n items across the array. */
function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr
  const step = arr.length / n
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)])
}

/** Same window + resolution the real deep pass uses (start-2s .. end+9s, 480p). */
async function extractClip(video: string, start: number, end: number, out: string): Promise<void> {
  const clipStart = Math.max(0, start - 2)
  const dur = (end + 9) - clipStart
  await execFileAsync('ffmpeg', [
    '-y', '-ss', clipStart.toFixed(2), '-t', dur.toFixed(2), '-i', video,
    '-vf', "scale=-2:480", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out,
  ], { maxBuffer: 10 * 1024 * 1024 })
}

const norm = (o: string) => o.trim().toLowerCase().replace(/_/g, '-')
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

async function main() {
  const labelsPath = getArg('labels')
  const videoPath = getArg('video')
  const n = parseInt(getArg('n') ?? '12', 10)
  const offsetArg = getArg('offset')
  const fresh = process.argv.includes('--fresh')

  if (!labelsPath || !videoPath) {
    console.log('Usage: npm run bench -- --labels <csv> --video <mp4> [--n 12] [--offset m:ss] [--fresh]')
    process.exit(1)
  }
  loadEnvLocal()

  let truth = parseLabelsCsv(fs.readFileSync(labelsPath, 'utf8'))
  if (offsetArg) {
    const off = parseTimestamp(offsetArg)
    truth = truth.map(t => ({ ...t, start: t.start - off, end: t.end - off })).filter(t => t.end > 0)
    truth.forEach(t => { if (t.start < 0) t.start = 0 })
  }

  const gradeable = truth.filter(t => GRADEABLE.has(t.outcome))
  const chosen = sample(gradeable, n)
  console.log(`[bench] ${gradeable.length} gradeable possessions in labels; testing ${chosen.length}`)

  fs.mkdirSync(CLIPS_DIR, { recursive: true })
  const labelsBase = path.basename(labelsPath, path.extname(labelsPath))
  const { analyzeClipForOutcome, extractScoreboardCrops } = await import('../lib/analyzers/gemini-video-analyzer')

  type Row = { p: GroundTruthPossession; predicted: string; raw: string; conf: number }
  const rows: Row[] = []
  let promptTokens = 0
  let outputTokens = 0

  let thinkingTokens = 0
  let truncated = 0

  for (const p of chosen) {
    const clip = path.join(CLIPS_DIR, `${labelsBase}_p${p.possession}.mp4`)
    if (fresh || !fs.existsSync(clip)) await extractClip(videoPath, p.start, p.end, clip)
    const crops = await extractScoreboardCrops(videoPath, p.start, p.end)
    const r = await analyzeClipForOutcome(clip, p.start, p.end, null, crops)
    promptTokens += r.promptTokens
    outputTokens += r.outputTokens
    thinkingTokens += r.thinkingTokens
    // A clipped answer = JSON didn't parse OR the model hit the output cap.
    const clipped = !r.parsedOk || r.finishReason === 'MAX_TOKENS'
    if (clipped) truncated++
    rows.push({ p, predicted: r.outcome, raw: r.rawOutcome, conf: r.confidence })
    const flags = `${r.parsedOk ? '' : ' PARSE-FAIL!'}${r.finishReason === 'MAX_TOKENS' ? ' MAX_TOKENS!' : ''}`
    console.log(
      `\n  #${p.possession} ${fmt(p.start)}  truth=${p.outcome}  predicted=${r.outcome}` +
      `${norm(r.rawOutcome) !== norm(r.outcome) ? ` (model said "${r.rawOutcome}")` : ''}` +
      `  conf=${r.confidence.toFixed(2)}  think=${r.thinkingTokens} out=${r.outputTokens} finish=${r.finishReason}${flags}`
    )
    if (r.whatHappened) console.log(`     what_happened: ${r.whatHappened}`)
    if (r.coachingPoint) console.log(`     coaching_point: ${r.coachingPoint}`)
  }

  const correct = rows.filter(r => norm(r.predicted) === norm(r.p.outcome)).length
  const unknown = rows.filter(r => r.predicted === 'unknown').length
  const cost = promptTokens * INPUT_PER_TOKEN + outputTokens * OUTPUT_PER_TOKEN

  // confusion
  const confusion: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    const t = norm(r.p.outcome), pr = norm(r.predicted)
    confusion[t] = confusion[t] ?? {}
    confusion[t][pr] = (confusion[t][pr] ?? 0) + 1
  }

  console.log('\n=== OUTCOME BENCH ===')
  console.log(`accuracy: ${rows.length ? ((correct / rows.length) * 100).toFixed(0) : 0}% (${correct}/${rows.length})   predicted "unknown": ${unknown}`)
  for (const t of Object.keys(confusion).sort()) {
    console.log(`  truth ${t.padEnd(14)} -> ${Object.entries(confusion[t]).map(([k, v]) => `${k}=${v}`).join('  ')}`)
  }
  const denom = rows.length || 1
  console.log(`\ntokens: ${promptTokens} in + ${outputTokens} out (of which ${thinkingTokens} thinking)   est. cost this run: $${cost.toFixed(2)}`)
  console.log(`per-possession avg: think=${Math.round(thinkingTokens / denom)}  out=${Math.round(outputTokens / denom)}`)
  console.log(`clipped answers (parse-fail or MAX_TOKENS): ${truncated}/${rows.length}`)
  console.log(`(clips cached in eval/clips/ — re-runs only pay for the Gemini calls)`)
}

main().catch(e => { console.error('[bench] FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
