import type { PossessionResult } from './types'

export interface PhaseStats {
  label: string
  possessionCount: number
  avgImportance: number | null
  typeCounts: Record<string, number>
}

export interface TrendData {
  phases: PhaseStats[]
  typeTrends: {
    type: string
    counts: [number, number, number]
    trend: 'increasing' | 'decreasing' | 'stable'
  }[]
  topEvents: { type: string; count: number }[]
  totalPossessions: number
}

export function computeTrends(possessions: PossessionResult[]): TrendData {
  if (possessions.length === 0) {
    return { phases: [], typeTrends: [], topEvents: [], totalPossessions: 0 }
  }

  const PHASE_LABELS = ['1st Third', '2nd Third', '3rd Third']

  // Determine game time range
  const timestamps = possessions.map(p => p.startTimestamp)
  const minTs = Math.min(...timestamps)
  const maxTs = Math.max(...timestamps)
  const range = maxTs - minTs

  function getPhase(ts: number): 0 | 1 | 2 {
    if (range === 0) return 0
    const idx = Math.floor(((ts - minTs) / (range + 1)) * 3)
    return Math.min(idx, 2) as 0 | 1 | 2
  }

  // Build phase stats
  const phases: PhaseStats[] = PHASE_LABELS.map(label => ({
    label,
    possessionCount: 0,
    avgImportance: null,
    typeCounts: {},
  }))

  const importanceSums = [0, 0, 0]
  const importanceCounts = [0, 0, 0]

  for (const p of possessions) {
    const phase = getPhase(p.startTimestamp)
    phases[phase].possessionCount++
    phases[phase].typeCounts[p.possessionType] = (phases[phase].typeCounts[p.possessionType] ?? 0) + 1
    if (typeof p.importanceScore === 'number') {
      importanceSums[phase] += p.importanceScore
      importanceCounts[phase]++
    }
  }

  for (let i = 0; i < 3; i++) {
    phases[i].avgImportance = importanceCounts[i] > 0
      ? Math.round((importanceSums[i] / importanceCounts[i]) * 10) / 10
      : null
  }

  // Type totals + trend
  const typeTotalMap: Record<string, number> = {}
  for (const p of possessions) {
    typeTotalMap[p.possessionType] = (typeTotalMap[p.possessionType] ?? 0) + 1
  }

  const typeTrends = Object.entries(typeTotalMap)
    .filter(([, total]) => total >= 2)
    .map(([type, total]) => {
      const c0 = phases[0].typeCounts[type] ?? 0
      const c1 = phases[1].typeCounts[type] ?? 0
      const c2 = phases[2].typeCounts[type] ?? 0
      const trend: 'increasing' | 'decreasing' | 'stable' =
        c2 > c0 ? 'increasing' : c2 < c0 ? 'decreasing' : 'stable'
      return { type, counts: [c0, c1, c2] as [number, number, number], trend, total }
    })
    .sort((a, b) => b.total - a.total)
    .map(({ type, counts, trend }) => ({ type, counts, trend }))

  // Top events from possession.events[]
  const eventFreq: Record<string, number> = {}
  for (const p of possessions) {
    for (const ev of (p.events ?? [])) {
      eventFreq[ev.type] = (eventFreq[ev.type] ?? 0) + 1
    }
  }
  const topEvents = Object.entries(eventFreq)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return { phases, typeTrends, topEvents, totalPossessions: possessions.length }
}
