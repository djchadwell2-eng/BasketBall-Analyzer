// Cheap wide-pass-only inspector — see possession counts + gameplay_ranges
// WITHOUT paying for the deep pass.
//
//   npm run inspect:wide -- --video eval/videos/game1.mp4 [--team white]
//
// Cost = the wide pass only (~$0.07 per 5-min chunk → ~$1.20 for a full game,
// cents for a clip). Use it to judge whether gameplay_ranges are clean enough
// to filter on before building the bigger non-gameplay drop.

import * as fs from 'fs'
import * as path from 'path'

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

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

async function main() {
  const videoPath = getArg('video')
  const team = getArg('team')
  if (!videoPath) {
    console.log('Usage: npm run inspect:wide -- --video <mp4> [--team <jersey color>]')
    process.exit(1)
  }
  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`)
  loadEnvLocal()

  const { inspectWidePass } = await import('../lib/analyzers/gemini-video-analyzer')
  const focusTeam = team ? { jerseyColor: team } : null

  console.log(`[inspect] running WIDE PASS ONLY on ${videoPath}${team ? ` (team: ${team})` : ''}...`)
  const r = await inspectWidePass(videoPath, focusTeam)

  console.log('\n=== POSSESSION COUNTS ===')
  console.log(`  raw (wide pass):        ${r.rawCount}`)
  console.log(`  after merge:            ${r.mergedCount}`)
  console.log(`  after <3s filter:       ${r.keptCount}   (would hit the deep pass)`)
  console.log(`  dropped as too short:   ${r.droppedShort.length}`)
  for (const d of r.droppedShort) {
    console.log(`     - #${d.possessionId} ${(d.endTs - d.startTs).toFixed(1)}s @ ${fmt(d.startTs)} (${d.possessionType})`)
  }

  console.log('\n=== GAMEPLAY_RANGES (quality check) ===')
  if (r.gameplayRanges.length === 0) {
    console.log('  none returned — the model is not producing gameplay_ranges; range-based filtering is NOT viable.')
  } else {
    const covered = r.gameplayRanges.reduce((s, rg) => s + (rg.end - rg.start), 0)
    const pct = r.videoDuration > 0 ? (covered / r.videoDuration) * 100 : 0
    console.log(`  ${r.gameplayRanges.length} range(s); cover ${covered.toFixed(0)}s of ${r.videoDuration.toFixed(0)}s video (${pct.toFixed(0)}%)`)
    for (const rg of r.gameplayRanges) console.log(`     - ${fmt(rg.start)} → ${fmt(rg.end)}  (${(rg.end - rg.start).toFixed(0)}s)`)
    console.log('\n  How to read this:')
    console.log('   • ~100% coverage in one giant range  -> model is NOT carving out dead time; not useful to filter on.')
    console.log('   • <100% across several ranges that line up with real stoppages -> useful; green light for a range filter.')
  }

  if (r.chunkErrors.length > 0) {
    console.log(`\nWARNING: ${r.chunkErrors.length} chunk(s) failed — counts/ranges are partial.`)
  }
}

main().catch(e => { console.error('[inspect] FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
