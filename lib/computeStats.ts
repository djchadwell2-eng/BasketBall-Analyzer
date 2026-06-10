import type { SequenceResult, PossessionResult } from './types'

export interface ComputedStats {
  playTypeFreq: { playType: string; count: number; timestamps: number[] }[]
  outcomeByType: {
    type: string
    total: number
    made: number
    missed: number
    turnover: number
    madeRate: number  // 0–1
  }[]
  totalPossessions: number
  avgImportanceScore: number | null
}

export function computeStats(
  sequences: SequenceResult[],
  possessions: PossessionResult[]
): ComputedStats {
  // Play type frequency from sequences (skip Unknown / Non-play)
  const playTypeMap = new Map<string, { count: number; timestamps: number[] }>()
  for (const seq of sequences) {
    const pt = seq.playType
    if (!pt || pt === 'Unknown' || pt === 'Non-play') continue
    if (!playTypeMap.has(pt)) playTypeMap.set(pt, { count: 0, timestamps: [] })
    const entry = playTypeMap.get(pt)!
    entry.count++
    entry.timestamps.push(seq.timestampStart)
  }
  const playTypeFreq = Array.from(playTypeMap.entries())
    .map(([playType, { count, timestamps }]) => ({ playType, count, timestamps }))
    .sort((a, b) => b.count - a.count)

  // Outcome rates by possession type (only types with ≥ 2 possessions)
  const outcomeMap = new Map<string, { total: number; made: number; missed: number; turnover: number }>()
  for (const pos of possessions) {
    const type = pos.possessionType
    if (!outcomeMap.has(type)) outcomeMap.set(type, { total: 0, made: 0, missed: 0, turnover: 0 })
    const entry = outcomeMap.get(type)!
    entry.total++
    const outcome = (pos.outcome ?? '').toLowerCase()
    if (outcome.includes('made') || outcome.includes('basket') || outcome.includes('score')) entry.made++
    else if (outcome.includes('missed') || outcome.includes('miss')) entry.missed++
    else if (outcome.includes('turnover') || outcome.includes(' to ') || outcome === 'to') entry.turnover++
  }
  const outcomeByType = Array.from(outcomeMap.entries())
    .filter(([, v]) => v.total >= 2)
    .map(([type, v]) => ({
      type,
      total: v.total,
      made: v.made,
      missed: v.missed,
      turnover: v.turnover,
      madeRate: v.total > 0 ? v.made / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Average importance score
  const scored = possessions.filter(p => typeof p.importanceScore === 'number')
  const avg = scored.length > 0
    ? scored.reduce((sum, p) => sum + (p.importanceScore ?? 0), 0) / scored.length
    : null

  return {
    playTypeFreq,
    outcomeByType,
    totalPossessions: possessions.length,
    avgImportanceScore: avg !== null ? Math.round(avg * 10) / 10 : null,
  }
}
