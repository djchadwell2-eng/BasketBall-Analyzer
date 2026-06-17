import { describe, it, expect } from 'vitest'
import { filterShortPossessions } from '../gemini-video-analyzer'
import type { PossessionSummary } from '../gemini-video-analyzer.types'

function poss(possessionId: number, startTs: number, endTs: number): PossessionSummary {
  return { possessionId, startTs, endTs, possessionType: 'half_court' }
}

describe('filterShortPossessions (pre-deep-pass <3s filter)', () => {
  it('drops only possessions shorter than 3s and keeps the rest', () => {
    const input = [
      poss(0, 0, 12),    // 12s keep
      poss(1, 12, 14),   // 2s  drop
      poss(2, 14, 28),   // 14s keep
      poss(3, 28, 29),   // 1s  drop
      poss(4, 30, 45),   // 15s keep
      poss(5, 45, 47.5), // 2.5s drop
      poss(6, 48, 60),   // 12s keep
      poss(7, 60, 70),   // 10s keep
    ]
    const { kept, dropped } = filterShortPossessions(input)

    // before/after: 8 -> 5, dropped 3
    expect(input.length).toBe(8)
    expect(kept.length).toBe(5)
    expect(dropped.length).toBe(3)
    expect(dropped.map(p => p.possessionId)).toEqual([1, 3, 5])
    expect(kept.map(p => p.possessionId)).toEqual([0, 2, 4, 6, 7])
  })

  it('keeps a possession exactly 3s long (boundary is exclusive)', () => {
    const { kept, dropped } = filterShortPossessions([poss(0, 0, 3)])
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(0)
  })

  it('returns everything when nothing is too short', () => {
    const input = [poss(0, 0, 10), poss(1, 10, 22)]
    const { kept, dropped } = filterShortPossessions(input)
    expect(kept).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })
})
