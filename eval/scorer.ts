// Pure scoring logic for the accuracy eval harness.
// No I/O here — everything takes parsed data in and returns numbers out,
// so it can be unit-tested without ffmpeg, Gemini, or real footage.

import type { PossessionResult } from '../lib/types'

// ---------------------------------------------------------------------------
// Ground truth types + CSV parsing
// ---------------------------------------------------------------------------

/** Outcomes the analyzer can express — only these are scored for accuracy. */
const COMPARABLE_OUTCOMES = new Set(['made', 'missed', 'turnover', 'defensive-stop'])

/** Truth-only outcomes: counted for detection but excluded from outcome accuracy. */
const TRUTH_ONLY_OUTCOMES = new Set(['foul', 'other', ''])

export interface GroundTruthPossession {
  /** Row label from the CSV, e.g. 1, 2, 3... */
  possession: number
  /** Seconds from the start of the video file. */
  start: number
  end: number
  /** Normalized: made | missed | turnover | defensive-stop | foul | other | '' */
  outcome: string
  /** 2 or 3 when the label was made-2/made-3; null otherwise. Reserved for future stats eval. */
  pointsScored: number | null
  /** Normalized possession type ('' when the labeler left it blank). */
  possessionType: string
  notes: string
}

/** "1:23" -> 83, "1:02:03" -> 3723, "83" / "83.5" -> seconds as-is. */
export function parseTimestamp(raw: string): number {
  const text = raw.trim()
  if (text === '') throw new Error('empty timestamp')
  const parts = text.split(':').map(p => p.trim())
  if (parts.some(p => p === '' || Number.isNaN(Number(p)))) {
    throw new Error(`unparseable timestamp: "${raw}"`)
  }
  return parts.reduce((total, part) => total * 60 + Number(part), 0)
}

/**
 * Accepts the spellings a human labeler will plausibly type and maps them onto
 * the analyzer's vocabulary. "made-2"/"made 3"/"made_2" keep their point value.
 */
export function normalizeOutcome(raw: string): { outcome: string; pointsScored: number | null } {
  const text = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (text === '') return { outcome: '', pointsScored: null }

  const madeMatch = text.match(/^(made|make)-?([23])?$/)
  if (madeMatch) return { outcome: 'made', pointsScored: madeMatch[2] ? Number(madeMatch[2]) : null }

  const missMatch = text.match(/^(missed|miss)-?([23])?$/)
  if (missMatch) return { outcome: 'missed', pointsScored: null }

  if (text === 'turnover' || text === 'to' || text === 'steal') return { outcome: 'turnover', pointsScored: null }
  if (text === 'defensive-stop' || text === 'stop' || text === 'defstop') return { outcome: 'defensive-stop', pointsScored: null }
  if (text === 'foul' || text === 'fouled' || text === 'free-throws' || text === 'fts') return { outcome: 'foul', pointsScored: null }

  return { outcome: 'other', pointsScored: null }
}

