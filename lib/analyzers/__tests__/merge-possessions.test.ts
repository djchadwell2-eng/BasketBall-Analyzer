import { describe, it, expect } from 'vitest'
import { mergeFragmentedPossessions } from '../gemini-video-analyzer'
import type { PossessionSummary } from '../gemini-video-analyzer.types'

function poss(startTs: number, endTs: number, possessionType = 'half_court'): PossessionSummary {
  return { possessionId: 0, startTs, endTs, possessionType }
}

describe('mergeFragmentedPossessions', () => {
  it('collapses the screenshot case (154-157) into one possession', () => {
    // Four ~3s phase fragments back-to-back: transition -> half -> SLOB -> half
    const fragments = [
      poss(4397, 4400, 'transition'),
      poss(4400, 4403, 'half_court'),
      poss(4403, 4406, 'sideline_out_of_bounds'),
      poss(4406, 4409, 'half_court'),
    ]
    const merged = mergeFragmentedPossessions(fragments)
    expect(merged).toHaveLength(1)
    expect(merged[0].startTs).toBe(4397)
    expect(merged[0].endTs).toBe(4409)
  })

  it('does NOT merge two full-length possessions even with a tiny gap', () => {
    // e.g. a missed shot possession then a defensive-rebound possession
    const real = [poss(0, 12, 'half_court'), poss(13, 25, 'transition')]
    expect(mergeFragmentedPossessions(real)).toHaveLength(2)
  })

  it('does not merge fragments separated by a real gap (dead ball)', () => {
    const spaced = [poss(0, 3, 'transition'), poss(10, 13, 'half_court')]
    expect(mergeFragmentedPossessions(spaced)).toHaveLength(2)
  })

  it('stops merging before exceeding one plausible possession length', () => {
    // A long chain of contiguous 3s fragments must not collapse into one 45s blob
    const chain: PossessionSummary[] = []
    for (let t = 0; t < 45; t += 3) chain.push(poss(t, t + 3))
    const merged = mergeFragmentedPossessions(chain)
    expect(merged.length).toBeGreaterThan(1)
    for (const p of merged) expect(p.endTs - p.startTs).toBeLessThanOrEqual(40)
  })

  it('names the merged possession after its longest segment', () => {
    const frags = [poss(0, 3, 'transition'), poss(3, 18, 'pick_and_roll'), poss(18, 20, 'half_court')]
    const merged = mergeFragmentedPossessions(frags)
    expect(merged).toHaveLength(1)
    expect(merged[0].possessionType).toBe('pick_and_roll')
  })

  it('renumbers possessionId sequentially', () => {
    const merged = mergeFragmentedPossessions([poss(0, 12), poss(20, 32), poss(40, 52)])
    expect(merged.map(p => p.possessionId)).toEqual([0, 1, 2])
  })
})
