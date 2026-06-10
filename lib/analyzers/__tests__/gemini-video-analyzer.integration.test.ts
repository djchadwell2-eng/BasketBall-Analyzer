/**
 * Integration test for analyzeVideoWithGemini.
 *
 * Prerequisites to run:
 *   1. Set GEMINI_API_KEY in your environment or .env.local
 *   2. Set RUN_INTEGRATION=1 in your environment
 *   3. Place a short (~30s) basketball video at test/fixtures/sample.mp4
 *   4. ffmpeg must be installed and on PATH
 *
 * Run with:
 *   RUN_INTEGRATION=1 npm run test:analyzer:int
 */
import { describe, it, expect } from 'vitest'
import path from 'path'

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1'
const SAMPLE_VIDEO = path.resolve(process.cwd(), 'test/fixtures/sample.mp4')

describe.skipIf(!RUN_INTEGRATION)('analyzeVideoWithGemini (integration)', () => {
  it('returns a valid AnalysisResult shape for a real video', async () => {
    // Dynamic import so the module (and its env-var validation) only loads
    // when RUN_INTEGRATION is set and GEMINI_API_KEY is expected to be present
    const { analyzeVideoWithGemini } = await import('../gemini-video-analyzer')

    const result = await analyzeVideoWithGemini(SAMPLE_VIDEO)

    // Shape checks
    expect(result).toBeDefined()
    expect(typeof result.summary).toBe('string')
    expect(result.model).toBe('gemini-3.1-flash-lite')
    expect(typeof result.frameCount).toBe('number')

    expect(Array.isArray(result.sequences)).toBe(true)
    expect(Array.isArray(result.possessions)).toBe(true)
    expect(Array.isArray(result.chunkErrors)).toBe(true)

    // Stripped fields must be empty/null
    expect(result.strategicAdjustments).toEqual([])
    expect(result.rankedObservations).toEqual([])
    expect(result.patternInsights).toEqual([])
    expect(result.offensiveTendencies).toEqual([])
    expect(result.defensiveTendencies).toEqual([])
    expect(result.gameIdentity).toBeNull()

    // computedStats must be present and typed correctly
    expect(result.computedStats).toBeDefined()
    expect(typeof result.computedStats.totalPossessions).toBe('number')
    expect(Array.isArray(result.computedStats.playTypeFreq)).toBe(true)
    expect(Array.isArray(result.computedStats.outcomeByType)).toBe(true)

    // Possession structure check (if any were found)
    for (const p of result.possessions) {
      expect(typeof p.possessionId).toBe('number')
      expect(typeof p.possessionType).toBe('string')
      expect(typeof p.startTimestamp).toBe('number')
      expect(Array.isArray(p.events)).toBe(true)
    }

    // Sequence structure check
    for (const s of result.sequences) {
      expect(typeof s.sequenceIndex).toBe('number')
      expect(typeof s.timestampStart).toBe('number')
      expect(typeof s.playType).toBe('string')
    }
  }, 120_000) // 2-minute timeout for upload + processing + inference
})