/** "half court" / "Half-Court" -> "half_court" to match the analyzer's enum. */
export function normalizePossessionType(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/** Minimal CSV row splitter that honors double-quoted fields (notes may contain commas). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else current += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current); current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/**
 * Parses a labels CSV. Header row is required; column order doesn't matter.
 * Recognized headers: possession, start, end, outcome, type, notes.
 */
export function parseLabelsCsv(csvText: string): GroundTruthPossession[] {
  const lines = csvText.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) throw new Error('Labels CSV needs a header row and at least one possession row.')

  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const col = (name: string) => headers.indexOf(name)
  for (const required of ['possession', 'start', 'end', 'outcome']) {
    if (col(required) === -1) throw new Error(`Labels CSV is missing required column "${required}". Found: ${headers.join(', ')}`)
  }

  const rows: GroundTruthPossession[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    const get = (name: string) => (col(name) >= 0 ? (fields[col(name)] ?? '').trim() : '')
    try {
      const { outcome, pointsScored } = normalizeOutcome(get('outcome'))
      const start = parseTimestamp(get('start'))
      const end = parseTimestamp(get('end'))
      if (end <= start) throw new Error(`end (${get('end')}) must be after start (${get('start')})`)
      rows.push({
        possession: Number(get('possession')) || rows.length + 1,
        start,
        end,
        outcome,
        pointsScored,
        possessionType: normalizePossessionType(get('type')),
        notes: get('notes'),
      })
    } catch (err) {
      throw new Error(`Labels CSV row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return rows.sort((a, b) => a.start - b.start)
}

// ---------------------------------------------------------------------------
// Matching + metrics
// ---------------------------------------------------------------------------

/** The slice of the analyzer's output the scorer needs. */
export interface PredictedPossession {
  possessionId: number
  startTimestamp: number
  endTimestamp: number
  outcome: string
  possessionType: string
}

export function toPredicted(possessions: PossessionResult[]): PredictedPossession[] {
  return possessions.map(p => ({
    possessionId: p.possessionId,
    startTimestamp: p.startTimestamp,
    endTimestamp: p.endTimestamp,
    outcome: p.outcome,
    possessionType: p.possessionType,
  }))
}

export interface MatchedPair {
  truth: GroundTruthPossession
  predicted: PredictedPossession
  overlapSec: number
  iou: number
}

function overlapSeconds(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

/**
 * Greedy one-to-one matching by overlap. A pair qualifies when its IoU is at
 * least 0.2 OR the overlap covers at least half of the shorter interval —
 * lenient on purpose, since boundary drift is scored separately.
 */
export function matchPossessions(
  truth: GroundTruthPossession[],
  predicted: PredictedPossession[]
): { matches: MatchedPair[]; unmatchedTruth: GroundTruthPossession[]; unmatchedPredicted: PredictedPossession[] } {
  const candidates: MatchedPair[] = []
  for (const t of truth) {
    for (const p of predicted) {
      const overlap = overlapSeconds(t.start, t.end, p.startTimestamp, p.endTimestamp)
      if (overlap <= 0) continue
      const union = Math.max(t.end, p.endTimestamp) - Math.min(t.start, p.startTimestamp)
      const iou = union > 0 ? overlap / union : 0
      const shorter = Math.min(t.end - t.start, p.endTimestamp - p.startTimestamp)
      if (iou >= 0.2 || (shorter > 0 && overlap / shorter >= 0.5)) {
        candidates.push({ truth: t, predicted: p, overlapSec: overlap, iou })
      }
    }
  }
  candidates.sort((a, b) => b.overlapSec - a.overlapSec)

  const matches: MatchedPair[] = []
  const usedTruth = new Set<GroundTruthPossession>()
  const usedPredicted = new Set<PredictedPossession>()
  for (const c of candidates) {
    if (usedTruth.has(c.truth) || usedPredicted.has(c.predicted)) continue
    usedTruth.add(c.truth)
    usedPredicted.add(c.predicted)
    matches.push(c)
  }
  return {
    matches,
    unmatchedTruth: truth.filter(t => !usedTruth.has(t)),
    unmatchedPredicted: predicted.filter(p => !usedPredicted.has(p)),
  }
}

export interface EvalReport {
  detection: {
    truthCount: number
    predictedCount: number
    matched: number
    precision: number
    recall: number
    f1: number
  }
  boundaries: {
    meanStartErrorSec: number
    meanEndErrorSec: number
    pctStartsWithin3s: number
  }
  outcomes: {
    comparable: number
    correct: number
    accuracy: number
    predictedUnknown: number
    /** confusion[truthOutcome][predictedOutcome] = count */
    confusion: Record<string, Record<string, number>>
  }
  possessionTypes: {
    comparable: number
    correct: number
    accuracy: number
  }
  misses: Array<{ possession: number; start: number; end: number; outcome: string }>
  hallucinations: Array<{ possessionId: number; start: number; end: number; outcome: string }>
  outcomeMistakes: Array<{ possession: number; start: number; truthOutcome: string; predictedOutcome: string }>
}

export function scoreAnalysis(truth: GroundTruthPossession[], predicted: PredictedPossession[]): EvalReport {
  const { matches, unmatchedTruth, unmatchedPredicted } = matchPossessions(truth, predicted)

  const precision = predicted.length > 0 ? matches.length / predicted.length : 0
  const recall = truth.length > 0 ? matches.length / truth.length : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  const startErrors = matches.map(m => Math.abs(m.truth.start - m.predicted.startTimestamp))
  const endErrors = matches.map(m => Math.abs(m.truth.end - m.predicted.endTimestamp))
  const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  const confusion: Record<string, Record<string, number>> = {}
  const outcomeMistakes: EvalReport['outcomeMistakes'] = []
  let comparable = 0
  let correct = 0
  let predictedUnknown = 0
  for (const m of matches) {
    if (TRUTH_ONLY_OUTCOMES.has(m.truth.outcome) || !COMPARABLE_OUTCOMES.has(m.truth.outcome)) continue
    comparable++
    const pred = m.predicted.outcome || 'unknown'
    confusion[m.truth.outcome] = confusion[m.truth.outcome] ?? {}
    confusion[m.truth.outcome][pred] = (confusion[m.truth.outcome][pred] ?? 0) + 1
    if (pred === 'unknown') predictedUnknown++
    if (pred === m.truth.outcome) correct++
    else outcomeMistakes.push({
      possession: m.truth.possession,
      start: m.truth.start,
      truthOutcome: m.truth.outcome,
      predictedOutcome: pred,
    })
  }

  let typeComparable = 0
  let typeCorrect = 0
  for (const m of matches) {
    if (m.truth.possessionType === '') continue
    typeComparable++
    if (m.truth.possessionType === m.predicted.possessionType) typeCorrect++
  }

  return {
    detection: {
      truthCount: truth.length,
      predictedCount: predicted.length,
      matched: matches.length,
      precision,
      recall,
      f1,
    },
    boundaries: {
      meanStartErrorSec: mean(startErrors),
      meanEndErrorSec: mean(endErrors),
      pctStartsWithin3s: startErrors.length > 0 ? startErrors.filter(e => e <= 3).length / startErrors.length : 0,
    },
    outcomes: {
      comparable,
      correct,
      accuracy: comparable > 0 ? correct / comparable : 0,
      predictedUnknown,
      confusion,
    },
    possessionTypes: {
      comparable: typeComparable,
      correct: typeCorrect,
      accuracy: typeComparable > 0 ? typeCorrect / typeComparable : 0,
    },
    misses: unmatchedTruth.map(t => ({ possession: t.possession, start: t.start, end: t.end, outcome: t.outcome })),
    hallucinations: unmatchedPredicted.map(p => ({
      possessionId: p.possessionId,
      start: p.startTimestamp,
      end: p.endTimestamp,
      outcome: p.outcome,
    })),
    outcomeMistakes,
  }
}

// ---------------------------------------------------------------------------
// Console formatting
// ---------------------------------------------------------------------------

function fmtTs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function formatReport(report: EvalReport): string {
  const d = report.detection
  const b = report.boundaries
  const o = report.outcomes
  const t = report.possessionTypes
  const lines: string[] = []

  lines.push('=== EVAL REPORT ===')
  lines.push('')
  lines.push('POSSESSION DETECTION')
  lines.push(`  truth: ${d.truthCount}   predicted: ${d.predictedCount}   matched: ${d.matched}`)
  lines.push(`  recall: ${pct(d.recall)} (found real possessions)   precision: ${pct(d.precision)} (predictions that were real)   F1: ${pct(d.f1)}`)
  lines.push('')
  lines.push('BOUNDARIES (matched possessions)')
  lines.push(`  mean start error: ${b.meanStartErrorSec.toFixed(1)}s   mean end error: ${b.meanEndErrorSec.toFixed(1)}s   starts within 3s: ${pct(b.pctStartsWithin3s)}`)
  lines.push('')
  lines.push('OUTCOMES (made / missed / turnover / defensive-stop)')
  lines.push(`  accuracy: ${pct(o.accuracy)} (${o.correct}/${o.comparable})   predicted "unknown": ${o.predictedUnknown}`)
  for (const truthOutcome of Object.keys(o.confusion).sort()) {
    const row = o.confusion[truthOutcome]
    const cells = Object.keys(row).sort().map(p => `${p}=${row[p]}`).join('  ')
    lines.push(`    truth ${truthOutcome.padEnd(15)} -> ${cells}`)
  }
  lines.push('')
  lines.push('POSSESSION TYPES')
  lines.push(t.comparable > 0
    ? `  accuracy: ${pct(t.accuracy)} (${t.correct}/${t.comparable} labeled rows)`
    : '  (no type labels in CSV — skipped)')

  if (report.misses.length > 0) {
    lines.push('')
    lines.push(`MISSED POSSESSIONS (${report.misses.length}) — in truth, not detected`)
    for (const m of report.misses) lines.push(`  #${m.possession}  ${fmtTs(m.start)}-${fmtTs(m.end)}  (${m.outcome || 'no outcome'})`)
  }
  if (report.hallucinations.length > 0) {
    lines.push('')
    lines.push(`HALLUCINATED POSSESSIONS (${report.hallucinations.length}) — detected, not in truth`)
    for (const h of report.hallucinations) lines.push(`  id ${h.possessionId}  ${fmtTs(h.start)}-${fmtTs(h.end)}  (${h.outcome})`)
  }
  if (report.outcomeMistakes.length > 0) {
    lines.push('')
    lines.push(`OUTCOME MISTAKES (${report.outcomeMistakes.length})`)
    for (const m of report.outcomeMistakes) lines.push(`  #${m.possession} @ ${fmtTs(m.start)}  truth=${m.truthOutcome}  predicted=${m.predictedOutcome}`)
  }
  lines.push('')
  return lines.join('\n')
}
