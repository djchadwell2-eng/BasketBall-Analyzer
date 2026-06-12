// Accuracy eval harness CLI.
//
//   npm run eval -- --labels eval/labels/game1.csv --video "C:\path\to\game1.mp4"
//   npm run eval -- --labels eval/labels/game1.csv --analysis eval/results/game1.analysis.json
//
// The first run on a video calls Gemini (costs tokens) and caches the full
// AnalysisResult at eval/results/<video-name>.analysis.json. Every run after
// that scores from the cache for free. Pass --fresh to force re-analysis.

import * as fs from 'fs'
import * as path from 'path'
import { parseLabelsCsv, parseTimestamp, scoreAnalysis, toPredicted, formatReport } from './scorer'
import type { PossessionResult } from '../lib/types'

const RESULTS_DIR = path.join(__dirname, 'results')

/** Loads .env.local into process.env (tsx doesn't do this like Next.js does). Never logs values. */
function loadEnvLocal(): void {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null
}

async function main(): Promise<void> {
  const labelsPath = getArg('labels')
  const videoPath = getArg('video')
  const analysisPath = getArg('analysis')
  const offsetArg = getArg('offset')
  const fresh = process.argv.includes('--fresh')

  if (!labelsPath || (!videoPath && !analysisPath)) {
    console.log('Usage:')
    console.log('  npm run eval -- --labels <labels.csv> --video <game.mp4>      analyze (cached) then score')
    console.log('  npm run eval -- --labels <labels.csv> --analysis <result.json> score a saved analysis')
    console.log('  add --fresh to force a new Gemini analysis even if a cache exists')
    console.log('  add --offset <m:ss> if labels were timed against a longer source video:')
    console.log('    the offset (where your clip starts in that source) is subtracted from every label')
    process.exit(1)
  }

  if (!fs.existsSync(labelsPath)) throw new Error(`Labels file not found: ${labelsPath}`)
  let truth = parseLabelsCsv(fs.readFileSync(labelsPath, 'utf8'))
  console.log(`[eval] loaded ${truth.length} ground-truth possessions from ${labelsPath}`)

  // Shift labels timed against a longer source video into clip-relative time
  if (offsetArg) {
    const offset = parseTimestamp(offsetArg)
    const before = truth.length
    truth = truth
      .map(t => ({ ...t, start: t.start - offset, end: t.end - offset }))
      .filter(t => t.end > 0)
    truth.forEach(t => { if (t.start < 0) t.start = 0 })
    console.log(`[eval] applied offset -${offsetArg}: labels now span ${truth[0]?.start.toFixed(0)}s-${truth[truth.length - 1]?.end.toFixed(0)}s` +
      (before !== truth.length ? ` (${before - truth.length} row(s) fell before the clip start and were dropped)` : ''))
  }

  // --- Get an analysis: from --analysis, from cache, or by running Gemini ---
  let possessions: PossessionResult[]
  let analysisSource: string

  if (analysisPath) {
    if (!fs.existsSync(analysisPath)) throw new Error(`Analysis file not found: ${analysisPath}`)
    possessions = (JSON.parse(fs.readFileSync(analysisPath, 'utf8')) as { possessions: PossessionResult[] }).possessions
    analysisSource = analysisPath
  } else {
    if (!fs.existsSync(videoPath!)) throw new Error(`Video file not found: ${videoPath}`)
    const videoName = path.basename(videoPath!, path.extname(videoPath!))
    const cachePath = path.join(RESULTS_DIR, `${videoName}.analysis.json`)

    if (!fresh && fs.existsSync(cachePath)) {
      console.log(`[eval] using cached analysis: ${cachePath} (pass --fresh to re-analyze)`)
      possessions = (JSON.parse(fs.readFileSync(cachePath, 'utf8')) as { possessions: PossessionResult[] }).possessions
    } else {
      loadEnvLocal()
      console.log(`[eval] running Gemini analysis on ${videoPath} — this calls the API and takes a while...`)
      const { analyzeVideoWithGemini } = await import('../lib/analyzers/gemini-video-analyzer')
      const analysis = await analyzeVideoWithGemini(videoPath!)
      fs.mkdirSync(RESULTS_DIR, { recursive: true })
      fs.writeFileSync(cachePath, JSON.stringify(analysis, null, 2))
      console.log(`[eval] analysis cached at ${cachePath}`)
      if (analysis.chunkErrors.length > 0) {
        console.warn(`[eval] WARNING: ${analysis.chunkErrors.length} chunk(s) failed during analysis — scores will be unfairly low:`)
        for (const e of analysis.chunkErrors) console.warn(`  chunk ${e.chunkIndex} @ ${e.startOffset}s: ${e.error}`)
      }
      possessions = analysis.possessions
    }
    analysisSource = cachePath
  }

  // --- Score and report ---
  const report = scoreAnalysis(truth, toPredicted(possessions))
  console.log('')
  console.log(formatReport(report))

  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  const labelsName = path.basename(labelsPath, path.extname(labelsPath))
  const reportPath = path.join(RESULTS_DIR, `${labelsName}.report.json`)
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    labelsFile: labelsPath,
    analysisFile: analysisSource,
    ...report,
  }, null, 2))
  console.log(`[eval] full report saved to ${reportPath}`)
}

main().catch(err => {
  console.error(`[eval] FAILED: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
